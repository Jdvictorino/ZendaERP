import { transformProductData } from '../backend/src/routes/products.js';

describe('transformProductData', () => {
  it('al crear, costo y mínimo faltantes quedan en 0', () => {
    expect(transformProductData({ name: 'A' }, true)).toMatchObject({ costPrice: 0, minStock: 0 });
  });
  it('en un PUT parcial no inventa costo ni mínimo (no borra el promedio)', () => {
    const r = transformProductData({ name: 'A' });
    expect('costPrice' in r && r.costPrice !== undefined).toBe(false);
    expect(r.minStock).toBeUndefined();
  });
  it('purchasePrice sigue valiendo como costPrice', () => {
    expect(transformProductData({ purchasePrice: 6.1235 }).costPrice).toBe(6.1235);
  });
});
