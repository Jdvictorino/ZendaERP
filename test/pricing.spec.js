import { describe, it, expect } from 'vitest';
import { anyLineFromCategory, checkLinePrice, creditExceeded, allowedDiscountPercent, couponCap } from '../backend/src/services/pricing.js';

const prod = { salePrice: '150.00', wholesalePrice: '130.00', isTaxable: true, taxRate: '18.00' };
const line = (o) => ({ unitPrice: 150, discountPercent: 0, taxRate: 18, ...o });

describe('checkLinePrice', () => {
  it('precio de lista y mayorista no piden permiso', () => {
    expect(checkLinePrice(line({}), prod, null, 5).needsApproval).toBe(false);
    expect(checkLinePrice(line({ unitPrice: 130 }), prod, null, 5).needsApproval).toBe(false);
  });
  it('mayorista nulo no deja pasar precio 0; precio de lista 0 sí', () => {
    expect(checkLinePrice(line({ unitPrice: 0 }), { ...prod, wholesalePrice: null }, null, 5).needsApproval).toBe(true);
    expect(checkLinePrice(line({ unitPrice: 0 }), { ...prod, salePrice: 0, wholesalePrice: null }, null, 5).needsApproval).toBe(false);
  });
  it('variante sin precio propio: producto + ajuste', () => {
    const v = { salePrice: 0, priceAdjustment: '25.00' };
    expect(checkLinePrice(line({ unitPrice: 175 }), prod, v, 5).needsApproval).toBe(false);
    expect(checkLinePrice(line({ unitPrice: 0 }), prod, v, 5).needsApproval).toBe(true);
    expect(checkLinePrice(line({ unitPrice: 150 }), prod, v, 5).needsApproval).toBe(true);
  });
  it('variante con precio propio', () => {
    const v = { salePrice: '200.00' };
    expect(checkLinePrice(line({ unitPrice: 200 }), prod, v, 5).needsApproval).toBe(false);
    expect(checkLinePrice(line({ unitPrice: 150 }), prod, v, 5).needsApproval).toBe(true);
    expect(checkLinePrice(line({ unitPrice: 130 }), prod, v, 5).needsApproval).toBe(false);
  });
  it('ITBIS sale del producto', () => {
    expect(checkLinePrice(line({}), { ...prod, isTaxable: false }, null, 5).taxRate).toBe(0);
    expect(checkLinePrice(line({}), { ...prod, taxRate: '16.00' }, null, 5).taxRate).toBe(16);
  });
  it('descuento sobre el tope pide permiso', () => {
    expect(checkLinePrice(line({ discountPercent: 5 }), prod, null, 5).needsApproval).toBe(false);
    expect(checkLinePrice(line({ discountPercent: 5.01 }), prod, null, 5).needsApproval).toBe(true);
  });
  it('línea sin producto', () => {
    expect(checkLinePrice(line({ taxRate: 16 }), null, null, 5)).toMatchObject({ needsApproval: true, error: null });
    expect(checkLinePrice(line({ taxRate: 12 }), null, null, 5).error).toBe('Tasa de ITBIS no válida');
  });
});

describe('creditExceeded', () => {
  it('compara contra el límite; 0 es sin límite', () => {
    expect(creditExceeded({ creditLimit: '1000.00', pendingBalance: 800, newTotal: 250 })).toBe(true);
    expect(creditExceeded({ creditLimit: '1000.00', pendingBalance: 800, newTotal: 200 })).toBe(false);
    expect(creditExceeded({ creditLimit: 0, pendingBalance: 800, newTotal: 250 })).toBe(false);
  });
});

describe('allowedDiscountPercent', () => {
  const pricing = { maxDiscountPercent: 5, categoryDiscounts: { VIP: 10 } };
  it('toma el mayor entre tope, cliente y categoría', () => {
    expect(allowedDiscountPercent({}, null)).toBe(5);
    expect(allowedDiscountPercent(pricing, { category: 'vip' })).toBe(10);
    expect(allowedDiscountPercent(pricing, { category: 'VIP', defaultDiscount: 12 })).toBe(12);
  });
});

describe('couponCap', () => {
  const offer = { status: 'active', discountType: 'percent', discountValue: '10', validFrom: null, validUntil: null };
  it('porcentaje, fijo y vigencia', () => {
    expect(couponCap(offer, 500)).toBe(50);
    expect(couponCap({ ...offer, discountType: 'fixed', discountValue: '30' }, 500)).toBe(30);
    expect(couponCap({ ...offer, validUntil: new Date(Date.now() - 1000) }, 500)).toBe(0);
    expect(couponCap({ ...offer, status: 'inactive' }, 500)).toBe(0);
  });
});

describe('precio por categoría', () => {
  const rows = [
    { category: 'VIP', packagingId: null, minQuantity: 1, price: '120.00' },
    { category: 'VIP', packagingId: null, minQuantity: 10, price: '100.00' }
  ];
  const p = { ...prod, categoryPrices: rows };
  const ctx = { category: 'vip', categoryDiscountPercent: 10, maxDiscountNoCategory: 5 };
  const run = (o, c = ctx, product = p) => checkLinePrice(line(o), product, null, 10, null, c).needsApproval;

  it('el precio del escalón no pide PIN', () => {
    expect(run({ unitPrice: 100, quantity: 10 })).toBe(false);
    expect(run({ unitPrice: 120, quantity: 3 })).toBe(false);
  });
  it('el precio de un escalón que la cantidad no alcanza pide PIN', () => {
    expect(run({ unitPrice: 100, quantity: 3 })).toBe(true);
  });
  it('con precio de categoría el % de la categoría no cuenta', () => {
    expect(run({ unitPrice: 120, quantity: 3, discountPercent: 8 })).toBe(true);
    expect(run({ unitPrice: 120, quantity: 3, discountPercent: 5 })).toBe(false);
    // base + % que paga lo mismo o más que el precio de la categoría: tope normal (10)
    expect(run({ unitPrice: 150, quantity: 3, discountPercent: 8 })).toBe(false);
    expect(run({ unitPrice: 150, quantity: 3, discountPercent: 12 })).toBe(true);
  });
  it('precio de categoría + % de la categoría pide PIN (neto bajo el precio)', () => {
    expect(run({ unitPrice: 120, quantity: 3, discountPercent: 10 })).toBe(true);
  });
  it('sin ctx o sin filas todo sigue igual', () => {
    expect(checkLinePrice(line({ unitPrice: 100, quantity: 10 }), p, null, 10).needsApproval).toBe(true);
    expect(run({ unitPrice: 150, quantity: 1, discountPercent: 8 }, ctx, prod)).toBe(false);
  });
});

describe('allowedDiscountPercent sin categoría', () => {
  it('withCategory false ignora el % de la categoría', () => {
    const pricing = { maxDiscountPercent: 5, categoryDiscounts: { VIP: 10 } };
    expect(allowedDiscountPercent(pricing, { category: 'VIP', defaultDiscount: 7 }, { withCategory: false })).toBe(7);
    expect(allowedDiscountPercent(pricing, { category: 'VIP' }, { withCategory: false })).toBe(5);
  });
});

describe('anyLineFromCategory', () => {
  const rows = [{ productId: 'p1', category: 'VIP', packagingId: null, minQuantity: 5, price: '100' }];
  const item = (q) => ({ productId: 'p1', packagingId: null, quantity: q, unitPrice: 150 });
  it('línea con escalón aplicable, bajo el escalón y sin categoría', () => {
    expect(anyLineFromCategory([item(5)], 'vip', rows)).toBe(true);
    expect(anyLineFromCategory([item(2)], 'vip', rows)).toBe(false);
    expect(anyLineFromCategory([item(5)], null, rows)).toBe(false);
  });
});
