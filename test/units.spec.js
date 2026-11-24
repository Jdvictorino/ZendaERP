import { readFileSync } from 'fs';
import * as server from '../backend/src/services/units.js';
import * as app from '../src/utils/units.js';

describe.each([['servidor', server], ['app', app]])('units (%s)', (_n, u) => {
  it('quantityError', () => {
    const q = (quantity, allowFractions, hasPackaging) => u.quantityError({ quantity, allowFractions, hasPackaging });
    expect(q(1.5, false, false)).toEqual(expect.any(String));
    expect(q(1.5, true, false)).toBeNull();
    expect(q(1.5, true, true)).toEqual(expect.any(String));
    expect(q(1.555, true, false)).toEqual(expect.any(String));
    expect(q(0, true, false)).toEqual(expect.any(String));
    expect(q(-1, true, false)).toEqual(expect.any(String));
    expect(q(3, false, true)).toBeNull();
  });

  it('baseQuantity y roundQty', () => {
    expect(u.baseQuantity({ quantity: 3, factor: 0.125 })).toBe(0.375);
    expect(u.baseQuantity({ quantity: 2 })).toBe(2);
    expect(u.roundQty(0.1 + 0.2)).toBe(0.3);
  });

  it('formatQty', () => {
    expect(u.formatQty(1.5, 'lb')).toBe('1.5 lb');
    expect(u.formatQty(2, 'und')).toBe('2 und');
    expect(u.formatQty(2, '')).toBe('2');
  });

  it('unitOf y tablas', () => {
    expect(u.unitOf('libra').dgii).toBe(23);
    expect(u.unitOf('desconocida').code).toBe('unidad');
    expect(u.BASE_UNITS).toHaveLength(13);
    expect(u.PACKAGE_TYPES).toHaveLength(14);
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (p) => readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
  expect(body('src/utils/units.js')).toBe(body('backend/src/services/units.js'));
});
