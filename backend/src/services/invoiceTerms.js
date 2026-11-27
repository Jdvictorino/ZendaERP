// Condición de pago de una venta nueva: copia del plazo, días y vencimiento.
import { addDays, diffDays, isCashTerm, legacySnapshot, termSnapshot } from './paymentTerms.js';

const NONE = { paymentTerm: null, paymentTermDays: null, dueDate: null };

export function planInvoiceTerms(body, terms, saleDate, total) {
  let snap;
  if (body.paymentTermId) {
    const t = terms.find((x) => x.id === body.paymentTermId);
    if (!t || t.active === false) return { error: 'Condición de pago no válida.' };
    if (isCashTerm(t)) return NONE;
    snap = termSnapshot(t, total, saleDate);
  } else if (body.paymentTermDays > 0) {
    // Apps 1.1.20: solo mandan los días
    snap = legacySnapshot(body.paymentTermDays, total, saleDate);
  } else return NONE;
  return withDue(snap);
}

// Snapshot + días y vencimiento (última cuota) tal como se guardan en la factura.
function withDue(snap) {
  const last = snap.schedule[snap.schedule.length - 1].dueDate;
  const days = diffDays(last, snap.saleDate);
  return { paymentTerm: snap, paymentTermDays: days || null, dueDate: new Date(`${last}T12:00:00.000Z`) };
}

// Al facturar una orden craft: el calendario cuenta desde hoy, no desde el pedido. null = nada que cambiar.
export function planBillingTerms(invoice, terms, today) {
  const snap = invoice.paymentTerm;
  if (!snap?.schedule?.length || snap.saleDate === today) return null;
  const t = terms.find((x) => x.id === snap.id);
  const total = Number(invoice.total);
  const fresh = t && !isCashTerm(t) ? termSnapshot(t, total, today) : null;
  if (fresh) return withDue(fresh);
  const shift = diffDays(today, snap.saleDate); // plazo borrado o ahora contado: se corren las fechas
  return withDue({ ...snap, saleDate: today, schedule: snap.schedule.map((c) => ({ ...c, dueDate: addDays(c.dueDate, shift) })) });
}

// Cupón después de la venta: el calendario se reescala al total nuevo; la última cuota absorbe el redondeo.
export function rescaleSchedule(snap, total) {
  const old = snap.schedule.reduce((s, c) => s + Number(c.amount), 0);
  if (!(old > 0)) return snap;
  let acc = 0;
  const schedule = snap.schedule.map((c, i, all) => {
    const amount = i === all.length - 1 ? round2(total - acc) : round2((Number(c.amount) * total) / old);
    acc = round2(acc + amount);
    return { ...c, amount };
  });
  return { ...snap, schedule };
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Cliente con creditDays y sin paymentTermId: plazo activo de una cuota, sin fin de mes, con esos días.
export function termIdForCreditDays(creditDays, terms) {
  if (!(Number(creditDays) > 0)) return undefined;
  const t = terms.find((x) => x.active !== false && x.installments?.length === 1 && !x.installments[0].fromMonthEnd && Number(x.installments[0].days) === Number(creditDays));
  return t?.id;
}
