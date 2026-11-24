import { describe, it, expect } from 'vitest';
import { Prisma } from '../backend/node_modules/@prisma/client/index.js';
import { QUANTITY_FIELDS, resultExtension } from '../backend/src/services/quantityFields.js';

describe('quantityFields', () => {
  const ext = resultExtension(QUANTITY_FIELDS);
  it('convierte Decimal a número', () => {
    expect(ext.result.product.stock.compute({ stock: new Prisma.Decimal('9.500') })).toBe(9.5);
  });
  it('null sigue siendo null', () => {
    expect(ext.result.product.maxStock.compute({ maxStock: null })).toBeNull();
  });
  it('cada modelo y campo tiene su entrada', () => {
    for (const [model, names] of Object.entries(QUANTITY_FIELDS)) {
      for (const n of names) expect(ext.result[model][n]).toBeTruthy();
    }
  });
});
