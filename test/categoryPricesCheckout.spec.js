// @vitest-environment node
// Caja -> servidor: lo que arma la pantalla de cobro con precios por categoría debe validar sin PIN.
import { vi, describe, it, expect } from 'vitest';

vi.mock('../backend/src/db.js', () => ({ default: {} }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/routes/alerts.js', () => ({ createAlert: vi.fn() }));
vi.mock('../backend/src/services/ecfService.js', () => ({ ECF_RECEIVED: ['enviado', 'aceptado'] }));

globalThis.Audio = class { play() {} }; // la vista de caja carga sonidos al importarse

const { validateInvoiceLines } = await import('../backend/src/routes/invoices.js');
const { combinedDiscount } = await import('../src/views/POSBillingOrdersView.jsx');
const { catalogEntries } = await import('../src/views/pos/catalogEntries.js');
const { repriceRow } = await import('../src/views/pos/linePricing.js');

const product = {
  id: 'p1', name: 'Agua', salePrice: '100', isTaxable: true, taxRate: '18', allowFractions: false, status: 'active', variants: [],
  packagings: [{ id: 'k1', name: 'Caja', factor: 12, salePrice: null, status: 'active' }],
  categoryPrices: [
    { category: 'Mayorista', packagingId: null, minQuantity: 1, price: '90' },
    { category: 'Mayorista', packagingId: 'k1', minQuantity: 2, price: '1000' },
  ],
};
const withVariant = { ...product, id: 'p2', variants: [{ id: 'v1', name: 'M', priceAdjustment: '10', stock: 5 }] };
const entries = catalogEntries([product, withVariant]);
const customer = { category: 'mayorista', categoryDiscountPercent: 0 };
const ctx = { category: 'Mayorista', categoryDiscountPercent: 0, maxDiscountNoCategory: 5 };

// arma el item igual que handleProcessOrder
function item(entryId, qty, globalDisc = 0) {
  const e = entries.find((x) => x.id === entryId);
  const row = repriceRow({ originalId: e.productId, basePrice: e.basePrice, categoryPrices: e.categoryPrices, packagingId: e.packagingId, price: e.salePrice, qty, disc: 0 }, customer);
  return { productId: e.productId, variantId: e.variantId || null, productName: e.name, quantity: qty, packagingId: e.packagingId, unitPrice: row.price, discountPercent: combinedDiscount(row.disc, globalDisc), taxRate: 18 };
}
const check = (items) => validateInvoiceLines(items, new Map([['p1', product], ['p2', withVariant]]), 10, ctx);

describe('caja -> servidor con precios por categoría', () => {
  it('línea base, empaque en escalón y variante no piden PIN', () => {
    expect(check([item('p1', 1)]).needsApproval).toBe(false);
    expect(check([item('p1#k1', 2)]).needsApproval).toBe(false);
    expect(check([item('p2:v1', 3)]).needsApproval).toBe(false);
  });
  it('un % general por encima del tope pide PIN', () => {
    expect(check([item('p1', 1, 20)]).needsApproval).toBe(true);
  });
});
