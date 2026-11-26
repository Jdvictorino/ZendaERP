import { describe, it, expect } from 'vitest';
import { planInvoicePayment } from '../backend/src/services/invoicePayment.js';

const inv = { total: '1180', taxAmount: '180', amountPaid: '0', itbisRetenido: '0', retencionRenta: '0' };

describe('planInvoicePayment', () => {
  it('cobro en dos partes con retención en la segunda', () => {
    const a = planInvoicePayment(inv, { amountPaid: 500 }, { manager: false });
    expect(a.data).toEqual({ amountPaid: 500, status: 'Pagado Parcialmente' });
    const b = planInvoicePayment({ ...inv, amountPaid: '500' }, { amountPaid: 1000, itbisRetenido: 180 }, { manager: false });
    expect(b.data).toMatchObject({ amountPaid: 1000, itbisRetenido: 180, status: 'Pagado' });
  });
  it('rechaza pasar el total o los topes', () => {
    expect(planInvoicePayment(inv, { amountPaid: 1100, itbisRetenido: 180 }, { manager: true }).error).toBeTruthy();
    expect(planInvoicePayment(inv, { itbisRetenido: 200 }, { manager: true }).error).toMatch(/ITBIS/);
    expect(planInvoicePayment(inv, { retencionRenta: 1100 }, { manager: true }).error).toMatch(/ISR/);
  });
  it('un cajero no reduce una retención guardada; un gerente sí', () => {
    const saved = { ...inv, amountPaid: '1000', itbisRetenido: '180' };
    expect(planInvoicePayment(saved, { itbisRetenido: 0 }, { manager: false }).httpStatus).toBe(403);
    expect(planInvoicePayment(saved, { itbisRetenido: 0 }, { manager: true }).data.status).toBe('Pagado Parcialmente');
  });
  it('con retención guardada, el estado usa el acumulado', () => {
    const saved = { ...inv, itbisRetenido: '180' };
    expect(planInvoicePayment(saved, { amountPaid: 1000 }, { manager: false }).data.status).toBe('Pagado');
  });
  it('las notas de crédito parciales cuentan como saldado', () => {
    const c = { ...inv, total: '1000', taxAmount: '0', creditedAmount: '200' };
    expect(planInvoicePayment(c, { amountPaid: 800 }, { manager: false }).data.status).toBe('Pagado');
    expect(planInvoicePayment(c, { amountPaid: 900 }, { manager: false }).error).toBeTruthy();
  });
  it('sin campos de cobro no cambia nada; anulada no cambia estado', () => {
    expect(planInvoicePayment(inv, { notes: 'x' }, { manager: false })).toEqual({ data: {} });
    expect(planInvoicePayment({ ...inv, voided: true }, { amountPaid: 10 }, { manager: false }).data).toEqual({ amountPaid: 10 });
  });
  it('fecha de retención', () => {
    expect(planInvoicePayment(inv, { retentionDate: '2026-11-20' }, { manager: false }).data.retentionDate.toISOString()).toMatch(/^2026-11-20/);
    for (const d of ['2026-13-01', '2026-02-31']) expect(planInvoicePayment(inv, { retentionDate: d }, { manager: false }).error).toBe('Fecha de retención inválida.');
    expect(planInvoicePayment(inv, { retentionDate: 'x' }, { manager: false }).error).toBeTruthy();
  });
});
