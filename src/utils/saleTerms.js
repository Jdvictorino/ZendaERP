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

// Plazo del cliente: el guardado (aunque ya no exista en la lista) o contado.
export const customerTermId = (customer, terms) => customer?.paymentTermId || cashTermId(terms);

export const customerTermName = (customer, terms) => {
  const id = customerTermId(customer, terms);
  return terms.find((t) => t.id === id)?.name || 'Plazo eliminado';
};

export const isCashCustomer = (customer, terms) =>
  !customer?.paymentTermId || isCashTerm(terms.find((t) => t.id === customer.paymentTermId));

// ¿Cobra algo hoy? Mismo criterio que downPayment (cuota que vence el día de la venta, con fin de mes incluido).
export const paysToday = (term, today) =>
  !!term && scheduleFor(term, 100, today).some((c) => c.dueDate === today && c.amount > 0);
