// Condición de pago propuesta en una venta: la del cliente, o contado.
import { isCashTerm } from './paymentTerms.js';

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
