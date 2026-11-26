// Condición de pago propuesta en una venta: la del cliente, o contado.
import { isCashTerm, scheduleFor } from './paymentTerms.js';

const isActive = (t) => t.active !== false;
export const cashTermId = (terms) => terms.find(isCashTerm)?.id || 'contado';

export const proposedTermId = (customer, terms) =>
  terms.some((t) => isActive(t) && t.id === customer?.paymentTermId) ? customer.paymentTermId : cashTermId(terms);

// F9: de contado pasa al plazo del cliente (o 30 días); desde cualquier plazo vuelve a contado.
export const toggledTermId = (current, customer, terms) => {
  const cash = cashTermId(terms);
  if (current !== cash) return cash;
  const own = proposedTermId(customer, terms);
  if (own !== cash) return own;
  return (terms.find((t) => isActive(t) && t.id === '30-dias') || terms.find((t) => isActive(t) && !isCashTerm(t)))?.id || cash;
};

// Campo del payload de la venta: contado no manda plazo (el servidor lo toma como contado).
export const termPayload = (terms, id) => {
  const t = terms.find((x) => x.id === id);
  return t && !isCashTerm(t) ? { paymentTermId: id } : {};
};

// Plazo del cliente: el guardado; si es viejo (solo creditDays), el activo de una cuota con esos días
// (misma regla que termIdForCreditDays del servidor); si no, contado.
export const customerTermId = (customer, terms) => {
  if (customer?.paymentTermId && terms.some((t) => t.id === customer.paymentTermId)) return customer.paymentTermId;
  const days = Number(customer?.creditDays);
  const t = days > 0 && terms.find((x) => isActive(x) && x.installments?.length === 1 && !x.installments[0].fromMonthEnd && Number(x.installments[0].days) === days);
  return t?.id || cashTermId(terms);
};

export const customerTermName = (customer, terms) =>
  terms.find((t) => t.id === customerTermId(customer, terms))?.name || 'Contado';

// ¿Cobra algo hoy? Mismo criterio que downPayment (cuota que vence el día de la venta, con fin de mes incluido).
export const paysToday = (term, today) =>
  !!term && scheduleFor(term, 100, today).some((c) => c.dueDate === today && c.amount > 0);
