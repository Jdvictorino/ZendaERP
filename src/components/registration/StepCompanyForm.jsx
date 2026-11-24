import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AddressFields from '../common/AddressFields.jsx';
import { compressImage } from '../../utils/compressImage.js';
import { Section, Field, StepHeader, focusFirstError } from './FormParts.jsx';
import { validateCompany, BUSINESS_TYPES } from './validation.js';

const CURRENCIES = [
  { value: 'DOP', label: 'Peso dominicano (DOP)' },
  { value: 'USD', label: 'Dólar estadounidense (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

export default function StepCompanyForm({ initialData = {}, onNext, animClass }) {
  const [form, setForm] = useState(() => ({
    name: '', rnc: '', phone: '', email: '', currency: 'DOP', businessType: 'otro', logo: '',
    ...initialData,
    address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana', ...(initialData.address || {}) },
  }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const now = validateCompany(form);
    setErrors(prev => Object.fromEntries(Object.keys(prev).filter(k => now[k]).map(k => [k, now[k]])));
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleAddress = (e) => setForm(p => ({ ...p, address: { ...p.address, [e.target.name]: e.target.value } }));
  const handleLogo = (e) => {
    const file = e.target.files?.[0];
    if (file) compressImage(file).then(url => setForm(p => ({ ...p, logo: url }))).catch(() => toast.error('No se pudo leer la imagen.'));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const found = validateCompany(form);
    setErrors(found);
    if (Object.keys(found).length) { focusFirstError(e.currentTarget, found); return; }
    onNext(form);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${animClass}`} noValidate>
      <StepHeader step={2} title="Tu negocio">
        Estos datos salen en tus facturas y comprobantes. Puedes cambiarlos luego en Configuración.
      </StepHeader>

      <Section title="Identidad del negocio">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex flex-col items-center gap-2 md:w-32 shrink-0">
            <ProfilePicture photoURL={form.logo} handleImageChange={handleLogo} id="companyLogo" />
            <p className="text-xs text-ink-muted text-center">Logo (opcional)</p>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="reg-name" label="Nombre comercial" required error={errors.name} className="sm:col-span-2">
              <input name="name" value={form.name} onChange={handleChange} className="input-base" autoComplete="organization" placeholder="Colmado La Esquina" />
            </Field>
            <Field id="reg-rnc" label="RNC" optional error={errors.rnc} hint="Necesario para emitir comprobantes con valor fiscal.">
              <input name="rnc" value={form.rnc} onChange={handleChange} className="input-base tabular-nums" inputMode="numeric" placeholder="1-01-00000-1" />
            </Field>
            <Field id="reg-currency" label="Moneda principal">
              <select name="currency" value={form.currency} onChange={handleChange} className="input-base">
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field id="reg-businessType" label="Tipo de negocio" required className="sm:col-span-2"
              hint="Define cómo empieza el sistema; luego puedes activar el otro modo en Configuración.">
              <select name="businessType" value={form.businessType} onChange={handleChange} className="input-base">
                {BUSINESS_TYPES.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Contacto del negocio">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="reg-company-phone" label="Teléfono" optional error={errors.phone}>
            <input name="phone" type="tel" value={form.phone} onChange={handleChange} className="input-base" inputMode="tel" placeholder="809-000-0000" />
          </Field>
          <Field id="reg-company-email" label="Correo del negocio" optional error={errors.email}>
            <input name="email" type="email" value={form.email} onChange={handleChange} className="input-base" placeholder="ventas@empresa.com" />
          </Field>
        </div>
      </Section>

      <Section title="Dirección fiscal" description="La que aparece en tus facturas.">
        <AddressFields address={form.address} onChange={handleAddress} title={null} idPrefix="company-addr" />
      </Section>

      {/* El botón del pie (RegistrationFlow) envía este formulario */}
      <button type="submit" id="step-company-submit" className="hidden" />
    </form>
  );
}
