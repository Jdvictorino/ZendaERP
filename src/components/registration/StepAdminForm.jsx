import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, User } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AddressFields from '../common/AddressFields.jsx';
import { calcPasswordStrength, isPasswordStrong } from '../../utils/password.js';

const PWD_COLORS = ['bg-red-500', 'bg-red-400', 'bg-yellow-400', 'bg-yellow-300', 'bg-emerald-400', 'bg-emerald-500'];
const PWD_LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Muy fuerte'];

const criteria = [
  { label: 'Mínimo 8 caracteres',       test: (p) => p.length >= 8 },
  { label: 'Al menos una mayúscula',    test: (p) => /[A-Z]/.test(p) },
  { label: 'Al menos una minúscula',    test: (p) => /[a-z]/.test(p) },
  { label: 'Al menos un número',        test: (p) => /[0-9]/.test(p) },
  { label: 'Al menos un símbolo',       test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function StepAdminForm({ initialData = {}, companyName = '', onNext, animClass }) {
  const [form, setForm] = useState({
    photoURL: '', firstName: '', lastName: '', idNumber: '', gender: 'M',
    cargo: 'Administrador', empresa: companyName,
    address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
    phone: '', cellphone: '', email: '', password: '', confirmPassword: '',
    ...initialData,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdStrength, setPwdStrength] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => { setPwdStrength(calcPasswordStrength(form.password)); }, [form.password]);
  useEffect(() => { if (companyName) setForm(p => ({ ...p, empresa: companyName })); }, [companyName]);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const handleChange = (e) => set(e.target.name, e.target.value);
  const handleAddress = (e) => setForm(p => ({ ...p, address: { ...p.address, [e.target.name]: e.target.value } }));
  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        callback(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handlePhoto = (e) => {
    if (e.target.files?.[0]) {
      compressImage(e.target.files[0], (dataUrl) => setForm(p => ({ ...p, photoURL: dataUrl })));
    }
  };

  const pwdMatch = form.password === form.confirmPassword && form.confirmPassword.length > 0;
  const canSubmit = form.email && form.firstName && form.lastName && form.password &&
    pwdMatch && isPasswordStrong(form.password, 3);

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onNext(form);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${animClass}`} noValidate>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">Paso 1 de 3</p>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Datos del Administrador</h2>
        <p className="text-sm text-gray-500 mt-1">El administrador tendrá acceso total al sistema. Completa todos los campos requeridos.</p>
      </div>

      {/* Foto + Datos Personales */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Información Personal</h3></div>
          <div className="p-5">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Foto */}
            <div className="flex flex-col items-center gap-2 md:w-36 flex-shrink-0">
              <ProfilePicture photoURL={form.photoURL} handleImageChange={handlePhoto} id="adminPhoto" />
              <p className="text-xs text-gray-400 text-center">Foto de perfil<br/>(opcional)</p>
            </div>
            {/* Campos */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombres <span className="text-red-500">*</span></label>
                <input name="firstName" value={form.firstName} onChange={handleChange}
                  className="input-base" placeholder="Ej: Juan Carlos" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Apellidos <span className="text-red-500">*</span></label>
                <input name="lastName" value={form.lastName} onChange={handleChange}
                  className="input-base" placeholder="Ej: Pérez García" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Cédula / Pasaporte</label>
                <input name="idNumber" value={form.idNumber} onChange={handleChange}
                  className="input-base" placeholder="000-0000000-0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Género</label>
                <select name="gender" value={form.gender} onChange={handleChange} className="input-base">
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="otro">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Cargo</label>
                <input name="cargo" value={form.cargo} onChange={handleChange}
                  className="input-base" placeholder="Administrador" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Empresa</label>
                <input name="empresa" value={form.empresa} readOnly
                  className="input-base bg-gray-50 text-gray-500 cursor-not-allowed" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dirección */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Dirección</h3></div>
          <div className="p-5">
          <AddressFields address={form.address} onChange={handleAddress} />
        </div>
      </div>

      {/* Contacto */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Contacto</h3></div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="reg-label">Teléfono</label>
            <input name="phone" value={form.phone} onChange={handleChange}
              className="input-base" placeholder="809-000-0000" />
          </div>
          <div>
            <label className="reg-label">Celular</label>
            <input name="cellphone" value={form.cellphone} onChange={handleChange}
              className="input-base" placeholder="849-000-0000" />
          </div>
        </div>
      </div>

      {/* Credenciales */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Credenciales de Acceso</h3></div>
          <div className="p-5 space-y-4">
          <div>
            <label className="reg-label">Correo electrónico <span className="text-red-500">*</span></label>
            <input type="email" name="email" value={form.email} onChange={handleChange}
              className="input-base" placeholder="admin@empresa.com" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="reg-label">Contraseña <span className="text-red-500">*</span></label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} name="password"
                  value={form.password} onChange={(e) => { handleChange(e); setTouched(true); }}
                  className="input-base pr-10" placeholder="Mínimo 8 caracteres" required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Strength bar */}
              <div className="pwd-bar">
                <div className={`pwd-bar-fill ${PWD_COLORS[pwdStrength] || 'bg-gray-200'}`}
                  style={{ width: `${(pwdStrength / 5) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{PWD_LABELS[Math.max(0, pwdStrength - 1)] || 'Muy débil'}</p>
            </div>
            <div>
              <label className="reg-label">Confirmar contraseña <span className="text-red-500">*</span></label>
              <div className="relative">
                <input type={showConfirmPwd ? 'text' : 'password'} name="confirmPassword"
                  value={form.confirmPassword} onChange={handleChange}
                  className="input-base pr-10" placeholder="Repite la contraseña" required />
                <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {form.confirmPassword.length > 0 && (
                  <span className={`absolute right-9 top-1/2 -translate-y-1/2 font-bold text-sm ${pwdMatch ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pwdMatch ? '✓' : '✕'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Criteria list */}
          {touched && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
              {criteria.map((c) => (
                <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.test(form.password) ? 'text-emerald-600' : 'text-gray-400'}`}>
                  <span className="text-base leading-none">{c.test(form.password) ? '●' : '○'}</span>
                  {c.label}
                </li>
              ))}
              <li className={`flex items-center gap-1.5 text-xs ${pwdMatch ? 'text-emerald-600' : 'text-gray-400'}`}>
                <span className="text-base leading-none">{pwdMatch ? '●' : '○'}</span>
                Las contraseñas coinciden
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Footer is rendered by RegistrationFlow */}
      <button type="submit" id="step-admin-submit" className="hidden" />
    </form>
  );
}
