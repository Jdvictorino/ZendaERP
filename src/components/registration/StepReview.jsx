import React from 'react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import { CheckCircle, Loader2 } from 'lucide-react';

const displayValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
};

const Field = ({ label, value }) => (
  <div className="space-y-0.5">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <p className="text-sm font-medium text-gray-800 break-words">{displayValue(value)}</p>
  </div>
);

const ReviewSection = ({ title, children, onEdit }) => (
  <div className="reg-section">
    <div className="reg-section-header flex items-center justify-between">
      <h3>{title}</h3>
      {onEdit && (
        <button type="button" onClick={onEdit}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
          Editar →
        </button>
      )}
    </div>
    <div className="reg-section-body grid grid-cols-2 sm:grid-cols-3 gap-4">
      {children}
    </div>
  </div>
);

export default function StepReview({
  adminData = {}, companyData = {},
  onBack, onBackToCompany, onConfirm, onClear,
  isProcessing, progressStep, progressMessage,
  animClass
}) {
  const adminAddr = adminData.address || {};
  const companyAddr = companyData.address || {};

  return (
    <div className={`space-y-6 ${animClass}`}>
      {/* Header */}
      <div className="reg-step-header">
        <p className="step-tag">Paso 3 de 3</p>
        <h2>Confirma los Datos</h2>
        <p>Revisa la información antes de crear tu cuenta. Puedes volver a editar cualquier sección.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <ProfilePicture photoURL={adminData.photoURL} handleImageChange={() => {}} id="reviewAdmin" />
          <div>
            <p className="font-semibold text-gray-900">
              {[adminData.firstName, adminData.lastName].filter(Boolean).join(' ') || '—'}
            </p>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">Administrador</p>
            <p className="text-xs text-gray-500 mt-0.5">{adminData.email || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <ProfilePicture photoURL={companyData.logo} handleImageChange={() => {}} id="reviewCompany" />
          <div>
            <p className="font-semibold text-gray-900">{companyData.name || '—'}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">Empresa</p>
            <p className="text-xs text-gray-500 mt-0.5">{companyData.rnc ? `RNC: ${companyData.rnc}` : 'Sin RNC'}</p>
          </div>
        </div>
      </div>

      {/* Admin details */}
      <ReviewSection title="Administrador" onEdit={onBack}>
        <Field label="Nombres" value={adminData.firstName} />
        <Field label="Apellidos" value={adminData.lastName} />
        <Field label="Correo" value={adminData.email} />
        <Field label="Cargo" value={adminData.cargo} />
        <Field label="Género" value={adminData.gender} />
        <Field label="Identificación" value={adminData.idNumber} />
        <Field label="Teléfono" value={adminData.phone} />
        <Field label="Celular" value={adminData.cellphone} />
        <Field label="Ciudad" value={adminAddr.city} />
      </ReviewSection>

      {/* Company details */}
      <ReviewSection title="Empresa" onEdit={onBackToCompany}>
        <Field label="Nombre" value={companyData.name} />
        <Field label="RNC" value={companyData.rnc} />
        <Field label="Teléfono" value={companyData.phone} />
        <Field label="Correo" value={companyData.email} />
        <Field label="Moneda" value={companyData.currency} />
        <Field label="Ciudad" value={companyAddr.city} />
      </ReviewSection>

      {/* Progress overlay when processing */}
      {isProcessing && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-6 text-center">
          <Loader2 className="mx-auto animate-spin text-indigo-500 mb-3" size={32} />
          <p className="text-sm font-semibold text-indigo-800">{progressMessage || 'Procesando...'}</p>
          <div className="mt-4 h-2 w-full rounded-full bg-indigo-200 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, (progressStep / 3) * 100)}%` }} />
          </div>
          <p className="text-xs text-indigo-400 mt-2">Mantén la ventana abierta hasta finalizar.</p>
        </div>
      )}

      {/* Actions — footer is rendered by RegistrationFlow, but we expose the confirm button here */}
      <button type="button" id="step-review-confirm" className="hidden" onClick={onConfirm} />
    </div>
  );
}
