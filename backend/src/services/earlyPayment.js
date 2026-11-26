import { discountFor } from './paymentTerms.js';
import { planInvoicePayment } from './invoicePayment.js';
import { invoiceBalance } from './withholdings.js';

// Decide un cobro con descuento por pronto pago (puro). La factura debe traer creditNotes con `kind`.
// Devuelve { discount, paymentData } o { error, status }; si algo falla, el servidor no crea nota ni cobro.
export function planEarlyPayment(invoice, body, { today, manager }) {
  const d = discountFor(invoice, today);
  if (!d) return { error: 'El descuento por pronto pago ya no aplica.', status: 400 };
  // El cobro se planea con el descuento ya acreditado, así el estado sale 'Pagado'
  const credited = { ...invoice, creditedAmount: Number(invoice.creditedAmount || 0) + d.amount };
  const plan = planInvoicePayment(credited, body, { manager });
  if (plan.error) return { error: plan.error, status: plan.httpStatus };
  if (invoiceBalance({ ...credited, ...plan.data }) > 0.01) return { error: 'El cobro con descuento debe saldar la factura.', status: 400 };
  return { discount: d.amount, paymentData: plan.data };
}
