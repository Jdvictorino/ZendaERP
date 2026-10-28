import React from 'react';
import toast from 'react-hot-toast';
import { badgeClass } from '../../components/ui/Badge.jsx';

export const STATUS_META = {
  active: { label: 'Activa', tone: 'success' },
  trial: { label: 'En prueba', tone: 'info' },
  past_due: { label: 'Pago vencido', tone: 'warning' },
  suspended: { label: 'Suspendida', tone: 'warning' },
  blocked: { label: 'Bloqueada', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};
export const STATUS_OPTIONS = Object.keys(STATUS_META);

export const BLOCK_MODES = [
  { value: 'auto', label: 'Automático', help: 'Pago vencido: solo lectura. Suspendida o bloqueada: sin acceso.' },
  { value: 'write', label: 'Solo lectura', help: 'Si la empresa queda bloqueada, puede consultar pero no registrar nada.' },
  { value: 'hard', label: 'Bloqueo total', help: 'Si la empresa queda bloqueada, no puede entrar al sistema.' },
];

export const INVOICE_STATUS = {
  paid: { label: 'Pagada', tone: 'success' },
  partial: { label: 'Abono parcial', tone: 'warning' },
  pending: { label: 'Pendiente', tone: 'neutral' },
};

export const EVENT_LABELS = {
  status_changed: 'Cambio de estado',
  payment_registered: 'Pago registrado',
  platform_invoice_issued: 'Factura emitida',
  platform_receipt_issued: 'Recibo emitido',
  ota_enabled: 'Actualizaciones activadas',
  ota_disabled: 'Actualizaciones desactivadas',
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || 'Sin estado', tone: 'neutral' };
  return <span className={badgeClass(meta.tone)}>{meta.label}</span>;
}

export function TenantAvatar({ tenant, size = 'md' }) {
  const cls = size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';
  if (tenant.logoUrl) {
    return <img src={tenant.logoUrl} alt="" className={`${cls} rounded-lg object-cover border border-line shrink-0`} />;
  }
  return (
    <div className={`${cls} rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 flex items-center justify-center font-semibold shrink-0`}>
      {getInitials(tenant.name)}
    </div>
  );
}

/** Interruptor accesible, mismo estilo que los de Ajustes. */
export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 ${checked ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
    >
      <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** Etiqueta + control, con el texto de ayuda debajo. */
export function Field({ label, htmlFor, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-soft mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMoney(value, currency = 'DOP') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: currency || 'DOP', minimumFractionDigits: 2 }).format(amount);
}

export function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function getInitials(name) {
  if (!name) return 'EM';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

/** Texto de "vence en" para una fecha: "Vencida hace 3 d", "Hoy", "En 12 d". */
export function dueLabel(days) {
  if (days === null) return 'Sin fecha';
  if (days < 0) return `Vencida hace ${Math.abs(days)} d`;
  if (days === 0) return 'Vence hoy';
  return `En ${days} d`;
}

export function dueTone(days, status) {
  if (days === null) return 'neutral';
  if (days < 0 || status === 'blocked' || status === 'suspended') return 'danger';
  if (days <= 7) return 'warning';
  return 'neutral';
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const row = (label, value) => `
  <div style="margin-bottom:8px">
    <div style="color:#6b7280;font-size:12px">${label}</div>
    <div style="font-weight:600;font-size:13px">${escapeHtml(value)}</div>
  </div>`;

const section = (content) => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">${content}</div>`;

/** HTML de factura o recibo de suscripción, con estilos en línea: sirve para imprimir y para correo. */
export function buildDocumentHtml(kind, doc, tenant) {
  const isInvoice = kind === 'invoice';
  const title = isInvoice ? 'Factura de suscripción' : 'Recibo de pago';
  const body = isInvoice
    ? section(
      row('Número', doc.invoiceNumber)
      + row('Estado', INVOICE_STATUS[doc.status]?.label || doc.status)
      + row('Periodo', `${formatDate(doc.periodStart)} – ${formatDate(doc.periodEnd)}`)
      + row('Vencimiento', formatDate(doc.dueDate)),
    ) + section(
      row('Subtotal', formatMoney(doc.subtotal, doc.currency))
      + row('ITBIS', `${Number(doc.taxRate || 0).toFixed(2)}%`)
      + row('Pagado', formatMoney(doc.paidAmount, doc.currency))
      + row('Pendiente', formatMoney(doc.balance, doc.currency)),
    )
    : section(
      row('Recibo', doc.receiptNumber)
      + row('Fecha de pago', formatDateTime(doc.paidAt))
      + row('Método', doc.paymentMethod || '—')
      + row('Referencia', doc.reference || '—')
      + row('Factura asociada', doc.invoiceNumber || 'No asociada'),
    );
  const total = isInvoice ? formatMoney(doc.totalAmount, doc.currency) : formatMoney(doc.amount, tenant.currency || 'DOP');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;max-width:640px">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 4px">${title}</h1>
      <p style="color:#6b7280;font-size:12px;margin:0 0 18px">${escapeHtml(tenant.name)} · ${escapeHtml(tenant.email || 'Sin correo')}</p>
      ${body}
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="color:#6b7280;font-size:12px">${isInvoice ? 'Total facturado' : 'Monto recibido'}</div>
        <div style="font-size:20px;font-weight:700;color:#111827">${total}</div>
      </div>
      <p style="margin-top:16px;font-size:11px;color:#6b7280">Documento emitido por la plataforma Zenda ERP.</p>
    </div>`;
}

export function printDocument(title, html) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    toast.error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.');
    return;
  }
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="margin:24px">${html}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}
