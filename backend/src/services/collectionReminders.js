// Copia de src/utils/collectionReminders.js — mantener iguales (test/collectionReminders.spec.js prueba ambas)
// Recordatorios de cobro: reglas, validación, qué recordar hoy y texto del correo.
import { installmentsOf, diffDays } from './paymentTerms.js';

const VOID_STATUSES = ['Anulado', 'Cancelado'];
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEFAULT_REMINDERS = {
  auto: false,
  autoHour: 9,
  stages: [-3, 0, 7, 15],
  subject: 'Recordatorio de pago: factura {factura}',
  body:
    'Estimado/a {cliente}:\n\n' +
    'Le recordamos que la factura {factura} por {monto} vence {dias} ({vence}). Su saldo pendiente es {saldo}.\n\n' +
    'Si ya realizó el pago, por favor ignore este mensaje.\n\n' +
    'Gracias,\n{empresa}\nTel.: {telefono}\nCorreo: {correo}',
};

export const remindersOf = (settings) => {
  const own = settings?.collectionReminders || {};
  return { ...DEFAULT_REMINDERS, ...own, stages: [...(Array.isArray(own.stages) ? own.stages : DEFAULT_REMINDERS.stages)] };
};

export const validateReminders = (r) => {
  const stages = r?.stages;
  if (!Array.isArray(stages) || !stages.length) return 'Indique al menos una etapa de recordatorio';
  if (stages.some((s) => typeof s !== 'number' || !Number.isInteger(s) || s < -60 || s > 365))
    return 'Las etapas deben ser números enteros entre -60 y 365 días';
  if (new Set(stages).size !== stages.length) return 'Hay etapas repetidas';
  if (!String(r.subject || '').trim()) return 'El asunto no puede estar vacío';
  if (!String(r.body || '').trim()) return 'El mensaje no puede estar vacío';
  if (typeof r.autoHour !== 'number' || !Number.isInteger(r.autoHour) || r.autoHour < 0 || r.autoHour > 23)
    return 'La hora del envío automático debe ser un entero entre 0 y 23';
  return null;
};

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

export const stageLabel = (n) => (n < 0 ? `${-n} días antes` : n === 0 ? 'vence hoy' : `${n} días de atraso`);

// Día de RD (UTC-4 fijo) de una marca de tiempo.
const rdDay = (ts) => new Date(new Date(ts).getTime() - 4 * 3600e3).toISOString().slice(0, 10);

// Una fila por factura: la cuota pendiente más vieja cuya etapa vigente aún no se envió.
export const remindersDue = (invoices, { today, rules, sent = [] }) => {
  const stages = [...rules.stages].sort((a, b) => a - b);
  const rows = [];
  for (const inv of invoices) {
    const c = inv.customer;
    if (VOID_STATUSES.includes(inv.status) || c?.remindersOff) continue;
    const mine = sent.filter((x) => x.invoiceId === inv.id);
    if (mine.some((x) => x.status === 'sent' && rdDay(x.createdAt) === today)) continue;
    const pending = installmentsOf(inv, today).filter((x) => x.remaining > 0.01);
    const balance = round2(pending.reduce((s, x) => s + x.remaining, 0));
    if (balance <= 0.01) continue;
    for (const ins of pending) {
      const late = diffDays(today, ins.dueDate);
      const stage = stages.filter((s) => s <= late).pop();
      if (stage === undefined) continue;
      const same = (x) => x.dueDate === ins.dueDate && x.stage === stage;
      if (mine.some((x) => same(x) && x.status === 'sent')) continue;
      const failed = mine.filter((x) => same(x) && x.status === 'failed').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      const email = String(c?.email || '').trim();
      rows.push({
        invoiceId: inv.id,
        customerId: inv.customerId || c?.id || null,
        customerName: c?.name || '',
        email,
        emailStatus: !email ? 'missing' : isValidEmail(email) ? 'ok' : 'invalid',
        invoiceNumber: inv.ncfNumber || inv.invoiceNumber || inv.orderNumber || inv.id,
        dueDate: ins.dueDate,
        stage,
        amount: ins.remaining,
        overdueTotal: round2(pending.filter((x) => x.dueDate < today).reduce((s, x) => s + x.remaining, 0)),
        balance,
        lastSentAt: mine.filter((x) => x.status === 'sent').map((x) => x.createdAt).sort().pop() ?? null,
        failed: failed ? { error: failed.error || '' } : null,
      });
      break;
    }
  }
  return rows;
};

export const renderReminder = (rules, row, company, today) => {
  const money = (n) => `${company?.currencySymbol || 'RD$'}${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  const d = diffDays(today, row.dueDate);
  const [y, m, dd] = row.dueDate.slice(0, 10).split('-');
  const vars = {
    cliente: row.customerName,
    empresa: company?.name || '',
    factura: row.invoiceNumber,
    monto: money(row.amount),
    vence: `${dd}/${m}/${y}`,
    dias: d === 0 ? 'hoy' : d > 0 ? `hace ${d} ${d === 1 ? 'día' : 'días'}` : `en ${-d} ${d === -1 ? 'día' : 'días'}`,
    saldo: money(row.balance),
    telefono: company?.phone || '',
    correo: company?.email || '',
  };
  const fill = (t) => String(t).replace(/\{(\w+)\}/g, (k, n) => (n in vars ? vars[n] : k));
  return { subject: fill(rules.subject), text: fill(rules.body) };
};
