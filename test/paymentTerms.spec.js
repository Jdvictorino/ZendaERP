import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as app from '../src/utils/paymentTerms.js';
import * as srv from '../backend/src/services/paymentTerms.js';

describe.each([['app', app], ['backend', srv]])('paymentTerms (%s)', (_n, p) => {
  const t = (id) => p.DEFAULT_PAYMENT_TERMS.find((x) => x.id === id);
  const dates = (id, total, d) => p.scheduleFor(t(id), total, d).map((c) => c.dueDate);

  it('valores iniciales', () => {
    expect(p.DEFAULT_PAYMENT_TERMS.map((x) => x.id)).toEqual(['contado', '15-dias', '30-dias', '45-dias', '60-dias', '30-dias-fin-mes', '50-ahora-50-30', '30-dias-2-10']);
    expect(p.validatePaymentTerms(p.DEFAULT_PAYMENT_TERMS)).toBeNull();
    expect(p.paymentTermsOf({})).toBe(p.DEFAULT_PAYMENT_TERMS);
    expect(p.termSnapshot(t('contado'), 100, '2026-11-25')).toBeNull();
  });

  it('scheduleFor', () => {
    expect(p.scheduleFor(t('30-dias'), 1180, '2026-11-25')).toEqual([{ dueDate: '2026-12-25', amount: 1180 }]);
    expect(dates('30-dias-fin-mes', 100, '2026-01-31')).toEqual(['2026-03-02']);
    expect(dates('30-dias-fin-mes', 100, '2028-01-31')).toEqual(['2028-03-01']);
    expect(dates('30-dias-fin-mes', 100, '2026-12-15')).toEqual(['2027-01-30']);
    const three = { installments: [33.33, 33.33, 33.34].map((percent) => ({ percent, days: 0 })) };
    expect(p.scheduleFor(three, 100, '2026-11-25').map((c) => c.amount)).toEqual([33.33, 33.33, 33.34]);
  });

  it('snapshots y pago inicial', () => {
    const s = p.termSnapshot(t('50-ahora-50-30'), 1000, '2026-11-25');
    expect(s).toMatchObject({ id: '50-ahora-50-30', saleDate: '2026-11-25', discount: null });
    expect(p.downPayment(s)).toBe(500);
    expect(p.legacySnapshot(15, 100, '2026-11-25').schedule).toEqual([{ dueDate: '2026-12-10', amount: 100 }]);
  });

  it('installmentsOf y nextDue', () => {
    const paymentTerm = p.termSnapshot(t('50-ahora-50-30'), 1000, '2026-11-25');
    const inv = { total: 1000, amountPaid: 600, paymentTerm };
    const [a, b] = p.installmentsOf(inv, '2026-11-26');
    expect([a.remaining, b.paid, b.remaining, a.overdue, b.overdue]).toEqual([0, 100, 400, false, false]);
    expect(p.installmentsOf(inv, '2026-12-26').map((c) => c.overdue)).toEqual([false, true]);
    expect(p.nextDue(inv, '2026-12-30')).toEqual({ dueDate: '2026-12-25', overdueDays: 5 });
    expect(p.nextDue({ ...inv, status: 'Anulado' }, '2026-12-30')).toBeNull();
    expect(p.nextDue({ ...inv, creditedAmount: 400 }, '2026-12-30')).toBeNull();
    expect(p.installmentsOf({ total: 50, amountPaid: 0, createdAt: '2026-11-25T10:00:00Z' }, '2026-11-25')[0].dueDate).toBe('2026-11-25');
  });

  it('installmentsOf: reparte por fecha y toma la fecha local de RD', () => {
    const paymentTerm = { schedule: [{ dueDate: '2026-12-25', amount: 500 }, { dueDate: '2026-11-25', amount: 500 }] };
    const r = p.installmentsOf({ total: 1000, amountPaid: 500, paymentTerm }, '2026-11-26');
    expect(r.map((c) => [c.dueDate, c.remaining, c.overdue])).toEqual([['2026-11-25', 0, false], ['2026-12-25', 500, false]]);
    expect(p.installmentsOf({ total: 10, dueDate: '2026-12-26T01:30:00.000Z' }, '2026-12-25')[0].dueDate).toBe('2026-12-25');
    expect(p.installmentsOf({ total: 10, dueDate: new Date('2026-12-26T01:30:00.000Z') }, '2026-12-25')[0].dueDate).toBe('2026-12-25');
  });

  it('discountFor', () => {
    const inv = { total: 1180, amountPaid: 0, paymentTerm: p.termSnapshot(t('30-dias-2-10'), 1180, '2026-11-25') };
    expect(p.discountFor(inv, '2026-12-05')).toEqual({ amount: 23.6, until: '2026-12-05' });
    expect(p.discountFor(inv, '2026-12-06')).toBeNull();
    expect(p.discountFor({ ...inv, amountPaid: 100 }, '2026-12-05')).toBeNull();
    expect(p.discountFor({ ...inv, creditNotes: [{ kind: 'pronto_pago' }] }, '2026-12-05')).toBeNull();
  });

  it('validatePaymentTerms: errores', () => {
    const bad = (fn) => { const l = structuredClone(p.DEFAULT_PAYMENT_TERMS); fn(l); return p.validatePaymentTerms(l); };
    expect(bad((l) => { l[1].installments[0].percent = 90; })).toMatch(/sumar 100/);
    expect(bad((l) => l.shift())).toMatch(/contado/);
    expect(bad((l) => { l[7].discount.days = 30; })).toMatch(/descuento/);
    expect(bad((l) => { l[2].id = '15-dias'; })).toMatch(/id repetido/);
    expect(bad((l) => { l[7].discount.days = 1.5; })).toMatch(/descuento/);
    expect(bad((l) => { l[7].discount.percent = ''; })).toMatch(/descuento/);
    expect(bad((l) => { l[2].installments[0].percent = true; })).toMatch(/sumar 100/);
    expect(bad((l) => { l[2].installments[0].days = 400; })).toMatch(/entre 0 y 365/);
  });

  it('missingTermId: detecta un plazo guardado que falta', () => {
    const own = { ...structuredClone(p.DEFAULT_PAYMENT_TERMS[1]), id: 'propio' };
    const cur = [...structuredClone(p.DEFAULT_PAYMENT_TERMS), own];
    expect(p.missingTermId(cur, p.DEFAULT_PAYMENT_TERMS)).toBe('propio');
    expect(p.missingTermId(cur, [...p.DEFAULT_PAYMENT_TERMS, { ...own, active: false }])).toBeNull();
    expect(p.missingTermId(undefined, p.DEFAULT_PAYMENT_TERMS.slice(1))).toBe('contado');
  });

  it('invoiceBalance con nota de crédito', async () => {
    const w = _n === 'app' ? await import('../src/utils/withholdings.js') : await import('../backend/src/services/withholdings.js');
    expect(w.invoiceBalance({ total: 1000, amountPaid: 0, creditedAmount: 200 })).toBe(800);
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (f) => readFileSync(f, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
  expect(body('src/utils/paymentTerms.js')).toBe(body('backend/src/services/paymentTerms.js'));
});
