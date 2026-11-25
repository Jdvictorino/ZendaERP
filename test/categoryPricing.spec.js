import { readFileSync } from 'fs';
import * as server from '../backend/src/services/categoryPricing.js';
import * as app from '../src/utils/categoryPricing.js';

describe.each([['servidor', server], ['app', app]])('categoryPricing (%s)', (_n, m) => {
  const base = { basePrice: 120, category: 'Mayorista', packagingId: null, quantity: 1, categoryDiscountPercent: 7 };
  const tiers = [
    { category: 'Mayorista', packagingId: null, minQuantity: '1', price: '100' },
    { category: 'Mayorista', packagingId: null, minQuantity: '10', price: '90' },
    { category: 'Mayorista', packagingId: null, minQuantity: '50', price: '80' },
  ];

  it('sameCategory ignora mayúsculas y espacios', () => {
    expect(m.sameCategory(' mayorista ', 'Mayorista')).toBe(true);
    expect(m.sameCategory('A', 'B')).toBe(false);
  });

  it('sin filas: precio base y descuento de la categoría', () => {
    expect(m.resolveUnitPrice({ ...base, categoryPrices: [] })).toEqual({ price: 120, discountPercent: 7, fromCategory: false });
  });

  it('escalones por cantidad', () => {
    const p = (quantity) => m.resolveUnitPrice({ ...base, quantity, categoryPrices: tiers });
    expect(p(9.999)).toEqual({ price: 100, discountPercent: 0, fromCategory: true });
    expect(p(10).price).toBe(90);
    expect(p(60).price).toBe(80);
  });

  it('la fila de empaque no aplica a línea base y viceversa', () => {
    const rows = [{ category: 'Mayorista', packagingId: 'p1', minQuantity: 1, price: 50 }];
    expect(m.resolveUnitPrice({ ...base, categoryPrices: rows }).fromCategory).toBe(false);
    expect(m.resolveUnitPrice({ ...base, packagingId: 'p1', categoryPrices: rows }).price).toBe(50);
    expect(m.resolveUnitPrice({ ...base, packagingId: 'p1', categoryPrices: tiers }).fromCategory).toBe(false);
  });

  it('"mayorista" encuentra la fila de "Mayorista"', () => {
    expect(m.resolveUnitPrice({ ...base, category: 'mayorista', categoryPrices: tiers }).price).toBe(100);
  });

  it('cliente sin categoría usa el precio base', () => {
    expect(m.resolveUnitPrice({ ...base, category: null, categoryPrices: tiers })).toEqual({ price: 120, discountPercent: 7, fromCategory: false });
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (p) => readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
  expect(body('src/utils/categoryPricing.js')).toBe(body('backend/src/services/categoryPricing.js'));
});
