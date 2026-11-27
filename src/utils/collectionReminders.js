// Copia de backend/src/services/collectionReminders.js — mantener iguales (test/collectionReminders.spec.js prueba ambas)
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
    'Le recordamos que la factura {factura} por {monto} está pendiente de pago.\n' +
    'Vencimiento: {vence} ({dias})\n' +
    'Saldo pendiente: {saldo}\n\n' +
    'Si ya realizó el pago, por favor ignore este mensaje.\n\n' +
    'Gracias,\n{empresa}\nTel.: {telefono}\nCorreo: {correo}',
};

export const remindersOf = (settings) => {
  const own = settings?.collectionReminders || {};
  return { ...DEFAULT_REMINDERS, ...own, stages: [...(Array.isArray(own.stages) ? own.stages : DEFAULT_REMINDERS.stages)] };
};

export const validateReminders = (r) => {
  if (typeof r?.auto !== 'boolean') return 'El envío automático debe ser sí o no';
  const stages = r.stages;
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

export const isValidEmail = (s) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || '').trim());

// Lo guardado completado con lo recibido (un cliente viejo puede mandar solo parte): { error } o { value }.
export const remindersUpdate = (settings, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Envía los recordatorios de cobro como un objeto' };
  const value = { ...remindersOf(settings), ...body };
  const error = validateReminders(value);
  return error ? { error } : { value };
};

// Número de WhatsApp de RD: 809/829/849 con o sin el 1 inicial; lo demás es inválido.
export const waNumber = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  return /^(809|829|849)\d{7}$/.test(d) ? `1${d}` : /^1(809|829|849)\d{7}$/.test(d) ? d : null;
};
export const waUrl = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

const invoiceNumberOf = (inv) => inv.ncfNumber || inv.invoiceNumber || inv.orderNumber || inv.id;
const moneyOf = (company) => (n) => {
  try { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: company?.currency || 'DOP' }).format(n); }
  catch { return `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`; }
};

export const invoiceWhatsappText = (invoice, customer, company) =>
  `Hola${customer?.name ? ` ${customer.name}` : ''}, le enviamos su factura ${invoiceNumberOf(invoice)} por ${moneyOf(company)(invoice.total)}. Gracias por preferir ${company?.name || ''}.`;

export const stageLabel = (n) =>
  n < 0 ? `${-n} ${n === -1 ? 'día' : 'días'} antes` : n === 0 ? 'vence hoy' : `${n} ${n === 1 ? 'día' : 'días'} de atraso`;

// Prisma entrega Date; la lógica compara 'YYYY-MM-DD'.
const day = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const time = (v) => new Date(v).getTime();
// Día de RD (UTC-4 fijo) de una marca de tiempo.
const rdDay = (ts) => new Date(time(ts) - 4 * 3600e3).toISOString().slice(0, 10);

// Una fila por factura: la cuota pendiente más vieja cuya etapa vigente aún no se envió.
export const remindersDue = (invoices, { today, rules, sent = [] }) => {
  const stages = [...rules.stages].sort((a, b) => a - b);
  const rows = [];
  for (const inv of invoices) {
    const c = inv.customer;
    if (!c || VOID_STATUSES.includes(inv.status) || c.remindersOff) continue;
    const mine = sent.filter((x) => x.invoiceId === inv.id);
    // El momento en que pasó a 'sent' es updatedAt.
    if (mine.some((x) => x.status === 'sent' && rdDay(x.updatedAt || x.createdAt) === today)) continue;
    const pending = installmentsOf(inv, today).filter((x) => x.remaining > 0.01);
    const balance = round2(pending.reduce((s, x) => s + x.remaining, 0));
    if (balance <= 0.01) continue;
    for (const ins of pending) {
      const late = diffDays(today, ins.dueDate);
      const stage = stages.filter((s) => s <= late).pop();
      if (stage === undefined) continue;
      const same = (x) => day(x.dueDate) === ins.dueDate && x.stage === stage;
      if (mine.some((x) => same(x) && x.status === 'sent')) continue;
      // 'sending' sin terminar cuenta como fallida: el automático no la toca y la persona puede reintentar.
      const failed = mine
        .filter((x) => same(x) && (x.status === 'failed' || x.status === 'sending'))
        .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
      const email = String(c.email || '').trim();
      const phone = waNumber(c.phone);
      rows.push({
        invoiceId: inv.id,
        customerId: inv.customerId || c.id || null,
        customerName: c.name || '',
        email,
        emailStatus: !email ? 'missing' : isValidEmail(email) ? 'ok' : 'invalid',
        phone,
        phoneStatus: phone ? 'ok' : String(c.phone || '').trim() ? 'invalid' : 'missing',
        invoiceNumber: invoiceNumberOf(inv),
        dueDate: ins.dueDate,
        stage,
        amount: ins.remaining,
        overdueTotal: round2(pending.filter((x) => x.dueDate < today).reduce((s, x) => s + x.remaining, 0)),
        balance,
        lastSentAt: mine.filter((x) => x.status === 'sent').map((x) => x.createdAt).sort((a, b) => time(a) - time(b)).pop() ?? null,
        failed: failed ? { channel: failed.channel, error: failed.status === 'sending' ? `Interrumpido: puede que ${failed.channel === 'whatsapp' ? 'el WhatsApp ya se haya abierto' : 'el correo ya haya salido'}` : failed.error || '' } : null,
      });
      break;
    }
  }
  return rows;
};

export const renderReminder = (rules, row, company, today) => {
  const money = moneyOf(company);
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
    vencido: money(row.overdueTotal),
    telefono: company?.phone || '',
    correo: company?.email || '',
  };
  const fill = (t) => String(t).replace(/\{(\w+)\}/g, (k, n) => (n in vars ? vars[n] : k));
  return { subject: fill(rules.subject), text: fill(rules.body) };
};
