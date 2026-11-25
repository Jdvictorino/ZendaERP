import { validateCategoryPrices, DEFAULT_CUSTOMER_CATEGORIES, planCategoryChanges, wholesaleRows } from '../backend/src/services/categoryPrices.js';
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

describe('categorías por defecto', () => {
  it('General, VIP y Mayorista son válidas sin configuración de la empresa', () => {
    expect(validateCategoryPrices([{ ...row, category: 'VIP' }], { ...ctx, categories: DEFAULT_CUSTOMER_CATEGORIES })).toBeNull();
  });
});

describe('planCategoryChanges', () => {
  const plan = (o, n, e, extra = {}) => planCategoryChanges(o, n, e ? { apply: true, pricesAware: true, entries: e, base: o, ...extra } : undefined);
  const none = { renames: [], merges: [], removed: [] };
  it('renombre: el destino queda y el origen sale', () => {
    expect(plan(['A', 'B'], ['A', 'C'], [{ from: 'B', to: 'C' }])).toEqual({ renames: [{ from: 'B', to: 'C' }], merges: [], removed: [] });
  });
  it('borrado sin renombre', () => {
    expect(plan(['A', 'B'], ['A'], [])).toEqual({ renames: [], merges: [], removed: ['B'] });
  });
  it('solo borra precios de categorías que la app conocía (base)', () => {
    expect(plan(['A', 'B', 'C'], ['A'], [], { base: ['A', 'B'] }).removed).toEqual(['B']);
    expect(plan(['A', 'B'], ['A'], [], { base: undefined })).toEqual(none);
    expect(plan(['A', 'B'], ['A'], [], { base: [' b '] }).removed).toEqual(['B']);
  });
  it('sin pricesAware no se borran precios', () => {
    expect(plan(['A', 'B'], ['A'], [], { pricesAware: false })).toEqual(none);
    expect(planCategoryChanges(['A', 'B'], ['A'])).toEqual(none);
    expect(plan(['A', 'B'], ['B'], [{ from: 'A', to: 'B' }], { pricesAware: false })).toEqual({ renames: [], merges: [{ from: 'A', to: 'B' }], removed: [] });
  });
  it('cadena de una entrada por tecla: renombra y no borra', () => {
    const chain = [{ from: 'VIP', to: 'VIP ' }, { from: 'VIP ', to: 'VIP O' }, { from: 'VIP O', to: 'VIP Or' }, { from: 'VIP Or', to: 'VIP Oro' }];
    expect(plan(['General', 'VIP', 'Mayorista'], ['General', 'VIP Oro', 'Mayorista'], chain))
      .toEqual({ renames: [{ from: 'VIP', to: 'VIP Oro' }], merges: [], removed: [] });
  });
  it('destino que ya existía: es fusión, los precios de la origen se borran', () => {
    expect(plan(['A', 'B'], ['B'], [{ from: 'A', to: 'B' }])).toEqual({ renames: [], merges: [{ from: 'A', to: 'B' }], removed: ['A'] });
  });
  it('dos renombres independientes', () => {
    expect(plan(['A', 'B'], ['C', 'D'], [{ from: 'A', to: 'C' }, { from: 'B', to: 'D' }]))
      .toEqual({ renames: [{ from: 'A', to: 'C' }, { from: 'B', to: 'D' }], merges: [], removed: [] });
  });
  it('borrar VIP hacia Mayorista y luego renombrar Mayorista: solo Mayorista se renombra', () => {
    const r = plan(['General', 'VIP', 'Mayorista'], ['General', 'Mayoristas'], [{ from: 'VIP', to: 'Mayorista' }, { from: 'Mayorista', to: 'Mayoristas' }]);
    expect(r).toEqual({ renames: [{ from: 'Mayorista', to: 'Mayoristas' }], merges: [{ from: 'VIP', to: 'Mayoristas' }], removed: ['VIP'] });
  });
  it('renombrar Mayorista y luego borrar VIP hacia el nombre nuevo: una sola renombra', () => {
    const r = plan(['General', 'Mayorista', 'VIP'], ['General', 'Mayoristas'], [{ from: 'Mayorista', to: 'Mayoristas' }, { from: 'VIP', to: 'Mayoristas' }]);
    expect(r).toEqual({ renames: [{ from: 'Mayorista', to: 'Mayoristas' }], merges: [{ from: 'VIP', to: 'Mayoristas' }], removed: ['VIP'] });
  });
  it('A y B hacia C: una renombra y la otra se fusiona', () => {
    expect(plan(['A', 'B'], ['C'], [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }]))
      .toEqual({ renames: [{ from: 'A', to: 'C' }], merges: [{ from: 'B', to: 'C' }], removed: ['B'] });
  });
  it('"Mayorista 2" escrito en el hueco de VIP sigue siendo renombre', () => {
    expect(plan(['VIP', 'Mayorista'], ['Mayorista', 'Mayorista 2'], [{ from: 'VIP', to: 'Mayorista 2' }]))
      .toEqual({ renames: [{ from: 'VIP', to: 'Mayorista 2' }], merges: [], removed: [] })
    expect(plan(['VIP', 'Mayorista'], ['Mayorista', 'Mayorista 2'], [{ from: 'VIP', to: 'Mayorista' }, { from: 'Mayorista', to: 'Mayorista 2' }]))
      .toEqual({ renames: [{ from: 'VIP', to: 'Mayorista 2' }], merges: [], removed: [] });
  });
  it('intercambio real A <-> B: nada se mueve ni se borra', () => {
    expect(plan(['A', 'B'], ['B', 'A'], [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }])).toEqual(none);
  });
  it('lista nueva vacía o ausente: nada', () => {
    expect(plan(['A'], [], [{ from: 'A', to: 'B' }])).toEqual(none);
    expect(plan(['A'], undefined)).toEqual(none);
  });
});

describe('wholesaleRows', () => {
  const products = [{ id: 'p1', wholesalePrice: 50 }, { id: 'p2', wholesalePrice: 0 }, { id: 'p3', wholesalePrice: null }, { id: 'p4', wholesalePrice: '30.5' }];
  it('una fila base por producto con precio al por mayor', () => {
    expect(wholesaleRows(products, [], 'Mayorista')).toEqual([
      { productId: 'p1', category: 'Mayorista', packagingId: null, minQuantity: 1, price: 50 },
      { productId: 'p4', category: 'Mayorista', packagingId: null, minQuantity: 1, price: 30.5 }
    ]);
  });
  it('idempotente: segunda pasada da 0 filas', () => {
    const first = wholesaleRows(products, [], 'Mayorista');
    expect(wholesaleRows(products, first, 'mayorista')).toEqual([]);
  });
});
