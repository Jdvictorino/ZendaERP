import { invoiceStatus } from './withholdings.js';

const cents = (n) => Math.round(Number(n || 0) * 100) / 100;

// Decide el cobro y las retenciones de una factura. invoice trae total e ITBIS ya vigentes (con descuento aplicado).
// Devuelve { data } con lo que se guarda, o { error, httpStatus }.
export function planInvoicePayment(invoice, body, { manager }) {
  const paid = body.amountPaid ?? body.paidAmount;
  const hasRet = body.itbisRetenido !== undefined || body.retencionRenta !== undefined;
  const data = {};
  if (paid === undefined && !hasRet && body.retentionDate === undefined) return { data };

  const total = Number(invoice.total);
  const next = {
    total,
    amountPaid: paid !== undefined ? Number(paid) : Number(invoice.amountPaid),
    itbisRetenido: body.itbisRetenido !== undefined ? Number(body.itbisRetenido) : Number(invoice.itbisRetenido || 0),
    retencionRenta: body.retencionRenta !== undefined ? Number(body.retencionRenta) : Number(invoice.retencionRenta || 0),
    creditedAmount: Number(invoice.creditedAmount || 0),
  };
  const bad = (httpStatus, error) => ({ error, httpStatus });
  if (!(next.amountPaid >= 0) || !(next.itbisRetenido >= 0) || !(next.retencionRenta >= 0)) {
    return bad(400, 'Los montos no pueden ser negativos.');
  }
  if (next.amountPaid + next.itbisRetenido + next.retencionRenta + next.creditedAmount > total + 0.01) {
    return bad(400, 'El monto pagado más las retenciones no puede ser mayor que el total de la factura.');
  }
  if (next.itbisRetenido > Number(invoice.taxAmount) + 0.01) {
    return bad(400, 'El ITBIS retenido no puede ser mayor que el ITBIS de la factura.');
  }
  if (next.retencionRenta > total - Number(invoice.taxAmount) + 0.01) {
    return bad(400, 'La retención de ISR no puede ser mayor que el monto de la factura sin ITBIS.');
  }
  if (!manager) {
    if (next.amountPaid < Number(invoice.amountPaid) - 0.01) return bad(403, 'Solo un gerente o administrador puede reducir lo pagado de una factura.');
    if (next.itbisRetenido < Number(invoice.itbisRetenido || 0) - 0.01 || next.retencionRenta < Number(invoice.retencionRenta || 0) - 0.01) {
      return bad(403, 'Solo un gerente o administrador puede reducir las retenciones de una factura.');
    }
  }
  if (paid !== undefined) data.amountPaid = next.amountPaid;
  if (body.itbisRetenido !== undefined) data.itbisRetenido = cents(next.itbisRetenido);
  if (body.retencionRenta !== undefined) data.retencionRenta = cents(next.retencionRenta);
  if (body.retentionDate !== undefined) {
    const d = body.retentionDate === null ? null : new Date(`${body.retentionDate}T00:00:00.000Z`);
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(body.retentionDate) || isNaN(d) || d.toISOString().slice(0, 10) !== body.retentionDate)) return bad(400, 'Fecha de retención inválida.');
    data.retentionDate = d;
  }
  if (!invoice.voided && (paid !== undefined || hasRet)) data.status = invoiceStatus(next);
  return { data };
}
