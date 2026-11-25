import { orderTotals, planReceipt, nextStatus, planInvoice, purchaseSuggestions } from '../backend/src/services/purchases.js';

const item = (o = {}) => ({ id: 'i1', productId: 'p1', quantity: 10, receivedQuantity: 0, invoicedQuantity: 0, unitCost: 100, taxRate: 18, packagingId: null, packagingFactor: 1, ...o });
const prods = { p1: { name: 'Agua', allowFractions: false }, p2: { name: 'Queso', allowFractions: true } };

describe('compras', () => {
  it('orderTotals', () => {
    expect(orderTotals([{ quantity: 2, unitCost: '100', taxRate: 18 }, { quantity: 1, unitCost: 50, taxRate: 0 }])).toEqual({ subtotal: 250, itbis: 36, total: 286 });
  });

  it('planReceipt: caja de 24 a 1200 -> base 48, costo 50', () => {
    const r = planReceipt([item({ quantity: 5, unitCost: '1200', packagingId: 'k', packagingFactor: '24' })], [{ itemId: 'i1', quantity: 2 }], prods);
    expect(r.error).toBeNull();
    expect(r.changes).toEqual([{ itemId: 'i1', productId: 'p1', quantity: 2, baseQuantity: 48, newReceived: 2, costPrice: 50 }]);
  });
  it('planReceipt: errores', () => {
    const o = [item({ quantity: 5, receivedQuantity: 4 })];
    expect(planReceipt(o, [{ itemId: 'i1', quantity: 2 }], prods).error).toMatch(/más de lo pendiente de "Agua"/);
    expect(planReceipt(o, [{ itemId: 'x', quantity: 1 }], prods).error).toEqual(expect.any(String));
    expect(planReceipt(o, [{ itemId: 'i1', quantity: 0 }], prods).error).toEqual(expect.any(String));
    const pk = [item({ packagingId: 'k', packagingFactor: 12 })];
    expect(planReceipt(pk, [{ itemId: 'i1', quantity: 1.5 }], prods).error).toEqual(expect.any(String));
  });
  it('planReceipt: ignora cantidad 0 si hay otra', () => {
    const o = [item(), item({ id: 'i2' })];
    expect(planReceipt(o, [{ itemId: 'i1', quantity: 0 }, { itemId: 'i2', quantity: 3 }], prods).changes).toHaveLength(1);
  });

  it('nextStatus', () => {
    expect(nextStatus([{ quantity: 5, receivedQuantity: 5 }, { quantity: 2, receivedQuantity: 1 }])).toBe('parcial');
    expect(nextStatus([{ quantity: 5, receivedQuantity: '5' }, { quantity: 2, receivedQuantity: 2 }])).toBe('recibida');
  });

  it('planInvoice', () => {
    const o = [item({ quantity: 10, receivedQuantity: 6, invoicedQuantity: 2 })];
    const r = planInvoice(o, [{ itemId: 'i1', quantity: 4 }]);
    expect(r).toEqual({ montoBienes: 400, itbisFacturado: 72, updates: [{ itemId: 'i1', newInvoiced: 6 }], error: null });
    expect(planInvoice(o, [{ itemId: 'i1', quantity: 5 }]).error).toEqual(expect.any(String));
  });

  describe('purchaseSuggestions', () => {
    const base = { id: 'a', supplierId: 's1', minStock: 10, maxStock: 50, stock: 4, costPrice: 5, isActive: true };
    it('caja de 12: necesidad 50-4-6=40 -> 4 cajas', () => {
      const r = purchaseSuggestions({ products: [base], pendingByProduct: { a: 6 }, lastPackagingByProduct: { a: { packagingId: 'k', packagingName: 'Caja', packagingFactor: 12 } } });
      expect(r.bySupplier.s1).toEqual([{ productId: 'a', packagingId: 'k', packagingName: 'Caja', packagingFactor: 12, quantity: 4, unitCost: 60 }]);
    });
    it('sin max -> objetivo 20, base, redondea hacia arriba', () => {
      const r = purchaseSuggestions({ products: [{ ...base, maxStock: null, stock: 10, costPrice: '3' }], pendingByProduct: {}, lastPackagingByProduct: {} });
      expect(r.bySupplier.s1[0]).toMatchObject({ packagingId: null, packagingName: null, packagingFactor: 1, quantity: 10, unitCost: 3 });
    });
    it('sin suplidor, variantes, no bajo mínimo, cubierto', () => {
      const r = purchaseSuggestions({
        products: [{ ...base, id: 'b', supplierId: null }, { ...base, id: 'c', hasVariants: true }, { ...base, id: 'd', stock: 11 }, { ...base, id: 'e' }],
        pendingByProduct: { e: 60 }, lastPackagingByProduct: {}
      });
      expect(r.noSupplier.map((l) => l.productId)).toEqual(['b']);
      expect(r.reviewByHand.map((p) => p.id)).toEqual(['c']);
      expect(r.bySupplier).toEqual({});
    });
  });
});
