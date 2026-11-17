import { computeTotals, combinedDiscount } from '../src/views/POSBillingOrdersView.jsx';
import { invoiceTotals } from '../src/utils/tax.js';

// Precios sin ITBIS: base = precio × cant. tras descuentos; ITBIS por línea sobre esa base; total = base + ITBIS.
const rows = [
  { price: 1000, qty: 2, disc: 10, taxable: true, taxRate: 18 },
  { price: 500, qty: 1, disc: 0, taxable: false, taxRate: 0 },
  { price: 99.99, qty: 3, disc: 5, taxable: true, taxRate: 16 },
];
const sentLines = (rs, g, exempt = false) => rs.map(r => ({
  quantity: r.qty, unitPrice: r.price, discountPercent: combinedDiscount(r.disc, g),
  taxRate: exempt || !r.taxable ? 0 : r.taxRate,
}));

describe('POS: totales y descuentos', () => {
  it('combina descuento de línea y general', () => {
    expect(combinedDiscount(0, 0)).toBe(0);
    expect(combinedDiscount(10, 0)).toBe(10);
    expect(combinedDiscount(0, 10)).toBe(10);
    expect(combinedDiscount(10, 10)).toBeCloseTo(19, 6);
    expect(combinedDiscount(100, 50)).toBe(100);
  });

  it('una línea de 100 sin ITBIS: base 100, ITBIS 18, total 118', () => {
    const r = [{ price: 100, qty: 1, disc: 0, taxable: true, taxRate: 18 }];
    expect(computeTotals(r, 0)).toMatchObject({ subtotal: 100, tax: 18, total: 118 });
    expect(computeTotals(r, 10)).toMatchObject({ subtotal: 90, tax: 16.2, total: 106.2 });
    expect(computeTotals(r, 0, { exempt: true })).toMatchObject({ subtotal: 100, tax: 0, total: 100 });
  });

  for (const globalDisc of [0, 7.5, 15]) {
    for (const exempt of [false, true]) {
      it(`coincide con invoiceTotals (descuento general ${globalDisc}%, exento ${exempt})`, () => {
        const pos = computeTotals(rows, globalDisc, { exempt });
        const t = invoiceTotals(sentLines(rows, globalDisc, exempt));
        expect(pos.subtotal).toBeCloseTo(t.subtotal, 2);
        expect(pos.tax).toBeCloseTo(t.taxAmount, 2);
        expect(pos.total).toBeCloseTo(t.total, 2);
        expect(pos.subtotal + pos.tax).toBeCloseTo(pos.total, 6);
      });
    }
  }

  it('sin descuento general no muestra monto de descuento por el general', () => {
    const r = [{ price: 100, qty: 2, disc: 0, taxable: true, taxRate: 18 }];
    expect(computeTotals(r, 0).discAmt).toBeCloseTo(0, 10);
  });
});

describe('computeTotals: ITBIS de cada producto', () => {
  it('un exento no lleva ITBIS y uno al 16 % usa su tasa', () => {
    const t = computeTotals([
      { price: 100, qty: 1, disc: 0, taxable: false, taxRate: 0 },
      { price: 100, qty: 1, disc: 0, taxable: true, taxRate: 16 },
    ], 0);
    expect(t.tax).toBeCloseTo(16, 2);
    expect(t.total).toBeCloseTo(216, 2);
  });
});
