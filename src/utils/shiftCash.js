import { isVoidInvoice } from './invoiceStatus.js';

// Cobros hechos dentro del turno, del desglose de pagos de cada factura (lo guarda PaymentModal).
// Misma regla que backend/src/routes/shifts.js para que el esperado mostrado y el guardado coincidan.
export function shiftPayments(invoices, from, to = Infinity) {
  const totals = { efectivo: 0, tarjeta: 0, chequeTransferencia: 0, credito: 0 };
  for (const inv of invoices || []) {
    if (isVoidInvoice(inv)) continue;
    for (const p of Array.isArray(inv.payments) ? inv.payments : []) {
      const t = new Date(p?.date || inv.billedDate || inv.date).getTime();
      if (!(t >= from && t <= to)) continue;
      for (const k in totals) totals[k] += Number(p[k]) || 0;
    }
  }
  return totals;
}
