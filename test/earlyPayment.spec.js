import { describe, it, expect } from 'vitest';
import { planEarlyPayment } from '../backend/src/services/earlyPayment.js';
import { DEFAULT_PAYMENT_TERMS, termSnapshot } from '../backend/src/services/paymentTerms.js';

const term = DEFAULT_PAYMENT_TERMS.find((t) => t.id === '30-dias-2-10');
const inv = { total: 1180, taxAmount: 180, amountPaid: 0, itbisRetenido: 0, retencionRenta: 0, creditedAmount: 0, paymentTerm: termSnapshot(term, 1180, '2026-11-25'), creditNotes: [] };
const run = (i, body, today = '2026-12-05') => planEarlyPayment(i, body, { today, manager: false });

describe('planEarlyPayment', () => {
  it('cobro con descuento salda la factura', () => {
    const r = run(inv, { amountPaid: 1156.4 });
    expect(r.discount).toBe(23.6);
    expect(r.paymentData).toMatchObject({ amountPaid: 1156.4, status: 'Pagado' });
  });
  it('cobro corto', () => {
    expect(run(inv, { amountPaid: 1000 })).toEqual({ error: 'El cobro con descuento debe saldar la factura.', status: 400 });
  });
  it('fuera de la ventana', () => {
    expect(run(inv, { amountPaid: 1156.4 }, '2026-12-06')).toEqual({ error: 'El descuento por pronto pago ya no aplica.', status: 400 });
  });
  it('con nota de pronto pago previa', () => {
    expect(run({ ...inv, creditNotes: [{ kind: 'pronto_pago' }] }, { amountPaid: 1156.4 })).toEqual({ error: 'El descuento por pronto pago ya no aplica.', status: 400 });
  });
  it('cobro de más (total completo con descuento)', () => {
    expect(run(inv, { amountPaid: 1180 }).status).toBe(400);
  });
  it('retenciones que dejan el descuento mayor que el saldo', () => {
    expect(run({ ...inv, itbisRetenido: 180, retencionRenta: 990 }, { amountPaid: 0 }).status).toBe(400);
  });
});
