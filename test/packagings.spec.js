import { validatePackagings } from '../backend/src/services/packagings.js';

const caja = { name: 'Caja de 24', factor: 24, unitCode: 6, barcode: '7460000000017' };

describe('validatePackagings', () => {
  it('acepta un empaque válido', () => {
    expect(validatePackagings([caja], { takenBarcodes: new Set() })).toBeNull();
  });

  it.each([
    ['factor 0', [{ ...caja, factor: 0 }], new Set()],
    ['factor con 4 decimales', [{ ...caja, factor: 1.2345 }], new Set()],
    ['barcode repetido en la lista', [caja, { ...caja, name: 'Otra' }], new Set()],
    ['barcode de otro producto', [caja], new Set(['7460000000017'])],
    ['unitCode inexistente', [{ ...caja, unitCode: 999 }], new Set()],
    ['nombre vacío', [{ ...caja, name: '  ' }], new Set()]
  ])('rechaza %s', (_n, list, taken) => {
    expect(validatePackagings(list, { takenBarcodes: taken })).toEqual(expect.any(String));
  });

  it('permite varios empaques sin barcode', () => {
    const sin = { name: 'Saco', factor: 50, unitCode: 46 };
    expect(validatePackagings([sin, { ...sin, name: 'Saco 2' }])).toBeNull();
  });
});
