import { expensePayable, expensePaymentStatus } from './expensePayable.js';

export { expensePaymentStatus };
const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const key = (p) => JSON.stringify(p);

export const withPayment = (e) => ({ ...e, paidAmount: num(e.paidAmount), payments: Array.isArray(e.payments) ? e.payments : [], paymentStatus: expensePaymentStatus(e) });

// Valida y arma lo que se guarda al registrar pagos de un gasto
export function planExpensePayment(expense, body, { manager }) {
  const fail = (status, error) => ({ data: null, error, status });
  const data = {};
  const payable = expensePayable(expense);
  const savedPaid = num(expense.paidAmount);
  if (body.payments !== undefined) {
    const ok = Array.isArray(body.payments) && body.payments.every((p) => p && Number(p.amount) > 0);
    if (!ok) return fail(400, 'Los pagos no son válidos: cada uno lleva un monto mayor que 0.');
    const list = body.payments.map((p) => ({ ...p, amount: Number(p.amount) }));
    const saved = Array.isArray(expense.payments) ? expense.payments : [];
    const extends_ = saved.every((p, i) => list[i] && key(list[i]) === key({ ...p, amount: Number(p.amount) }));
    if (!extends_) {
      const reduction = list.length < saved.length;
      if (!reduction) return fail(409, 'Otro usuario registró un pago en este gasto; recarga la pantalla.');
      if (!manager) return fail(403, 'Solo un gerente o administrador puede reducir lo pagado.');
    }
    data.payments = list;
    data.paidAmount = round2(list.reduce((s, p) => s + p.amount, 0)); // el total pagado sale de los pagos, no del cliente
  } else if (body.paidAmount !== undefined) {
    const paid = Number(body.paidAmount);
    if (!Number.isFinite(paid) || paid < 0) return fail(400, 'El monto pagado no es válido.');
    if (paid < savedPaid - 0.005 && !manager) return fail(403, 'Solo un gerente o administrador puede reducir lo pagado.');
    data.paidAmount = paid;
  }
  const paid = data.paidAmount ?? savedPaid;
  if (paid > payable + 0.01) return fail(400, 'El pago supera lo que se le debe al suplidor (total menos retenciones).');
  const list = data.payments ?? expense.payments;
  if (!expense.paymentDate && paid > 0 && paid >= payable - 0.01 && Array.isArray(list) && list.length) {
    const d = new Date(list[list.length - 1].date);
    if (!isNaN(d)) data.paymentDate = d;
  }
  return { data, error: null, status: 200 };
}

// Tras editar montos/retenciones: el total no puede quedar por debajo de lo ya pagado
export const payableBelowPaid = (merged, paid) => num(paid) > 0 && expensePayable(merged) < num(paid) - 0.01;
