import { orderTotals, planReceipt, nextStatus, planInvoice, purchaseSuggestions, allocateCharges, averageCost, validateCharges } from '../backend/src/services/purchases.js';

const item = (o = {}) => ({ id: 'i1', productId: 'p1', quantity: 10, receivedQuantity: 0, invoicedQuantity: 0, unitCost: 100, taxRate: 18, packagingId: null, packagingFactor: 1, ...o });
const prods = { p1: { name: 'Agua', allowFractions: false }, p2: { name: 'Queso', allowFractions: true } };

describe('compras', () => {
  it('orderTotals', () => {
    expect(orderTotals([{ quantity: 2, unitCost: '100', taxRate: 18 }, { quantity: 1, unitCost: 50, taxRate: 0 }])).toEqual({ subtotal: 250, itbis: 36, total: 286 });
  });

  it('planReceipt: caja de 24 a 1200 -> base 48, costo 50', () => {
    const r = planReceipt([item({ quantity: 5, unitCost: '1200', packagingId: 'k', packagingFactor: '24' })], [{ itemId: 'i1', quantity: 2 }], prods);
    expect(r.error).toBeNull();
    expect(r.changes).toEqual([{ itemId: 'i1', productId: 'p1', quantity: 2, baseQuantity: 48, newReceived: 2, costPrice: 50, unitCostFinal: 50 }]);
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

  it('planReceipt: empaque de 12 a 120 con flete 12 -> costo final 11', () => {
    const r = planReceipt([item({ quantity: 5, unitCost: 120, packagingId: 'k', packagingFactor: 12 })], [{ itemId: 'i1', quantity: 1 }], prods, { flete: 12 });
    expect(r.changes[0]).toMatchObject({ baseQuantity: 12, unitCostFinal: 11, costPrice: 11 });
  });

  describe('allocateCharges', () => {
    it('reparte por valor', () => {
      expect(allocateCharges([{ itemId: 'a', quantity: 1, unitCost: 100, factor: 1 }, { itemId: 'b', quantity: 1, unitCost: 300, factor: 1 }], { flete: 40 })).toEqual({ a: 10, b: 30 });
    });
    it('el redondeo suma exacto', () => {
      const ls = ['a', 'b', 'c'].map((itemId) => ({ itemId, quantity: 1, unitCost: 10, factor: 1 }));
      const r = allocateCharges(ls, { otros: 10 });
      expect(Math.round((r.a + r.b + r.c) * 100)).toBe(1000);
    });
    it('todo bonificación -> por cantidad base', () => {
      expect(allocateCharges([{ itemId: 'a', quantity: 1, unitCost: 0, factor: 1 }, { itemId: 'b', quantity: 3, unitCost: 0, factor: 1 }], { flete: 40 })).toEqual({ a: 10, b: 30 });
    });
  });

  it('averageCost', () => {
    expect(averageCost(10, 5, 10, 7)).toBe(6);
    expect(averageCost(-3, 5, 10, 7)).toBe(7);
    expect(averageCost(0, 0, 0, 0)).toBe(0);
    expect(averageCost(10, 6, 10, 0)).toBe(3);
  });

  it('validateCharges', () => {
    expect(validateCharges({ flete: -1 })).toMatch(/flete/i);
    expect(validateCharges({ seguro: 'abc' })).toEqual(expect.any(String));
    expect(validateCharges({ flete: 5, otros: '2' })).toBeNull();
    expect(validateCharges(undefined)).toBeNull();
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
    const base = { id: 'a', supplierId: 's1', minStock: 10, maxStock: 50, stock: 4, costPrice: 5, status: 'active' };
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
        products: [{ ...base, id: 'b', supplierId: null }, { ...base, id: 'c', hasVariants: true }, { ...base, id: 'd', stock: 11 }, { ...base, id: 'e' }, { ...base, id: 'f', status: 'inactive' }],
        pendingByProduct: { e: 60 }, lastPackagingByProduct: {}
      });
      expect(r.noSupplier.map((l) => l.productId)).toEqual(['b']);
      expect(r.reviewByHand.map((p) => p.id)).toEqual(['c']);
      expect(r.bySupplier).toEqual({});
    });
  });
});

import { validateOrderLines } from '../backend/src/services/purchases.js';
describe('validateOrderLines', () => {
  const P = {
    a: { name: 'Agua', allowFractions: false, isTaxable: true, taxRate: '18', status: 'active', packagings: [{ id: 'k', name: 'Caja x24', factor: '24', status: 'active' }, { id: 'z', name: 'Vieja', factor: 6, status: 'inactive' }] },
    v: { name: 'Camisa', status: 'active', hasVariants: true },
    e: { name: 'Libro', allowFractions: true, isTaxable: false, taxRate: 18, status: 'active', packagings: [] }
  };
  const ok = (l) => validateOrderLines([l], P);
  it('normaliza con empaque e ITBIS del producto', () => {
    expect(ok({ productId: 'a', packagingId: 'k', quantity: 2, unitCost: '1200', taxRate: 0 }).lines[0])
      .toEqual({ productId: 'a', packagingId: 'k', packagingName: 'Caja x24', packagingFactor: 24, quantity: 2, unitCost: 1200, taxRate: 18 });
    expect(ok({ productId: 'e', quantity: 1.5, unitCost: 0 }).lines[0]).toMatchObject({ packagingFactor: 1, packagingName: null, taxRate: 0 });
  });
  it('rechaza lo inválido', () => {
    expect(validateOrderLines([], P).error).toMatch(/al menos/);
    expect(ok({ productId: 'x', quantity: 1, unitCost: 1 }).error).toMatch(/no existe/);
    expect(ok({ productId: 'v', quantity: 1, unitCost: 1 }).error).toMatch(/variantes/);
    expect(ok({ productId: 'a', packagingId: 'z', quantity: 1, unitCost: 1 }).error).toMatch(/empaque/);
    expect(ok({ productId: 'a', quantity: 1.5, unitCost: 1 }).error).toMatch(/enteras/);
    expect(ok({ productId: 'a', quantity: 1, unitCost: -1 }).error).toMatch(/costo/);
  });
});

describe('validateOrderLines: redondeo', () => {
  it('redondea el costo a 2 decimales antes de los totales', () => {
    const P = { a: { name: 'A', allowFractions: false, isTaxable: false, taxRate: 0, status: 'active', packagings: [] } };
    const l = validateOrderLines([{ productId: 'a', quantity: 1000, unitCost: 1.005 }], P).lines;
    expect(l[0].unitCost).toBe(1.01);
    expect(orderTotals(l).subtotal).toBe(1010);
  });
});
