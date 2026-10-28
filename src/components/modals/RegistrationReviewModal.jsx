import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AnimatedModal from '../common/AnimatedModal.jsx';

const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'number' && !Number.isFinite(value)) return '—';
    return String(value);
};

const Field = ({ label, value }) => (
    <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="text-sm font-medium text-ink break-words">{displayValue(value)}</p>
    </div>
);

const Section = ({ title, description, columns = 2, children }) => {
    const gridClass = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
    return (
        <section className="rounded-2xl border border-line bg-white/60 shadow-sm">
            <header className="border-b border-line px-4 py-3">
                <p className="text-sm font-semibold text-ink-soft">{title}</p>
                {description && <p className="text-xs text-slate-400">{description}</p>}
            </header>
            <div className={`grid gap-4 px-4 py-4 ${gridClass}`}>
                {children}
            </div>
        </section>
    );
};

export default function RegistrationReviewModal({ adminData = {}, companyData = {}, onBackToCompany, onBackToAdmin, onConfirm, onClose, isProcessing, onClear, progressStep = 0, progressMessage = '' }) {
    const adminAddress = adminData.address || {};
    const companyAddress = companyData.address || {};
    const soundSettings = companyData.notifications?.sound || {};
    const categoryDiscounts = useMemo(() => {
        const discounts = companyData.pricing?.categoryDiscounts || {};
        const keys = Object.keys(discounts);
        if (!keys.length) return [{ label: 'Sin categorías definidas', value: '—' }];
        return keys.map((key) => ({ label: key, value: `${discounts[key]}%` }));
    }, [companyData.pricing]);
    const cashRegisters = Array.isArray(companyData.cash?.registers) && companyData.cash.registers.length
        ? companyData.cash.registers
        : [{ id: '—', name: '—', enabled: '—' }];

    return (
        <AnimatedModal onClose={onClose}>
            {(close) => (
                <div className="w-full max-w-4xl">
                    <div className="relative rounded-3xl border border-line bg-surface shadow-2xl">
                        <header className="flex flex-col gap-4 border-b border-line px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.28em] text-brand-500">Resumen</p>
                                <h3 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Confirma los datos antes de crear la cuenta</h3>
                                <p className="mt-2 text-sm text-ink-muted">
                                    Verifica la información del administrador y la empresa. Puedes volver para editar o reiniciar el proceso en cualquier momento.
                                </p>
                            </div>
                            <button onClick={close} aria-label="Cerrar" aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                        </header>

                        <div className="space-y-6 px-6 py-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex items-center gap-4 rounded-2xl border border-line bg-slate-50/70 p-4">
                                    <ProfilePicture photoURL={adminData.photoURL} handleImageChange={() => {}} id="adminPreview" />
                                    <div className="space-y-1">
                                        <p className="text-lg font-semibold text-ink">
                                            {displayValue(`${adminData.firstName || ''} ${adminData.lastName || ''}`.trim())}
                                        </p>
                                        <p className="text-xs uppercase tracking-wide text-ink-muted">Administrador principal</p>
                                        <p className="text-xs text-slate-400">Será el responsable de gestionar la nueva instancia.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 rounded-2xl border border-line bg-slate-50/70 p-4">
                                    <ProfilePicture photoURL={companyData.logo} handleImageChange={() => {}} id="companyPreview" />
                                    <div className="space-y-1">
                                        <p className="text-lg font-semibold text-ink">{displayValue(companyData.name)}</p>
                                        <p className="text-xs uppercase tracking-wide text-ink-muted">Datos de la empresa</p>
                                        <p className="text-xs text-slate-400">Información fiscal y comercial para tus registros.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Section title="Administrador" description="Datos personales y laborales" columns={2}>
                                    <Field label="Nombres" value={adminData.firstName} />
                                    <Field label="Apellidos" value={adminData.lastName} />
                                    <Field label="Correo electrónico" value={adminData.email} />
                                    <Field label="Cargo" value={adminData.cargo} />
                                    <Field label="Género" value={adminData.gender} />
                                    <Field label="Identificación" value={adminData.idNumber} />
                                    <Field label="ID de empleado" value={adminData.employeeId} />
                                    <Field label="Empresa declarada" value={adminData.empresa} />
                                </Section>
                                <Section title="Contacto del administrador" description="Medios de contacto y dirección" columns={2}>
                                    <Field label="Teléfono" value={adminData.phone} />
                                    <Field label="Celular" value={adminData.cellphone} />
                                    <Field label="Calle" value={adminAddress.street} />
                                    <Field label="Sector" value={adminAddress.sector} />
                                    <Field label="Ciudad" value={adminAddress.city} />
                                    <Field label="Código postal" value={adminAddress.zipCode} />
                                    <Field label="País" value={adminAddress.country} />
                                </Section>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Section title="Empresa" description="Información comercial" columns={2}>
                                    <Field label="Nombre comercial" value={companyData.name} />
                                    <Field label="RNC" value={companyData.rnc} />
                                    <Field label="Teléfono" value={companyData.phone} />
                                    <Field label="Correo" value={companyData.email} />
                                    <Field label="Página web" value={companyData.website} />
                                    <Field label="Divisa principal" value={companyData.currency} />
                                    <Field label="Permite personalización" value={companyData.allowCustomization} />
                                    <Field label="Tema" value={companyData.theme} />
                                </Section>
                                <Section title="Dirección de la empresa" description="Ubicación fiscal" columns={2}>
                                    <Field label="Calle" value={companyAddress.street} />
                                    <Field label="Sector" value={companyAddress.sector} />
                                    <Field label="Ciudad" value={companyAddress.city} />
                                    <Field label="Código postal" value={companyAddress.zipCode} />
                                    <Field label="País" value={companyAddress.country} />
                                </Section>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Section title="Preferencias" description="Configuraciones generales" columns={2}>
                                    <Field label="Sonidos activos" value={soundSettings.enabled} />
                                    <Field label="Volumen de notificaciones" value={soundSettings.volume !== undefined ? `${Math.round((soundSettings.volume || 0) * 100)}%` : '—'} />
                                    <Field label="Categorías de clientes" value={companyData.customerCategories} />
                                    <Field label="Modo de impresión" value={companyData.cash?.printing?.mode} />
                                    <Field label="Impresora registrada" value={companyData.cash?.printing?.printerName} />
                                </Section>
                                <Section title="Caja y terminales" description="Parámetros de punto de venta" columns={1}>
                                    <Field label="Tolerancia de cierre" value={companyData.cash?.tolerance} />
                                    <Field label="Requiere supervisor si excede" value={companyData.cash?.requireSupervisorBeyondTolerance} />
                                    <Field label="Cantidad de terminales" value={Array.isArray(companyData.cash?.registers) ? companyData.cash.registers.length : 0} />
                                    {cashRegisters.map((register, index) => (
                                        <Field
                                            key={`${register.id || index}-${index}`}
                                            label={`Terminal ${index + 1}`}
                                            value={`ID: ${displayValue(register.id)} · Nombre: ${displayValue(register.name)} · Activo: ${displayValue(typeof register.enabled === 'boolean' ? (register.enabled ? 'Sí' : 'No') : register.enabled)}`}
                                        />
                                    ))}
                                </Section>
                            </div>

                            <Section title="Descuentos por categoría" description="Porcentajes aplicados a cada segmento" columns={2}>
                                {categoryDiscounts.map((entry, index) => (
                                    <Field key={`${entry.label}-${index}`} label={entry.label} value={entry.value} />
                                ))}
                            </Section>

                            <Section title="Datos bancarios" description="Información para transferencias y depósitos" columns={2}>
                                <Field label="Tipo de entidad" value={companyData.bankDetails?.entityType} />
                                <Field label="Banco" value={companyData.bankDetails?.bankName} />
                                <Field label="Beneficiario" value={companyData.bankDetails?.beneficiaryName} />
                                <Field label="ID del beneficiario" value={companyData.bankDetails?.beneficiaryId} />
                                <Field label="Tipo de cuenta" value={companyData.bankDetails?.accountType} />
                                <Field label="Número de cuenta" value={companyData.bankDetails?.accountNumber} />
                                <Field label="Correo bancario" value={companyData.bankDetails?.bankEmail} />
                            </Section>

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-4">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button onClick={onBackToAdmin} className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700 sm:w-auto">Editar administrador</button>
                                    <button onClick={onBackToCompany} className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700 sm:w-auto">Editar empresa</button>
                                    <button onClick={onClear} className="w-full rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-100 sm:w-auto">Cancelar y borrar todo</button>
                                </div>
                                <button
                                    onClick={onConfirm}
                                    disabled={isProcessing}
                                    className={`w-full rounded-lg px-5 py-3 text-sm font-semibold text-white transition-colors sm:w-auto ${isProcessing ? 'bg-brand-300 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'}`}
                                >
                                    {isProcessing ? 'Creando cuenta...' : 'Confirmar y crear cuenta'}
                                </button>
                            </div>
                        </div>

                        {isProcessing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-sm">
                                <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-xl">
                                    <p className="mb-4 text-sm font-semibold text-ink-soft">{progressMessage || 'Procesando...'}</p>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                        <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, (progressStep / 4) * 100)}%` }} />
                                    </div>
                                    <p className="mt-3 text-xs text-slate-400">Mantén la ventana abierta hasta finalizar.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </AnimatedModal>
    );
}
