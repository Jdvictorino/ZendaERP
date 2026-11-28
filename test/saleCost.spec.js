// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { lineCost } from '../backend/src/services/saleCost.js';
import { lineCostFor } from '../src/utils/saleCost.js';
import { invoiceToJournalEntries, creditNoteToJournalEntries, generateAllJournalEntries } from '../src/utils/chartOfAccounts.js';

const base = { id: 'f1', date: new Date('2026-11-01T15:00:00Z'), total: 1000, subtotal: 1000, taxAmount: 0, amountPaid: 1000, status: 'Pagado' };

describe('lineCost', () => {
  it('variante con costo 8 -> 8', () => expect(lineCost({ costPrice: 5 }, { purchasePrice: 8 })).toBe(8));
  it('variante con costo 0 -> el del producto', () => expect(lineCost({ costPrice: 5 }, { purchasePrice: 0 })).toBe(5));
  it('sin variante -> el del producto', () => expect(lineCost({ costPrice: '5.5' }, null)).toBe(5.5));
  it('sin producto -> null', () => expect(lineCost(null, null)).toBeNull());
});

describe('asiento de venta', () => {
  it('2 cajas de factor 12 con costo 5 -> costo de ventas 120', () => {
    const e = invoiceToJournalEntries({ ...base, items: [{ quantity: 2, packagingFactor: 12, costPrice: 5 }] });
    const c = e.find((x) => x.desc.startsWith('Costo de venta'));
    expect(c.debit).toBe(120);
    expect(e.find((x) => x.desc.startsWith('Salida de inventario')).credit).toBe(120);
  });
  it('línea con costPrice null no suma', () => {
    const e = invoiceToJournalEntries({ ...base, items: [{ quantity: 2, packagingFactor: 12, costPrice: null }, { quantity: 1, costPrice: 3 }] });
    expect(e.find((x) => x.desc.startsWith('Costo de venta')).debit).toBe(3);
  });
});

describe('nota de crédito con devolución', () => {
  it('1 caja devuelta: débito a Inventario 60 y crédito a Costo de Ventas 60, cuadrado', () => {
    const invoice = { ...base, total: 1180, subtotal: 1000, taxAmount: 180, pricesIncludeTax: false, items: [{ id: 'i1', productName: 'Caja', quantity: 2, packagingFactor: 12, unitPrice: 500, discountPercent: 0, taxRate: 18, costPrice: 5 }] };
    const note = { id: 'n1', amount: 590, createdAt: new Date('2026-11-05T15:00:00Z'), items: [{ itemId: 'i1', quantity: 1 }], invoice };
    const e = creditNoteToJournalEntries(note);
    expect(e.find((x) => x.account.code === '1103').debit).toBe(60);
    expect(e.find((x) => x.desc.startsWith('Reverso costo')).credit).toBe(60);
    expect(e.reduce((s, x) => s + x.debit - x.credit, 0)).toBeCloseTo(0, 2);
  });
  it('sin costPrice no inventa costo', () => {
    const invoice = { ...base, items: [{ id: 'i1', quantity: 2, unitPrice: 500, discountPercent: 0, taxRate: 0, costPrice: null }] };
    const e = creditNoteToJournalEntries({ id: 'n2', amount: 500, createdAt: new Date(), items: [{ itemId: 'i1', quantity: 1 }], invoice });
    expect(e.some((x) => x.account.code === '1103')).toBe(false);
  });
});

describe('costo del reporte', () => {
  const products = new Map([['p1', { costPrice: 7, variants: [] }]]);
  it('con costPrice usa ese costo', () => expect(lineCostFor({ productId: 'p1', costPrice: 5 }, products)).toBe(5));
  it('con null usa el costo actual del producto', () => expect(lineCostFor({ productId: 'p1', costPrice: null }, products)).toBe(7));
  it('con null y sin producto, 0', () => expect(lineCostFor({ costPrice: null }, products)).toBe(0));
});

describe('facturas anuladas en el diario', () => {
  const items = [{ quantity: 1, costPrice: 3 }];
  it('anulada sin notas no genera asientos', () => {
    expect(generateAllJournalEntries({ invoices: [{ ...base, status: 'Anulado', items, _count: { creditNotes: 0 } }, { ...base, id: 'f2', status: 'Cancelado', items }] })).toEqual([]);
  });
  it('anulada con nota total sigue (venta y costo), igual que su nota', () => {
    const e = generateAllJournalEntries({ invoices: [{ ...base, status: 'Anulado', items, _count: { creditNotes: 1 } }] });
    expect(e.some((x) => x.desc.startsWith('Costo de venta'))).toBe(true);
    expect(e.some((x) => x.account.code === '4101' || x.credit === 1000)).toBe(true);
  });
  it('costo redondeado a 2 decimales: 1.2345 x 3 = 3.70', () => {
    const e = invoiceToJournalEntries({ ...base, items: [{ quantity: 3, costPrice: 1.2345 }] });
    expect(e.find((x) => x.desc.startsWith('Costo de venta')).debit).toBe(3.7);
  });
});
