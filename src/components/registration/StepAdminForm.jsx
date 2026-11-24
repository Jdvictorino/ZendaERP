import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import { CARGO_OPTIONS } from '../../utils/permissions.js';
import { calcPasswordStrength, checkPasswordCriteria } from '../../utils/password.js';
import { compressImage } from '../../utils/compressImage.js';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AddressFields from '../common/AddressFields.jsx';
import { Section, Field, StepHeader, focusFirstError } from './FormParts.jsx';
import { validateAdmin, GENDERS } from './validation.js';

const STRENGTH = [
  { label: 'Muy débil', color: 'bg-danger-500' },
  { label: 'Débil', color: 'bg-danger-500' },
  { label: 'Aceptable', color: 'bg-warning-500' },
  { label: 'Buena', color: 'bg-warning-500' },
  { label: 'Fuerte', color: 'bg-success-500' },
  { label: 'Muy fuerte', color: 'bg-success-500' },
];
const CRITERIA = [
  ['minLength', 'Mínimo 8 caracteres'], ['hasUpper', 'Una mayúscula'], ['hasLower', 'Una minúscula'],
  ['hasNumber', 'Un número'], ['hasSymbol', 'Un símbolo'],
];

function PasswordInput({ show, onToggle, ...props }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className="input-base pr-10" {...props} />
      <button type="button" onClick={onToggle} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 px-3 text-ink-muted hover:text-ink">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function StepAdminForm({ initialData = {}, companyName = '', onNext, animClass }) {
  const [form, setForm] = useState({
    photoURL: '', firstName: '', lastName: '', idNumber: '', gender: 'otro',
    cargo: 'Propietario',
    address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
    phone: '', cellphone: '', email: '', password: '', confirmPassword: '',
    ...initialData,
  });
  const [errors, setErrors] = useState({});
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Corrige al vuelo solo los campos que ya marcaron error
  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const now = validateAdmin(form);
    setErrors(prev => Object.fromEntries(Object.keys(prev).filter(k => now[k]).map(k => [k, now[k]])));
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleAddress = (e) => setForm(p => ({ ...p, address: { ...p.address, [e.target.name]: e.target.value } }));
  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (file) compressImage(file).then(url => setForm(p => ({ ...p, photoURL: url }))).catch(() => toast.error('No se pudo leer la imagen.'));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const found = validateAdmin(form);
    setErrors(found);
    if (Object.keys(found).length) { focusFirstError(e.currentTarget, found); return; }
    onNext(form);
  };

  const strength = calcPasswordStrength(form.password);
  const checks = checkPasswordCriteria(form.password || '');

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${animClass}`} noValidate>
      <StepHeader step={1} title="Tu cuenta de administrador">
        Con este usuario entras al sistema y tienes acceso a todo. Después puedes agregar a tu equipo con permisos más limitados.
      </StepHeader>

      <Section title="Datos personales">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex flex-col items-center gap-2 md:w-32 shrink-0">
            <ProfilePicture photoURL={form.photoURL} handleImageChange={handlePhoto} id="adminPhoto" />
            <p className="text-xs text-ink-muted text-center">Foto (opcional)</p>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="reg-firstName" label="Nombres" required error={errors.firstName}>
              <input name="firstName" value={form.firstName} onChange={handleChange} className="input-base" autoComplete="given-name" placeholder="Juan Carlos" />
            </Field>
            <Field id="reg-lastName" label="Apellidos" required error={errors.lastName}>
              <input name="lastName" value={form.lastName} onChange={handleChange} className="input-base" autoComplete="family-name" placeholder="Pérez García" />
            </Field>
            <Field id="reg-idNumber" label="Cédula o pasaporte" optional error={errors.idNumber}>
              <input name="idNumber" value={form.idNumber} onChange={handleChange} className="input-base" placeholder="001-0000000-1" />
            </Field>
            <Field id="reg-gender" label="Género">
              <select name="gender" value={form.gender} onChange={handleChange} className="input-base">
                {Object.entries(GENDERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field id="reg-cargo" label="Cargo" hint={companyName ? `En ${companyName}` : undefined}>
              <input name="cargo" list="admin-cargo-options" value={form.cargo} onChange={handleChange} className="input-base" maxLength={60} placeholder="Propietario" />
            </Field>
            <datalist id="admin-cargo-options">{CARGO_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
      </Section>

      <Section title="Contacto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="reg-cellphone" label="Celular" optional error={errors.cellphone}>
            <input name="cellphone" type="tel" value={form.cellphone} onChange={handleChange} className="input-base" autoComplete="tel" inputMode="tel" placeholder="849-000-0000" />
          </Field>
          <Field id="reg-phone" label="Teléfono fijo" optional error={errors.phone}>
            <input name="phone" type="tel" value={form.phone} onChange={handleChange} className="input-base" inputMode="tel" placeholder="809-000-0000" />
          </Field>
        </div>
      </Section>

      <Section title="Dirección" description="Opcional. Sirve para tu perfil; la dirección fiscal va en el paso siguiente.">
        <AddressFields address={form.address} onChange={handleAddress} title={null} idPrefix="admin-addr" />
      </Section>

      <Section title="Acceso" description="Usarás este correo y esta contraseña para entrar.">
        <div className="space-y-4">
          <Field id="reg-email" label="Correo electrónico" required error={errors.email}>
            <input name="email" type="email" value={form.email} onChange={handleChange} className="input-base" autoComplete="email" placeholder="tunombre@empresa.com" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field id="reg-password" label="Contraseña" required error={errors.password}>
                <PasswordInput name="password" value={form.password} onChange={handleChange} autoComplete="new-password"
                  show={showPwd} onToggle={() => setShowPwd(v => !v)} />
              </Field>
              {form.password && (
                <div className="mt-2" aria-live="polite">
                  <div className="h-1.5 rounded-full bg-surface-muted dark:bg-gray-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${STRENGTH[strength].color}`} style={{ width: `${(strength / 5) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">Seguridad: {STRENGTH[strength].label}</p>
                </div>
              )}
            </div>
            <Field id="reg-confirmPassword" label="Repite la contraseña" required error={errors.confirmPassword}>
              <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password"
                show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
            </Field>
          </div>
          {form.password && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
              {CRITERIA.map(([key, label]) => (
                <li key={key} className={`flex items-center gap-1.5 text-xs ${checks[key] ? 'text-success-700 dark:text-success-400' : 'text-ink-muted'}`}>
                  {checks[key] ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* El botón del pie (RegistrationFlow) envía este formulario */}
      <button type="submit" id="step-admin-submit" className="hidden" />
    </form>
  );
}
