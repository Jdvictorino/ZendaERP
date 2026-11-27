import { describe, it, expect } from 'vitest';
import { todayRD } from '../backend/src/services/tax.js';
import { planInvoiceTerms, termIdForCreditDays, planBillingTerms, rescaleSchedule } from '../backend/src/services/invoiceTerms.js';
import { DEFAULT_PAYMENT_TERMS as T } from '../backend/src/services/paymentTerms.js';

describe('planInvoiceTerms', () => {
  it('30-dias: copia con una cuota y 30 días', () => {
    const r = planInvoiceTerms({ paymentTermId: '30-dias' }, T, '2026-11-25', 1180);
    expect(r.paymentTerm.schedule).toEqual([{ dueDate: '2026-12-25', amount: 1180 }]);
    expect(r.paymentTermDays).toBe(30);
    expect(todayRD(r.dueDate)).toBe('2026-12-25');
  });
  it('contado: todo null', () => {
    expect(planInvoiceTerms({ paymentTermId: 'contado' }, T, '2026-11-25', 100)).toEqual({ paymentTerm: null, paymentTermDays: null, dueDate: null });
    expect(planInvoiceTerms({}, T, '2026-11-25', 100).paymentTerm).toBeNull();
  });
  it('apps viejas: solo paymentTermDays', () => {
    const r = planInvoiceTerms({ paymentTermDays: 60 }, T, '2026-11-25', 500);
    expect(r.paymentTerm.schedule).toEqual([{ dueDate: '2027-01-24', amount: 500 }]);
    expect(r.paymentTermDays).toBe(60);
  });
  it('id inexistente o inactivo: error', () => {
    expect(planInvoiceTerms({ paymentTermId: 'x' }, T, '2026-11-25', 1).error).toBe('Condición de pago no válida.');
    expect(planInvoiceTerms({ paymentTermId: '30-dias' }, T.map((t) => ({ ...t, active: false })), '2026-11-25', 1).error).toBeTruthy();
  });
});

describe('termIdForCreditDays', () => {
  it('mapea días a plazo de una cuota sin fin de mes', () => {
    expect(termIdForCreditDays(30, T)).toBe('30-dias');
    expect(termIdForCreditDays(15, T)).toBe('15-dias');
  });
  it('sin equivalente o inactivo: undefined', () => {
    expect(termIdForCreditDays(20, T)).toBeUndefined();
    expect(termIdForCreditDays(0, T)).toBeUndefined();
    expect(termIdForCreditDays(30, T.map((t) => ({ ...t, active: false })))).toBeUndefined();
  });
});

describe('apps viejas y contado', () => {
  it('contado o 0 días no mapea a ningún plazo (no borra el del cliente)', () => {
    expect(termIdForCreditDays(0, T)).toBeUndefined();
    expect(termIdForCreditDays(undefined, T)).toBeUndefined();
    expect(termIdForCreditDays(30, T)).toBe('30-dias');
  });
});

describe('planBillingTerms (craft factura después)', () => {
  const inv = (id) => ({ total: 1000, paymentTerm: { id, name: 'x', saleDate: '2026-11-20', discount: null, schedule: [{ dueDate: '2026-12-20', amount: 1000 }] } });
  it('rehace el calendario con el plazo desde hoy', () => {
    const r = planBillingTerms(inv('30-dias'), T, '2026-11-27');
    expect(r.paymentTerm.saleDate).toBe('2026-11-27');
    expect(r.paymentTerm.schedule).toEqual([{ dueDate: '2026-12-27', amount: 1000 }]);
    expect(r.paymentTermDays).toBe(30);
    expect(r.dueDate.toISOString()).toBe('2026-12-27T12:00:00.000Z');
  });
  it('plazo borrado: corre las fechas por la diferencia de días', () => {
    const r = planBillingTerms(inv('ya-no-existe'), T, '2026-11-27');
    expect(r.paymentTerm.saleDate).toBe('2026-11-27');
    expect(r.paymentTerm.schedule[0].dueDate).toBe('2026-12-27');
  });
  it('mismo día o sin plazo: null', () => {
    expect(planBillingTerms(inv('30-dias'), T, '2026-11-20')).toBeNull();
    expect(planBillingTerms({ total: 5, paymentTerm: null }, T, '2026-11-27')).toBeNull();
  });
});

describe('rescaleSchedule (cupón después de la venta)', () => {
  const snap = { saleDate: '2026-11-25', schedule: [{ dueDate: '2026-11-25', amount: 500 }, { dueDate: '2026-12-25', amount: 500 }] };
  it('50/50 de 1000 con cupón de 100 queda 450/450', () => {
    expect(rescaleSchedule(snap, 900).schedule.map((c) => c.amount)).toEqual([450, 450]);
  });
  it('la última cuota absorbe el redondeo y la suma es el total', () => {
    const three = { schedule: [{ dueDate: 'a', amount: 333.34 }, { dueDate: 'b', amount: 333.33 }, { dueDate: 'c', amount: 333.33 }] };
    const r = rescaleSchedule(three, 999.99).schedule;
    expect(Math.round(r.reduce((s, c) => s + c.amount, 0) * 100) / 100).toBe(999.99);
  });
});

