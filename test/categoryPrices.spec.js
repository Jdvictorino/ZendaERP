import { validateCategoryPrices } from '../backend/src/services/categoryPrices.js';
import { QUANTITY_FIELDS } from '../backend/src/services/quantityFields.js';

const ctx = { categories: ['Mayorista', 'Colmado'], packagingIds: new Set(['p1']), allowFractions: false };
const row = { category: 'Mayorista', packagingId: null, minQuantity: 1, price: 100 };
const err = (rows, c = ctx) => validateCategoryPrices(rows, c);

describe('validateCategoryPrices', () => {
  it('acepta filas válidas, con empaque y escalones', () => {
    expect(err([row, { ...row, minQuantity: 10, price: 90 }, { ...row, packagingId: 'p1' }, { ...row, category: 'colmado' }])).toBeNull();
    expect(err([])).toBeNull();
  });
  it('rechaza categoría inexistente', () => {
    expect(err([{ ...row, category: 'VIP' }])).toMatch(/categoría/i);
  });
  it('rechaza precio vacío, nulo o negativo', () => {
    for (const price of [null, '', undefined, -1, 'abc']) expect(err([{ ...row, price }])).toMatch(/precio/i);
    expect(err([{ ...row, price: 0 }])).toBeNull();
  });
  it('aplica la regla de cantidad', () => {
    expect(err([{ ...row, minQuantity: 0 }])).toMatch(/mayor que cero/);
    expect(err([{ ...row, minQuantity: 1.5 }])).toMatch(/enteras/);
    expect(err([{ ...row, minQuantity: 1.5 }], { ...ctx, allowFractions: true })).toBeNull();
    expect(err([{ ...row, minQuantity: 1.5, packagingId: 'p1' }], { ...ctx, allowFractions: true })).toMatch(/enteras/);
  });
  it('rechaza un empaque que no es del producto o está inactivo', () => {
    expect(err([{ ...row, packagingId: 'x' }])).toMatch(/empaque/i);
  });
  it('rechaza duplicados (categoría sin mayúsculas, empaque, cantidad)', () => {
    expect(err([row, { ...row, category: ' mayorista ' }])).toMatch(/repetid/i);
    expect(err([{ ...row, packagingId: 'p1' }, { ...row, packagingId: 'p1' }])).toMatch(/repetid/i);
  });
});

describe('QUANTITY_FIELDS', () => {
  it('incluye categoryPrice.minQuantity', () => {
    expect(QUANTITY_FIELDS.categoryPrice).toEqual(['minQuantity']);
  });
});
