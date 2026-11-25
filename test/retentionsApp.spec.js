import { describe, it, expect } from 'vitest';
import { invoiceToJournalEntries, expenseToJournalEntries, ACCOUNTS } from '../src/utils/chartOfAccounts.js';
import { generate607Data } from '../src/utils/dgiiReportGenerator.js';

const sum = (es, k) => Math.round(es.reduce((s, e) => s + e[k], 0) * 100) / 100;
const by = (es, acc) => es.filter((e) => e.account.code === acc.code);
const inv = { id: 'i1', total: 1180, taxAmount: 180, billedDate: '2026-03-10T00:00:00Z' };

describe('asientos de factura con retenciones', () => {
  it('sin retenciones cuadran y no tocan las cuentas nuevas', () => {
    for (const amountPaid of [0, 500, 1180]) {
      const es = invoiceToJournalEntries({ ...inv, amountPaid });
      expect(sum(es, 'debit')).toBe(sum(es, 'credit'));
      expect(by(es, ACCOUNTS.ITBIS_WITHHELD_BY_THIRDS)).toHaveLength(0);
    }
    expect(invoiceToJournalEntries({ ...inv, amountPaid: 0 }).map((e) => e.debit)).toEqual([1180, 0, 0]);
  });
  it('con retenciones cuadran (a crédito, parcial y cobrada)', () => {
    for (const amountPaid of [0, 400, 1000]) {
      const es = invoiceToJournalEntries({ ...inv, amountPaid, itbisRetenido: '180.00', retencionRenta: '0' });
      expect(sum(es, 'debit')).toBe(sum(es, 'credit'));
      expect(by(es, ACCOUNTS.ITBIS_WITHHELD_BY_THIRDS)[0].debit).toBe(180);
    }
    const es = invoiceToJournalEntries({ ...inv, amountPaid: 0, itbisRetenido: 100, retencionRenta: 50 });
    expect(by(es, ACCOUNTS.ACCOUNTS_RECEIVABLE)[0].debit).toBe(1030);
    expect(by(es, ACCOUNTS.ISR_WITHHELD_BY_THIRDS)[0].debit).toBe(50);
  });
});

describe('asientos de gasto con retenciones', () => {
  const exp = { id: 'e1', montoFacturado: 1180, itbisFacturado: 180, invoiceDate: '2026-03-10' };
  it('sin retenciones quedan igual', () => {
    const es = expenseToJournalEntries(exp);
    expect(sum(es, 'debit')).toBe(sum(es, 'credit'));
    expect(by(es, ACCOUNTS.ACCOUNTS_PAYABLE)[0].credit).toBe(1180);
    expect(by(es, ACCOUNTS.WITHHOLDINGS_PAYABLE)).toHaveLength(0);
  });
  it('con retenciones cuadran y bajan lo que se le debe al suplidor', () => {
    for (const extra of [{}, { paymentDate: '2026-03-11' }]) {
      const es = expenseToJournalEntries({ ...exp, ...extra, itbisRetenido: '180', montoRetencionIsr: '100' });
      expect(sum(es, 'debit')).toBe(sum(es, 'credit'));
      expect(by(es, ACCOUNTS.WITHHOLDINGS_PAYABLE)[0].credit).toBe(280);
    }
    const es = expenseToJournalEntries({ ...exp, itbisRetenido: 180, montoRetencionIsr: 100 });
    expect(by(es, ACCOUNTS.ACCOUNTS_PAYABLE)[0].credit).toBe(900);
  });
});

describe('607 con retenciones', () => {
  const base = { id: 'i1', ncf: 'B0100000001', total: 1180, subtotal: 1000, taxAmount: 180, billedDate: '2026-03-10T00:00:00Z', paymentStatus: 'Pagado' };
  it('con retención', () => {
    const [r] = generate607Data([{ ...base, itbisRetenido: '180.00', retencionRenta: '25.50', retentionDate: '2026-03-20T00:00:00.000Z' }]);
    expect(r['ITBIS Retenido por Terceros']).toBe(180);
    expect(r['Retención Renta por Terceros']).toBe(25.5);
    expect(r['Fecha de Retención']).toBe('20260320');
  });
  it('sin retención', () => {
    const [r] = generate607Data([{ ...base, itbisRetenido: '0.00', retencionRenta: '0.00', retentionDate: null }]);
    expect(r['ITBIS Retenido por Terceros']).toBe(0);
    expect(r['Retención Renta por Terceros']).toBe(0);
    expect(r['Fecha de Retención']).toBe('');
  });
});
