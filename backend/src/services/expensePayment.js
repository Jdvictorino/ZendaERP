const num = (v) => Number(v) || 0;
const payableOf = (e) => num(e.montoFacturado) + num(e.itbisFacturado) - num(e.itbisRetenido) - num(e.montoRetencionIsr);

// Estado de pago de un gasto: se calcula, no se guarda
export const expensePaymentStatus = (e) => {
  const paid = num(e.paidAmount);
  if (paid >= payableOf(e) - 0.01 && paid > 0) return 'Pagado';
  return paid > 0 ? 'Parcial' : 'Pendiente';
};

export const withPayment = (e) => ({ ...e, paidAmount: num(e.paidAmount), payments: Array.isArray(e.payments) ? e.payments : [], paymentStatus: expensePaymentStatus(e) });

// Valida y arma lo que se guarda al registrar pagos de un gasto
export function planExpensePayment(expense, body, { manager }) {
  const fail = (status, error) => ({ data: null, error, status });
  const data = {};
  if (body.payments !== undefined) {
    const ok = Array.isArray(body.payments) && body.payments.every((p) => p && Number(p.amount) > 0);
    if (!ok) return fail(400, 'Los pagos no son válidos: cada uno lleva un monto mayor que 0.');
    data.payments = body.payments;
  }
  if (body.paidAmount !== undefined) {
    const paid = Number(body.paidAmount);
    if (!Number.isFinite(paid) || paid < 0) return fail(400, 'El monto pagado no es válido.');
    if (paid > payableOf(expense) + 0.01) return fail(400, 'El pago supera lo que se le debe al suplidor (total menos retenciones).');
    if (paid < num(expense.paidAmount) - 0.005 && !manager) return fail(403, 'Solo un gerente o administrador puede reducir lo pagado.');
    data.paidAmount = paid;
  }
  const paid = data.paidAmount ?? num(expense.paidAmount);
  const list = data.payments ?? expense.payments;
  if (!expense.paymentDate && paid > 0 && paid >= payableOf(expense) - 0.01 && Array.isArray(list) && list.length) {
    const d = new Date(list[list.length - 1].date);
    if (!isNaN(d)) data.paymentDate = d;
  }
  return { data, error: null, status: 200 };
}
