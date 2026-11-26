import { describe, it, expect } from 'vitest';
import { todayRD } from '../backend/src/services/tax.js';
import { planInvoiceTerms, termIdForCreditDays, legacyCustomerTermId } from '../backend/src/services/invoiceTerms.js';
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

describe('legacyCustomerTermId', () => {
  it('contado o 0 días quita el plazo; días mapea; sin datos no cambia', () => {
    expect(legacyCustomerTermId({ accountType: 'contado' }, T)).toBeNull();
    expect(legacyCustomerTermId({ creditDays: 0 }, T)).toBeNull();
    expect(legacyCustomerTermId({ creditDays: 30 }, T)).toBe('30-dias');
    expect(legacyCustomerTermId({}, T)).toBeUndefined();
  });
});
