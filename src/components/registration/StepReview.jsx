import React from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { Section, StepHeader } from './FormParts.jsx';
import { GENDERS, businessTypeLabel } from './validation.js';

const show = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v));
const addressLine = (a = {}) => [a.street, a.sector, a.city, a.country].filter(s => s && s.trim()).join(', ');

function Item({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink break-words">{show(value)}</dd>
    </div>
  );
}

function EditButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40">
      <Pencil size={14} aria-hidden="true" /> Editar
    </button>
  );
}

export default function StepReview({
  adminData = {}, companyData = {}, onBack, onBackToCompany,
  isProcessing, progressStep, progressMessage, animClass,
}) {
  return (
    <div className={`space-y-6 ${animClass}`}>
      <StepHeader step={3} title="Revisa y confirma">
        Si algo está mal, edítalo antes de crear la cuenta. Tu prueba gratis empieza al confirmar.
      </StepHeader>

      <Section title="Tu negocio" action={<EditButton onClick={onBackToCompany} label="Editar los datos del negocio" />}>
        <div className="flex items-start gap-4">
          {companyData.logo && <img src={companyData.logo} alt="" className="w-14 h-14 rounded-lg object-cover border border-line" />}
          <dl className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Item label="Nombre comercial" value={companyData.name} />
            <Item label="RNC" value={companyData.rnc} />
            <Item label="Tipo de negocio" value={businessTypeLabel(companyData.businessType)} />
            <Item label="Moneda" value={companyData.currency} />
            <Item label="Teléfono" value={companyData.phone} />
            <Item label="Correo" value={companyData.email} />
            <Item label="Dirección fiscal" value={addressLine(companyData.address)} wide />
          </dl>
        </div>
      </Section>

      <Section title="Administrador" action={<EditButton onClick={onBack} label="Editar los datos del administrador" />}>
        <div className="flex items-start gap-4">
          {adminData.photoURL && <img src={adminData.photoURL} alt="" className="w-14 h-14 rounded-full object-cover border border-line" />}
          <dl className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Item label="Nombre" value={[adminData.firstName, adminData.lastName].filter(Boolean).join(' ')} />
            <Item label="Correo de acceso" value={adminData.email} />
            <Item label="Cargo" value={adminData.cargo} />
            <Item label="Permisos" value="Acceso total" />
            <Item label="Cédula o pasaporte" value={adminData.idNumber} />
            <Item label="Género" value={GENDERS[adminData.gender] || adminData.gender} />
            <Item label="Celular" value={adminData.cellphone} />
            <Item label="Teléfono fijo" value={adminData.phone} />
          </dl>
        </div>
      </Section>

      {isProcessing && (
        <div className="card p-5" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-brand-600 shrink-0" size={20} aria-hidden="true" />
            <p className="text-sm font-medium text-ink">{progressMessage || 'Creando tu cuenta…'}</p>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-surface-muted dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${Math.min(100, (progressStep / 3) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">No cierres esta ventana hasta que termine.</p>
        </div>
      )}
    </div>
  );
}
