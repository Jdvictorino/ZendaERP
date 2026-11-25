import { readFileSync } from 'node:fs';
import { planExpensePayment, expensePaymentStatus, payableBelowPaid } from '../backend/src/services/expensePayment.js';
import * as app from '../src/utils/expensePayable.js';
import * as srv from '../backend/src/services/expensePayable.js';

const exp = { montoFacturado: 1000, itbisFacturado: 180, itbisRetenido: 180, montoRetencionIsr: 100, paidAmount: 0, payments: null, paymentDate: null };
const pay = (amount, date = '2026-11-20T10:00:00.000Z') => ({ amount, method: 'cash', reference: '', date });

describe('pagos a suplidores', () => {
  it('pago parcial queda Parcial y sin fecha de pago', () => {
    const r = planExpensePayment(exp, { paidAmount: 400, payments: [pay(400)] }, { manager: false });
    expect(r.error).toBeNull();
    expect(r.data.paidAmount).toBe(400);
    expect(r.data.paymentDate).toBeUndefined();
    expect(expensePaymentStatus({ ...exp, paidAmount: 400 })).toBe('Parcial');
    expect(expensePaymentStatus(exp)).toBe('Pendiente');
  });
  it('pagar el neto (total menos retenciones) lo deja Pagado con la fecha del ultimo pago', () => {
    const r = planExpensePayment(exp, { paidAmount: 900, payments: [pay(400, '2026-11-10T00:00:00.000Z'), pay(500)] }, { manager: false });
    expect(r.data.paymentDate).toEqual(new Date('2026-11-20T10:00:00.000Z'));
    expect(expensePaymentStatus({ ...exp, paidAmount: 900 })).toBe('Pagado');
  });
  it('no pisa una fecha de pago existente', () => {
    const r = planExpensePayment({ ...exp, paymentDate: new Date('2026-11-01') }, { paidAmount: 900, payments: [pay(900)] }, { manager: false });
    expect(r.data.paymentDate).toBeUndefined();
  });
  it('tope: no se paga mas de lo que se debe', () => {
    expect(planExpensePayment(exp, { paidAmount: 900.02 }, { manager: true })).toMatchObject({ status: 400 });
    expect(planExpensePayment(exp, { paidAmount: 900.01 }, { manager: true }).error).toBeNull();
  });
  it('reducir lo pagado solo gerente', () => {
    const paid = { ...exp, paidAmount: 500 };
    expect(planExpensePayment(paid, { paidAmount: 100 }, { manager: false })).toMatchObject({ status: 403 });
    expect(planExpensePayment(paid, { paidAmount: 100 }, { manager: true }).error).toBeNull();
  });
  it('payments invalido o monto negativo da 400', () => {
    expect(planExpensePayment(exp, { payments: [{ amount: 0 }] }, { manager: true }).status).toBe(400);
    expect(planExpensePayment(exp, { payments: 'x' }, { manager: true }).status).toBe(400);
    expect(planExpensePayment(exp, { paidAmount: -1 }, { manager: true }).status).toBe(400);
  });
});

describe('pagos: concurrencia y montos', () => {
  const one = pay(400);
  const saved = { ...exp, paidAmount: 400, payments: [one] };
  it('el total pagado sale de los pagos, no del cliente', () => {
    const r = planExpensePayment(saved, { paidAmount: 1, payments: [one, pay('200')] }, { manager: false });
    expect(r.data.paidAmount).toBe(600);
    expect(r.data.payments[1].amount).toBe(200);
  });
  it('un pago ajeno guardado antes da 409', () => {
    expect(planExpensePayment(saved, { payments: [pay(300)] }, { manager: true }).status).toBe(409);
    expect(planExpensePayment(saved, { payments: [{ ...one, amount: 399 }, pay(1)] }, { manager: true }).status).toBe(409);
  });
  it('reducir la lista: solo gerente', () => {
    expect(planExpensePayment(saved, { payments: [] }, { manager: false }).status).toBe(403);
    expect(planExpensePayment(saved, { payments: [] }, { manager: true }).data.paidAmount).toBe(0);
  });
  it('bajar el total por debajo de lo pagado se detecta', () => {
    expect(payableBelowPaid({ ...exp, montoFacturado: 100 }, 400)).toBe(true);
    expect(payableBelowPaid(exp, 400)).toBe(false);
    expect(payableBelowPaid(exp, 0)).toBe(false);
  });
});

describe('expensePayable (app y servidor)', () => {
  it.each([['app', app], ['backend', srv]])('%s: 1000 + ITBIS 180 - retenido 280 = 900 y pagarlo deja Pagado', (_n, m) => {
    expect(m.expensePayable(exp)).toBe(900);
    expect(m.expensePayable({ ...exp, propina: 10 })).toBe(910);
    expect(m.expensePaymentStatus({ ...exp, paidAmount: 900 })).toBe('Pagado');
  });
  it('copias identicas desde la linea 2', () => {
    const body = (f) => readFileSync(f, 'utf8').split('
').slice(1).join('
').replace(//g, '');
    expect(body('src/utils/expensePayable.js')).toBe(body('backend/src/services/expensePayable.js'));
  });
});
