import { describe, it, expect } from 'vitest';
import { repriceRow } from '../src/views/pos/linePricing.js';

const cp = [{ category: 'Mayorista', packagingId: null, minQuantity: 1, price: '90' }, { category: 'Mayorista', packagingId: null, minQuantity: 10, price: '80' }];
const row = { originalId: 'p1', basePrice: 100, categoryPrices: cp, packagingId: null, qty: 1, price: 100, disc: 0 };
const may = { category: 'mayorista ', categoryDiscountPercent: 5 };

describe('repriceRow', () => {
  it('aplica el escalón al subir la cantidad y vuelve al anterior al bajarla', () => {
    expect(repriceRow({ ...row, qty: 10 }, may)).toMatchObject({ price: 80, disc: 0 });
    expect(repriceRow({ ...row, qty: 9 }, may)).toMatchObject({ price: 90, disc: 0 });
  });
  it('cliente sin categoría: precio base y sin descuento', () => {
    expect(repriceRow({ ...row, qty: 10, price: 80 }, { category: '', categoryDiscountPercent: 0 })).toMatchObject({ price: 100, disc: 0 });
  });
  it('el % de la categoría solo va en líneas sin precio propio', () => {
    expect(repriceRow({ ...row, categoryPrices: [] }, may)).toMatchObject({ price: 100, disc: 5 });
  });
  it('respeta precio y descuento manuales', () => {
    expect(repriceRow({ ...row, price: 77, manualPrice: true, manualDisc: true, disc: 3 }, may)).toMatchObject({ price: 77, disc: 3 });
  });
  it('línea libre intacta', () => {
    const free = { price: 5, qty: 1, disc: 0 };
    expect(repriceRow(free, may)).toBe(free);
  });
});
