// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as app from '../src/utils/noteSplit.js';
import * as srv from '../backend/src/services/noteSplit.js';
import { creditNoteToJournalEntries } from '../src/utils/chartOfAccounts.js';
import { buildEcfFromNote } from '../backend/src/services/ecfXmlBuilder.js';
import { generate607Data, generate608Data } from '../src/utils/dgiiReportGenerator.js';

const invoice = {
  id: 'f1', date: new Date('2026-11-01T15:00:00Z'), billedDate: new Date('2026-11-01T15:00:00Z'), ncfNumber: 'E310000000010', ncfType: 'E31', customerRnc: '101010101',
  total: 1062, taxAmount: 108, subtotal: 954, pricesIncludeTax: false,
  items: [
    { id: 'i1', productName: 'Taza', quantity: 2, unitPrice: 300, discountPercent: 0, taxRate: 18 }, // 708 con ITBIS
    { id: 'i2', productName: 'Libro', quantity: 1, unitPrice: 354, discountPercent: 0, taxRate: 0 }, // exento
  ],
};
const lines = [{ ...invoice.items[0], quantity: 1 }];

describe.each([['app', app], ['backend', srv]])('noteSplit (%s)', (_n, m) => {
  it('nota parcial de una taza: base 300, ITBIS 54', () => {
    const r = m.noteAmounts({ amount: 354, reason: 'Taza rota' }, invoice, { lines });
    expect(r).toMatchObject({ base: 300, itbis: 54, exempt: 0 });
  });
  it('nota total: reparte gravado y exento y suma el total', () => {
    const r = m.noteAmounts({ amount: 1062 }, invoice, {});
    expect(r).toMatchObject({ base: 600, itbis: 108, exempt: 300 + 54 });
    expect(r.base + r.itbis + r.exempt).toBeCloseTo(1062, 2);
  });
});

describe('noteSplit', () => {
  it('copias idénticas desde la línea 2', () => {
    const a = readFileSync('src/utils/noteSplit.js', 'utf8').split(/\r?\n/).slice(1).join('\n');
    const b = readFileSync('backend/src/services/noteSplit.js', 'utf8').split(/\r?\n/).slice(1).join('\n');
    expect(a).toBe(b);
  });
  it('el e-CF de la nota declara lo mismo que noteAmounts', () => {
    const note = { amount: 354, reason: 'Taza rota', createdAt: new Date('2026-11-10T15:00:00Z') };
    const { ECF } = buildEcfFromNote(note, invoice, { rnc: '131000000', name: 'E' }, 'E34', 'E340000000001', {}, { lines });
    expect(Number(ECF.Encabezado.Totales.MontoGravadoTotal)).toBe(300);
    expect(Number(ECF.Encabezado.Totales.TotalITBIS)).toBe(54);
  });
  it('607: factura y nota parcial del período son dos líneas; la nota lleva el NCF modificado', () => {
    const note = { id: 'n1', amount: 354, ncfNumber: 'E340000000001', createdAt: new Date('2026-11-10T15:00:00Z'), items: [{ itemId: 'i1', quantity: 1 }], invoice };
    const rows = generate607Data([{ ...invoice, ncfNumber: 'E310000000010', itbis: 108, subtotal: 954 }], [note]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ NCF: 'E340000000001', 'NCF ó Documento Modificado': 'E310000000010', 'Monto Facturado': 300, 'ITBIS Facturado': 54, 'Fecha Comprobante': '20261110' });
    expect(rows[0]['NCF ó Documento Modificado']).toBe('');
    for (const k of ['Efectivo', 'Cheque / Transferencia / Depósito', 'Tarjeta Débito / Crédito', 'Venta a Crédito', 'Bonos o Certificados de Regalo', 'Permuta', 'Otras Formas de Ventas']) expect(rows[1][k]).toBe(0);
  });
  it('factura anulada por una nota total: sigue en el 607 con su nota y no va al 608', () => {
    const voided = { ...invoice, status: 'Anulado', itbis: 108, subtotal: 954, _count: { creditNotes: 1 } };
    const note = { id: 'n2', amount: 1062, ncfNumber: 'E340000000002', createdAt: new Date('2026-11-12T15:00:00Z'), items: [], invoice: voided };
    const rows = generate607Data([voided], [note]);
    expect(rows.map((r) => r.NCF)).toEqual(['E310000000010', 'E340000000002']);
    expect(rows[1]['Monto Facturado'] + rows[1]['ITBIS Facturado']).toBeCloseTo(1062, 2);
    expect(generate608Data([voided])).toEqual([]);
    expect(generate608Data([{ ...voided, _count: { creditNotes: 0 } }])).toHaveLength(1);
  });
  it('607: una nota sin NCF no se declara', () => {
    expect(generate607Data([], [{ id: 'n3', amount: 100, invoice, items: [] }])).toEqual([]);
  });
  it('contabilidad: asientos balanceados con ITBIS por pagar', () => {
    const note = { id: 'n1', amount: 354, ncfNumber: 'E340000000001', createdAt: new Date('2026-11-10T15:00:00Z'), items: [{ itemId: 'i1', quantity: 1 }], invoice };
    const e = creditNoteToJournalEntries(note);
    expect(e.reduce((s, x) => s + x.debit - x.credit, 0)).toBeCloseTo(0, 2);
    expect(e[0].debit).toBe(300);
    expect(e[1].debit).toBe(54);
    expect(e[0].ref).toBe('E340000000001');
  });
  it('nota de 31 días: 607 con ITBIS 0 y asiento sin ITBIS, balanceado; la de 30 días no cambia', () => {
    const mk = (createdAt) => ({ id: 'n9', amount: 354, ncfNumber: 'E340000000009', createdAt, items: [{ itemId: 'i1', quantity: 1 }], invoice });
    const late = mk(new Date('2026-12-02T15:00:00Z')); // 31 días después del 2026-11-01
    const ok = mk(new Date('2026-12-01T15:00:00Z')); // 30 días justos
    expect(srv.isLateNote(late, invoice)).toBe(true);
    expect(srv.isLateNote(ok, invoice)).toBe(false);
    expect(app.isLateNote(late, invoice)).toBe(true);
    const [row] = generate607Data([], [late]);
    expect(row['ITBIS Facturado']).toBe(0);
    expect(row['Monto Facturado']).toBe(300);
    expect(generate607Data([], [ok])[0]['ITBIS Facturado']).toBe(54);
    const e = creditNoteToJournalEntries(late);
    // devoluciones por la base (300), ITBIS asumido (54) y CxC por lo acreditado (354)
    expect(e.map((x) => [x.account.code, x.debit, x.credit])).toEqual([['4103', 300, 0], ['5106', 54, 0], ['1102', 0, 354]]);
    expect(e.reduce((t, x) => t + x.debit - x.credit, 0)).toBeCloseTo(0, 2);
    expect(e.some((x) => x.account.code === '2102')).toBe(false);
    expect(creditNoteToJournalEntries(ok).map((x) => [x.account.code, x.debit, x.credit])).toEqual([['4103', 300, 0], ['2102', 54, 0], ['1102', 0, 354]]);
  });
});
