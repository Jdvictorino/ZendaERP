import { describe, it, expect } from 'vitest';
import { catalogEntries } from '../src/views/pos/catalogEntries.js';

const box = { id: 'k1', name: 'Caja de 24', factor: 24, unitCode: 'unidad', barcode: '777', salePrice: null, status: 'active' };

describe('catalogEntries', () => {
  it('da entrada base y de empaque con precio factor x base', () => {
    const e = catalogEntries([{ id: 'p1', name: 'Agua', salePrice: '50', unit: 'unidad', allowFractions: true, stock: 100, packagings: [box] }]);
    expect(e).toHaveLength(2);
    expect(e[1]).toMatchObject({ packagingId: 'k1', factor: 24, salePrice: 1200, barcode: '777', id: 'p1#k1', baseId: 'p1' });
    expect(e[0]).toMatchObject({ packagingId: null, factor: 1, salePrice: '50', productId: 'p1', unitAbbr: 'ud.', allowFractions: true });
    expect(e[1]).toMatchObject({ productId: 'p1', allowFractions: true, unitAbbr: 'ud.', packagingName: 'Caja de 24' });
  });
  it('un empaque por cada variante', () => {
    const e = catalogEntries([{ id: 'p1', name: 'Camisa', salePrice: '50', unit: 'unidad', variants: [{ id: 'a', name: 'S', stock: 3 }, { id: 'b', name: 'M', stock: 4, priceAdjustment: '10' }], packagings: [box] }]);
    expect(e.map((x) => x.id)).toEqual(['p1:a', 'p1:a#k1', 'p1:b', 'p1:b#k1']);
    expect(e[3].salePrice).toBe(1440);
    expect(e.map((x) => x.productId)).toEqual(['p1', 'p1', 'p1', 'p1']);
    expect(e[3]).toMatchObject({ variantId: 'b', factor: 24, packagingId: 'k1' });
  });
  it('ignora empaques inactivos', () => {
    const e = catalogEntries([{ id: 'p1', name: 'Agua', salePrice: '50', packagings: [{ ...box, status: 'inactive' }] }]);
    expect(e).toHaveLength(1);
  });
});
