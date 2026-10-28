import { computeTotals, combinedDiscount } from '../src/views/POSBillingOrdersView.jsx';

// Misma fórmula que backend/src/routes/invoices.js (POST /invoices): precio con ITBIS incluido, descuento por línea.
const backendTotal = (items) => items.reduce((acc, it) => {
  const lineTotal = it.quantity * it.unitPrice * (1 - it.discountPercent / 100);
  const base = lineTotal / (it.taxRate > 0 ? 1 + it.taxRate / 100 : 1);
  return { total: acc.total + lineTotal, tax: acc.tax + (lineTotal - base) };
}, { total: 0, tax: 0 });

const rows = [
  { price: 1180, qty: 2, disc: 10, taxable: true },   // gravado con descuento de línea
  { price: 500, qty: 1, disc: 0, taxable: false },    // exento
  { price: 99.99, qty: 3, disc: 5, taxable: true },
];

describe('POS: totales y descuentos', () => {
  it('combina descuento de línea y general', () => {
    expect(combinedDiscount(0, 0)).toBe(0);
    expect(combinedDiscount(10, 0)).toBe(10);
    expect(combinedDiscount(0, 10)).toBe(10);
    expect(combinedDiscount(10, 10)).toBeCloseTo(19, 6);
    expect(combinedDiscount(100, 50)).toBe(100);
  });

  for (const globalDisc of [0, 7.5, 15]) {
    it(`el total que ve el cajero coincide con el del backend (descuento general ${globalDisc}%)`, () => {
      const pos = computeTotals(rows, globalDisc);
      const sent = rows.map(r => ({ quantity: r.qty, unitPrice: r.price, discountPercent: combinedDiscount(r.disc, globalDisc), taxRate: r.taxable ? 18 : 0 }));
      const be = backendTotal(sent);
      expect(pos.total).toBeCloseTo(be.total, 2);
      expect(pos.tax).toBeCloseTo(be.tax, 2);
      expect(pos.subtotal + pos.tax).toBeCloseTo(pos.total, 6);
    });
  }

  it('sin descuento general no muestra monto de descuento', () => {
    expect(computeTotals(rows, 0).discAmt).toBeCloseTo(0, 10);
  });
});
