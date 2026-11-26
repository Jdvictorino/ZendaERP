// Condición de pago de una venta nueva: copia del plazo, días y vencimiento.
import { isCashTerm, legacySnapshot, termSnapshot } from './paymentTerms.js';

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
  const last = snap.schedule[snap.schedule.length - 1].dueDate;
  const days = Math.round((Date.parse(last) - Date.parse(saleDate)) / 864e5);
  return { paymentTerm: snap, paymentTermDays: days || null, dueDate: new Date(`${last}T12:00:00.000Z`) };
}

// Apps viejas: contado explícito quita el plazo (null); undefined = sin cambio.
export const legacyCustomerTermId = (parsed, terms) =>
  parsed.accountType === 'contado' || parsed.creditDays === 0 ? null : termIdForCreditDays(parsed.creditDays, terms);

// Cliente con creditDays y sin paymentTermId: plazo activo de una cuota, sin fin de mes, con esos días.
export function termIdForCreditDays(creditDays, terms) {
  if (!(Number(creditDays) > 0)) return undefined;
  const t = terms.find((x) => x.active !== false && x.installments?.length === 1 && !x.installments[0].fromMonthEnd && Number(x.installments[0].days) === Number(creditDays));
  return t?.id;
}
