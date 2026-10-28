import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock3, FileText, Loader2, Mail, Printer, Receipt, RefreshCw } from 'lucide-react';
import { platformBilling } from '../../api/client.js';
import Button from '../../components/ui/Button.jsx';
import Segmented from '../../components/ui/Segmented.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { badgeClass } from '../../components/ui/Badge.jsx';
import { confirmDialog } from '../../utils/confirmDialog.jsx';
import {
  BLOCK_MODES, EVENT_LABELS, INVOICE_STATUS, STATUS_META, STATUS_OPTIONS,
  Field, StatusBadge, Switch, TenantAvatar, buildDocumentHtml, daysUntil, dueLabel, dueTone,
  formatDate, formatDateTime, formatMoney, printDocument, toLocalDateTimeInput,
} from './shared.jsx';

const TABS = [
  { id: 'subscription', label: 'Suscripción' },
  { id: 'billing', label: 'Facturas y pagos' },
  { id: 'access', label: 'Módulos y actualizaciones' },
  { id: 'history', label: 'Historial' },
];

const PAYMENT_METHODS = ['Transferencia', 'Depósito', 'Efectivo', 'Tarjeta', 'Cheque'];
const HARD_STATUSES = ['suspended', 'blocked', 'cancelled'];
const ORDER_MODES = [
  { id: 'craft', label: 'Tienda', help: 'Ventas al detalle en punto de venta.' },
  { id: 'distributor', label: 'Distribuidor', help: 'Pedidos al por mayor, crédito y rutas de entrega.' },
];

const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
// Una fecha de <input type="date"> se guarda al mediodía local para que no cambie de día por la zona horaria
const dayToIso = (value) => new Date(`${value}T12:00:00`).toISOString();

export default function TenantDetail({ tenant, sessionToken, ownerEmail, plans, planId, onAssignPlan, onTenantUpdated, onBack }) {
  const [tab, setTab] = useState('subscription');
  const [documents, setDocuments] = useState(null);
  const [events, setEvents] = useState(null);
  const actor = `owner:${ownerEmail || 'unknown'}`;
  const plan = plans.find((p) => p.id === planId) || null;
  const days = daysUntil(tenant.billingDueDate);

  const loadDocuments = () => platformBilling.getDocuments(sessionToken, tenant.id)
    .then((r) => setDocuments(r?.data || { invoices: [], receipts: [] }))
    .catch((e) => { setDocuments({ invoices: [], receipts: [] }); toast.error(e.message || 'No se pudieron cargar las facturas'); });
  const loadEvents = () => platformBilling.getEvents(sessionToken, tenant.id)
    .then((r) => setEvents(r?.data || []))
    .catch((e) => { setEvents([]); toast.error(e.message || 'No se pudo cargar el historial'); });

  useEffect(() => { loadDocuments(); loadEvents(); }, [tenant.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink focus:outline-none focus-visible:underline">
        <ArrowLeft size={16} /> Empresas
      </button>

      <header className="card p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <TenantAvatar tenant={tenant} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-ink truncate">{tenant.name}</h2>
              <StatusBadge status={tenant.billingStatus} />
            </div>
            <p className="mt-0.5 text-sm text-ink-muted truncate">
              {[tenant.email, tenant.rnc && `RNC ${tenant.rnc}`, tenant.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-line">
          <Fact label="Vencimiento">
            {formatDate(tenant.billingDueDate)}
            {days !== null && <span className={`${badgeClass(dueTone(days, tenant.billingStatus), 'sm')} ml-2`}>{dueLabel(days)}</span>}
          </Fact>
          <Fact label="Último pago">{formatDate(tenant.lastPaymentAt)}</Fact>
          <Fact label="Plan">{plan ? `${plan.name} · ${formatMoney(plan.price)}` : 'Sin plan'}</Fact>
          <Fact label="Versión de la app">{tenant.appVersion ? `v${tenant.appVersion}` : 'Sin reporte'}</Fact>
        </dl>
      </header>

      <nav className="flex gap-1 border-b border-line overflow-x-auto" role="tablist" aria-label="Secciones de la empresa">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:text-ink ${tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'subscription' && (
          <SubscriptionTab tenant={tenant} sessionToken={sessionToken} actor={actor} plans={plans} planId={planId} onAssignPlan={onAssignPlan} onTenantUpdated={onTenantUpdated} onSaved={loadEvents} />
        )}
        {tab === 'billing' && (
          <BillingTab tenant={tenant} sessionToken={sessionToken} actor={actor} plan={plan} documents={documents} onChanged={() => { loadDocuments(); loadEvents(); onTenantUpdated(); }} />
        )}
        {tab === 'access' && (
          <AccessTab tenant={tenant} sessionToken={sessionToken} onTenantUpdated={onTenantUpdated} />
        )}
        {tab === 'history' && <HistoryTab events={events} onReload={loadEvents} />}
      </div>
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink flex items-center flex-wrap">{children}</dd>
    </div>
  );
}

function SubscriptionTab({ tenant, sessionToken, actor, plans, planId, onAssignPlan, onTenantUpdated, onSaved }) {
  const policy = tenant.billingPolicy || {};
  const [form, setForm] = useState(() => ({
    status: tenant.billingStatus || 'active',
    reason: tenant.billingBlockedReason || '',
    dueDate: toLocalDateTimeInput(tenant.billingDueDate),
    graceUntil: toLocalDateTimeInput(tenant.billingGraceUntil),
    blockMode: policy.blockMode || 'auto',
    graceDays: String(policy.graceDays ?? 5),
    reminderDays: (policy.reminderDays || [7, 3, 1]).join(', '),
    notes: '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  async function save(event) {
    event.preventDefault();
    if (HARD_STATUSES.includes(form.status) && form.status !== tenant.billingStatus) {
      const ok = await confirmDialog(`${tenant.name} quedará "${STATUS_META[form.status].label.toLowerCase()}" y sus usuarios perderán acceso según la política de cobro.`, { title: 'Cambiar estado de la empresa', confirmText: 'Cambiar estado' });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const result = await platformBilling.updateTenantStatus(sessionToken, tenant.id, {
        status: form.status,
        reason: form.reason || null,
        notes: form.notes || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        graceUntil: form.graceUntil ? new Date(form.graceUntil).toISOString() : null,
        billingPolicy: {
          blockMode: form.blockMode,
          graceDays: Number(form.graceDays || 0),
          reminderDays: form.reminderDays.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v >= 0),
        },
        actor,
      });
      toast.success('Suscripción actualizada');
      setForm((f) => ({ ...f, notes: '' }));
      onTenantUpdated(result?.company);
      onSaved();
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar la suscripción');
    } finally {
      setSaving(false);
    }
  }

  const mode = BLOCK_MODES.find((m) => m.value === form.blockMode);

  return (
    <form onSubmit={save} className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <section className="card p-5 space-y-4">
        <h3 className="text-base font-semibold text-ink">Estado de la cuenta</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Estado" htmlFor="sub-status">
            <select id="sub-status" value={form.status} onChange={set('status')} className="input-base">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </Field>
          <Field label="Motivo" htmlFor="sub-reason">
            <input id="sub-reason" value={form.reason} onChange={set('reason')} placeholder="Ej: pago de octubre pendiente" className="input-base" />
          </Field>
          <Field label="Vence el" htmlFor="sub-due">
            <input id="sub-due" type="datetime-local" value={form.dueDate} onChange={set('dueDate')} className="input-base" />
          </Field>
          <Field label="Gracia hasta" htmlFor="sub-grace" hint="Vacío: sin prórroga.">
            <input id="sub-grace" type="datetime-local" value={form.graceUntil} onChange={set('graceUntil')} className="input-base" />
          </Field>
        </div>
        <Field label="Plan" htmlFor="sub-plan" hint="Los planes se administran en la sección Planes.">
          <select id="sub-plan" value={planId || ''} onChange={(e) => onAssignPlan(e.target.value)} className="input-base">
            <option value="">Sin plan</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.cycle} · {formatMoney(p.price)}</option>)}
          </select>
        </Field>
      </section>

      <section className="card p-5 space-y-4">
        <h3 className="text-base font-semibold text-ink">Política de cobro</h3>
        <div>
          <p className="block text-sm font-medium text-ink-soft mb-1">Qué pasa si no paga</p>
          <Segmented label="Modo de bloqueo" options={BLOCK_MODES} value={form.blockMode} onChange={set('blockMode')} />
          <p className="mt-1.5 text-xs text-ink-muted">{mode?.help}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Días de gracia" htmlFor="sub-grace-days">
            <input id="sub-grace-days" type="number" min="0" max="365" value={form.graceDays} onChange={set('graceDays')} className="input-base tabular-nums" />
          </Field>
          <Field label="Avisar antes del vencimiento" htmlFor="sub-reminders" hint="Días separados por coma.">
            <input id="sub-reminders" value={form.reminderDays} onChange={set('reminderDays')} placeholder="7, 3, 1" className="input-base" />
          </Field>
        </div>
        <Field label="Nota interna" htmlFor="sub-notes" hint="Queda en el historial de la empresa.">
          <textarea id="sub-notes" rows={2} value={form.notes} onChange={set('notes')} className="input-base" />
        </Field>
      </section>

      <div className="xl:col-span-2 flex justify-end">
        <Button type="submit" disabled={saving} className="gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function BillingTab({ tenant, sessionToken, actor, plan, documents, onChanged }) {
  const invoices = documents?.invoices || [];
  const receipts = documents?.receipts || [];
  const openInvoices = invoices.filter((i) => Number(i.balance) > 0);

  const [invoice, setInvoice] = useState({ periodStart: isoDay(0), periodEnd: isoDay(30), dueDate: isoDay(7), subtotal: plan ? String(plan.price) : '', taxRate: '18', currency: 'DOP', notes: '' });
  const [payment, setPayment] = useState({ invoiceId: '', amount: '', method: 'Transferencia', reference: '' });
  const [busy, setBusy] = useState('');
  const setInv = (key) => (e) => setInvoice((f) => ({ ...f, [key]: e.target.value }));
  const setPay = (key) => (e) => setPayment((f) => ({ ...f, [key]: e.target.value }));

  const subtotal = Number(invoice.subtotal);
  const taxRate = Number(invoice.taxRate || 0);
  const invoiceTotal = Number.isFinite(subtotal) ? subtotal * (1 + taxRate / 100) : 0;

  async function issueInvoice(event) {
    event.preventDefault();
    if (invoice.periodEnd < invoice.periodStart) return toast.error('El periodo termina antes de empezar');
    if (!Number.isFinite(subtotal) || subtotal <= 0) return toast.error('Escribe un subtotal mayor que cero');
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return toast.error('El ITBIS debe estar entre 0 y 100');
    setBusy('invoice');
    try {
      await platformBilling.issueInvoice(sessionToken, tenant.id, {
        periodStart: dayToIso(invoice.periodStart),
        periodEnd: dayToIso(invoice.periodEnd),
        dueDate: dayToIso(invoice.dueDate),
        subtotal,
        taxRate,
        currency: invoice.currency,
        notes: invoice.notes || null,
        actor,
      });
      toast.success('Factura emitida');
      setInvoice((f) => ({ ...f, notes: '' }));
      onChanged();
    } catch (error) {
      toast.error(error.message || 'No se pudo emitir la factura');
    } finally {
      setBusy('');
    }
  }

  async function registerPayment(event) {
    event.preventDefault();
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Escribe un monto mayor que cero');
    setBusy('payment');
    try {
      await platformBilling.registerPayment(sessionToken, tenant.id, {
        amount,
        invoiceEventId: payment.invoiceId || null,
        paymentMethod: payment.method,
        reference: payment.reference || null,
        actor,
      });
      toast.success('Pago registrado. La empresa queda activa.');
      setPayment((f) => ({ ...f, invoiceId: '', amount: '', reference: '' }));
      onChanged();
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el pago');
    } finally {
      setBusy('');
    }
  }

  async function sendByEmail(kind, doc) {
    if (!tenant.email) return toast.error('La empresa no tiene correo registrado');
    const number = kind === 'invoice' ? doc.invoiceNumber : doc.receiptNumber;
    await toast.promise(platformBilling.sendEmail(sessionToken, {
      to: tenant.email,
      subject: `${kind === 'invoice' ? 'Factura de suscripción' : 'Recibo de pago'} Zenda ERP - ${number}`,
      html: buildDocumentHtml(kind, doc, tenant),
    }), { loading: 'Enviando correo…', success: `Enviado a ${tenant.email}`, error: 'No se pudo enviar el correo' }).catch(() => {});
  }

  const docActions = (kind, doc) => (
    <div className="flex justify-end gap-1">
      <IconAction label="Imprimir" icon={Printer} onClick={() => printDocument(kind === 'invoice' ? doc.invoiceNumber : doc.receiptNumber, buildDocumentHtml(kind, doc, tenant))} />
      <IconAction label="Enviar por correo" icon={Mail} onClick={() => sendByEmail(kind, doc)} />
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div className="xl:col-span-2 space-y-6">
        <section className="card overflow-hidden">
          <h3 className="px-5 py-4 border-b border-line text-base font-semibold text-ink">Facturas</h3>
          {!documents ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : invoices.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted bg-surface-muted border-b border-line">
                    <th scope="col" className="px-4 py-2 font-medium">Número</th>
                    <th scope="col" className="px-4 py-2 font-medium">Periodo</th>
                    <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right">Total</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right">Pendiente</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                      <td className="px-4 py-2.5"><span className={badgeClass(INVOICE_STATUS[inv.status]?.tone)}>{INVOICE_STATUS[inv.status]?.label || inv.status}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatMoney(inv.totalAmount, inv.currency)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${inv.balance > 0 ? 'font-semibold text-danger-600 dark:text-danger-400' : 'text-ink-muted'}`}>{formatMoney(inv.balance, inv.currency)}</td>
                      <td className="px-4 py-2.5">{docActions('invoice', inv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={FileText} title="Sin facturas" description="Emite la primera factura de suscripción con el formulario de la derecha." />}
        </section>

        <section className="card overflow-hidden">
          <h3 className="px-5 py-4 border-b border-line text-base font-semibold text-ink">Recibos de pago</h3>
          {!documents ? <div className="p-5"><Skeleton className="h-16 w-full" /></div> : receipts.length ? (
            <ul className="divide-y divide-line">
              {receipts.map((rec) => (
                <li key={rec.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{rec.receiptNumber}</p>
                    <p className="text-xs text-ink-muted">{formatDateTime(rec.paidAt)} · {rec.paymentMethod}{rec.invoiceNumber ? ` · ${rec.invoiceNumber}` : ''}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-ink whitespace-nowrap">{formatMoney(rec.amount)}</span>
                  {docActions('receipt', rec)}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Receipt} title="Sin pagos registrados" />}
        </section>
      </div>

      <div className="space-y-6">
        <form onSubmit={registerPayment} className="card p-5 space-y-4">
          <h3 className="text-base font-semibold text-ink">Registrar pago</h3>
          <Field label="Factura que paga" htmlFor="pay-invoice">
            <select
              id="pay-invoice"
              value={payment.invoiceId}
              onChange={(e) => {
                const inv = openInvoices.find((i) => i.id === e.target.value);
                setPayment((f) => ({ ...f, invoiceId: e.target.value, amount: inv ? String(inv.balance) : f.amount }));
              }}
              className="input-base"
            >
              <option value="">Pago sin factura</option>
              {openInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} · debe {formatMoney(i.balance, i.currency)}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monto" htmlFor="pay-amount">
              <input id="pay-amount" type="number" min="0" step="0.01" value={payment.amount} onChange={setPay('amount')} placeholder="0.00" className="input-base tabular-nums" required />
            </Field>
            <Field label="Método" htmlFor="pay-method">
              <select id="pay-method" value={payment.method} onChange={setPay('method')} className="input-base">
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Referencia" htmlFor="pay-ref">
            <input id="pay-ref" value={payment.reference} onChange={setPay('reference')} placeholder="Número de transferencia" className="input-base" />
          </Field>
          <p className="text-xs text-ink-muted">Al registrar el pago la empresa pasa a "Activa" y se emite un recibo.</p>
          <Button type="submit" className="w-full gap-2" disabled={busy === 'payment'}>
            {busy === 'payment' && <Loader2 size={16} className="animate-spin" />}
            Registrar pago
          </Button>
        </form>

        <form onSubmit={issueInvoice} className="card p-5 space-y-4">
          <h3 className="text-base font-semibold text-ink">Emitir factura</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Desde" htmlFor="inv-start"><input id="inv-start" type="date" value={invoice.periodStart} onChange={setInv('periodStart')} className="input-base" required /></Field>
            <Field label="Hasta" htmlFor="inv-end"><input id="inv-end" type="date" value={invoice.periodEnd} onChange={setInv('periodEnd')} className="input-base" required /></Field>
          </div>
          <Field label="Vence el" htmlFor="inv-due"><input id="inv-due" type="date" value={invoice.dueDate} onChange={setInv('dueDate')} className="input-base" required /></Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Subtotal" htmlFor="inv-subtotal" className="col-span-2">
              <input id="inv-subtotal" type="number" min="0" step="0.01" value={invoice.subtotal} onChange={setInv('subtotal')} placeholder="0.00" className="input-base tabular-nums" required />
            </Field>
            <Field label="Moneda" htmlFor="inv-currency">
              <select id="inv-currency" value={invoice.currency} onChange={setInv('currency')} className="input-base"><option>DOP</option><option>USD</option></select>
            </Field>
          </div>
          <Field label="ITBIS %" htmlFor="inv-tax"><input id="inv-tax" type="number" min="0" max="100" value={invoice.taxRate} onChange={setInv('taxRate')} className="input-base tabular-nums" /></Field>
          <div className="flex items-baseline justify-between pt-3 border-t border-line">
            <span className="text-sm text-ink-muted">Total</span>
            <span className="text-lg font-semibold text-ink tabular-nums">{formatMoney(invoiceTotal, invoice.currency)}</span>
          </div>
          <Button type="submit" variant="secondary" className="w-full gap-2" disabled={busy === 'invoice'}>
            {busy === 'invoice' && <Loader2 size={16} className="animate-spin" />}
            Emitir factura
          </Button>
        </form>
      </div>
    </div>
  );
}

function IconAction({ label, icon: Icon, onClick }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors">
      <Icon size={16} />
    </button>
  );
}

function AccessTab({ tenant, sessionToken, onTenantUpdated }) {
  const [modes, setModes] = useState(tenant.availableOrderModes?.length ? tenant.availableOrderModes : ['craft']);
  const [savingModes, setSavingModes] = useState(false);
  const [savingOta, setSavingOta] = useState(false);
  const modesChanged = [...modes].sort().join() !== [...(tenant.availableOrderModes || ['craft'])].sort().join();

  async function saveModes() {
    setSavingModes(true);
    try {
      const result = await platformBilling.updateOrderModes(sessionToken, tenant.id, modes);
      toast.success('Módulos guardados');
      onTenantUpdated(result?.company);
    } catch (error) {
      toast.error(error.message || 'No se pudieron guardar los módulos');
    } finally {
      setSavingModes(false);
    }
  }

  async function toggleOta(enabled) {
    setSavingOta(true);
    try {
      await platformBilling.setTenantUpdates(sessionToken, tenant.id, enabled);
      toast.success(enabled ? 'Recibirá las actualizaciones automáticamente' : 'Actualizaciones automáticas desactivadas');
      onTenantUpdated({ otaUpdates: enabled });
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar la opción');
    } finally {
      setSavingOta(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <section className="card p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Modos de pedido</h3>
          <p className="text-sm text-ink-muted">Qué modos puede usar la empresa. Debe quedar al menos uno.</p>
        </div>
        <div className="divide-y divide-line border border-line rounded-lg">
          {ORDER_MODES.map((m) => {
            const checked = modes.includes(m.id);
            return (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{m.label}</p>
                  <p className="text-xs text-ink-muted">{m.help}</p>
                </div>
                <Switch
                  label={m.label}
                  checked={checked}
                  disabled={checked && modes.length === 1}
                  onChange={(on) => setModes((cur) => (on ? [...cur, m.id] : cur.filter((x) => x !== m.id)))}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button onClick={saveModes} disabled={!modesChanged || savingModes} className="gap-2">
            {savingModes && <Loader2 size={16} className="animate-spin" />}
            Guardar módulos
          </Button>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-ink">Actualizaciones automáticas</h3>
            <p className="text-sm text-ink-muted">
              Si está activo, la app de escritorio de esta empresa descarga la versión publicada y se instala al cerrarse.
            </p>
          </div>
          <Switch label="Actualizaciones automáticas" checked={!!tenant.otaUpdates} disabled={savingOta} onChange={toggleOta} />
        </div>
        <dl className="grid grid-cols-2 gap-4 pt-4 border-t border-line">
          <Fact label="Versión instalada">{tenant.appVersion ? `v${tenant.appVersion}` : 'Sin reporte'}</Fact>
          <Fact label="Última consulta">{formatDateTime(tenant.appCheckedAt)}</Fact>
        </dl>
      </section>
    </div>
  );
}

function HistoryTab({ events, onReload }) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">Historial de la cuenta</h3>
        <Button variant="ghost" size="sm" onClick={onReload} className="gap-1.5"><RefreshCw size={14} /> Actualizar</Button>
      </header>
      {!events ? <div className="p-5 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : events.length ? (
        <ol className="divide-y divide-line">
          {events.map((ev) => (
            <li key={ev.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              <time className="text-xs text-ink-muted tabular-nums sm:w-44 shrink-0">{formatDateTime(ev.createdAt)}</time>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink">
                  {EVENT_LABELS[ev.eventType] || ev.eventType}
                  {ev.toStatus && ev.fromStatus !== ev.toStatus && (
                    <span className="font-normal text-ink-muted"> · {STATUS_META[ev.fromStatus]?.label || ev.fromStatus || '—'} → {STATUS_META[ev.toStatus]?.label || ev.toStatus}</span>
                  )}
                </p>
                {(ev.reason || ev.notes) && <p className="text-ink-muted">{[ev.reason, ev.notes].filter(Boolean).join(' · ')}</p>}
              </div>
              {ev.amount != null && <span className="tabular-nums font-medium text-ink">{formatMoney(ev.amount)}</span>}
            </li>
          ))}
        </ol>
      ) : <EmptyState icon={Clock3} title="Sin movimientos" description="Los cambios de estado, facturas y pagos aparecen aquí." />}
    </section>
  );
}
