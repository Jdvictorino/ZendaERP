// Copia de src/utils/paymentTerms.js — mantener iguales (test/paymentTerms.spec.js prueba ambas)
// Condiciones de pago: plazos iniciales, calendario de cuotas, saldo por cuota y descuento por pronto pago.
import { todayRD } from './tax.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => Number(v) || 0;
// Número real: rechaza vacío, null y booleanos que Number() convertiría en 0/1.
const isNum = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
const isDays = (v) => isNum(v) && Number.isInteger(Number(v)) && v >= 0 && v <= 365;
const VOID_STATUSES = ['Anulado', 'Cancelado'];

const term = (id, name, installments, discount = null) => ({ id, name, installments, discount, active: true });
const one = (days, fromMonthEnd = false) => [{ percent: 100, days, fromMonthEnd }];

export const DEFAULT_PAYMENT_TERMS = [
  term('contado', 'Contado', one(0)),
  term('15-dias', '15 días', one(15)),
  term('30-dias', '30 días', one(30)),
  term('45-dias', '45 días', one(45)),
  term('60-dias', '60 días', one(60)),
  term('30-dias-fin-mes', '30 días fin de mes', one(30, true)),
  term('50-ahora-50-30', '50 % ahora y 50 % a 30 días', [
    { percent: 50, days: 0, fromMonthEnd: false },
    { percent: 50, days: 30, fromMonthEnd: false },
  ]),
  term('30-dias-2-10', '30 días, 2 % a 10 días', one(30), { percent: 2, days: 10 }),
];

export const paymentTermsOf = (settings) =>
  Array.isArray(settings?.paymentTerms) ? settings.paymentTerms : DEFAULT_PAYMENT_TERMS;

// Contado = plazo activo de una sola cuota al 100 % a 0 días, sin fin de mes ni descuento.
export const isCashTerm = (t) =>
  !!t && t.active !== false && !t.discount && t.installments?.length === 1 &&
  Number(t.installments[0].percent) === 100 && Number(t.installments[0].days) === 0 && !t.installments[0].fromMonthEnd;

export const validatePaymentTerms = (list) => {
  if (!Array.isArray(list)) return 'La tabla de plazos no es válida';
  const ids = new Set();
  const names = new Set();
  for (const t of list) {
    const name = String(t?.name || '').trim();
    if (!name) return 'Cada plazo necesita un nombre';
    if (!t.id || ids.has(t.id)) return `Plazo con id repetido o vacío: ${name}`;
    if (names.has(name.toLowerCase())) return `Plazo con nombre repetido: ${name}`;
    ids.add(t.id);
    names.add(name.toLowerCase());
    const ins = t.installments;
    if (!Array.isArray(ins) || !ins.length) return `"${name}" necesita al menos una cuota`;
    if (ins.some((c) => !isDays(c.days)))
      return `Los días de "${name}" deben ser enteros entre 0 y 365`;
    if (ins.some((c) => !isNum(c.percent) || !(Number(c.percent) > 0)) || Math.abs(ins.reduce((s, c) => s + num(c.percent), 0) - 100) > 0.01)
      return `Los porcentajes de las cuotas de "${name}" deben sumar 100`;
    if (t.discount) {
      const { percent, days } = t.discount;
      if (!isNum(percent) || Number(percent) < 0 || Number(percent) > 100) return `El descuento de "${name}" debe estar entre 0 y 100 %`;
      if (!isDays(days) || Number(days) >= Math.max(...ins.map((c) => num(c.days))))
        return `Los días del descuento de "${name}" deben ser menores que los de la última cuota`;
    }
  }
  if (list.filter(isCashTerm).length !== 1)
    return 'Debe haber exactamente un plazo de contado activo (una cuota al 100 % a 0 días, sin descuento)';
  return null;
};

// Id de un plazo ya guardado que falta en la lista nueva (los plazos guardados no se borran, se desactivan).
export const missingTermId = (current, next) => {
  const ids = new Set((next || []).map((t) => t?.id));
  return paymentTermsOf({ paymentTerms: current }).find((t) => !ids.has(t.id))?.id ?? null;
};

// Fechas 'YYYY-MM-DD' con aritmética de calendario en UTC (sin hora local).
const parts = (s) => String(s).slice(0, 10).split('-').map(Number);
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, days) => { const [y, m, d] = parts(s); return fmt(Date.UTC(y, m - 1, d + days)); };
const monthEnd = (s) => { const [y, m] = parts(s); return fmt(Date.UTC(y, m, 0)); };
const diffDays = (a, b) => {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 864e5);
};
// 'YYYY-MM-DD' tal cual; con hora (Date o ISO) se convierte a la fecha local de RD.
const day10 = (v) => (typeof v === 'string' && v.length === 10 ? v : v ? todayRD(new Date(v)) : '');

export const scheduleFor = (t, total, saleDate) => {
  let acc = 0;
  return t.installments.map((c, i, all) => {
    const amount = i === all.length - 1 ? round2(num(total) - acc) : round2((num(total) * num(c.percent)) / 100);
    acc = round2(acc + amount);
    return { dueDate: addDays(c.fromMonthEnd ? monthEnd(saleDate) : saleDate, num(c.days)), amount };
  });
};

export const termSnapshot = (t, total, saleDate) =>
  isCashTerm(t) ? null : { id: t.id, name: t.name, saleDate, discount: t.discount || null, schedule: scheduleFor(t, total, saleDate) };

export const legacySnapshot = (days, total, saleDate) => ({
  id: null,
  name: `${num(days)} días`,
  saleDate,
  discount: null,
  schedule: [{ dueDate: addDays(saleDate, num(days)), amount: round2(num(total)) }],
});

export const downPayment = (s) =>
  round2((s?.schedule || []).filter((c) => c.dueDate === s.saleDate).reduce((a, c) => a + num(c.amount), 0));

const isVoid = (inv) => VOID_STATUSES.includes(inv.status);

// Sin copia de plazo: una sola cuota por el total, con su vencimiento o la fecha de la venta.
export const installmentsOf = (inv, today) => {
  const stored = inv.paymentTerm?.schedule;
  const schedule = stored?.length
    ? [...stored].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    : [{ dueDate: day10(inv.dueDate || inv.date || inv.createdAt), amount: num(inv.total) }];
  let left = num(inv.amountPaid) + num(inv.itbisRetenido) + num(inv.retencionRenta) + num(inv.creditedAmount);
  return schedule.map((c) => {
    const amount = num(c.amount);
    const paid = round2(Math.min(amount, left));
    left = round2(left - paid);
    const remaining = round2(amount - paid);
    return { dueDate: c.dueDate, amount, paid, remaining, overdue: remaining > 0.01 && c.dueDate < today };
  });
};

export const nextDue = (inv, today) => {
  if (isVoid(inv)) return null;
  const c = installmentsOf(inv, today).find((x) => x.remaining > 0.01);
  return c ? { dueDate: c.dueDate, overdueDays: Math.max(0, diffDays(today, c.dueDate)) } : null;
};

export const discountFor = (inv, today) => {
  const d = inv.paymentTerm?.discount;
  if (!d || isVoid(inv) || num(inv.amountPaid) > 0) return null;
  if ((inv.creditNotes || []).some((n) => n.kind === 'pronto_pago')) return null;
  const until = addDays(inv.paymentTerm.saleDate, num(d.days));
  const amount = round2((num(inv.total) * num(d.percent)) / 100);
  const balance = installmentsOf(inv, today).reduce((s, c) => s + c.remaining, 0);
  return today <= until && amount > 0 && amount <= balance + 0.01 ? { amount, until } : null;
};
