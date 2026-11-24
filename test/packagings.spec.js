import { validatePackagings, savePackagings } from '../backend/src/services/packagings.js';

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
    ['factor que no cabe en Decimal(14,3)', [{ ...caja, factor: 1e11 }], new Set()],
    ['nombre vacío', [{ ...caja, name: '  ' }], new Set()]
  ])('rechaza %s', (_n, list, taken) => {
    expect(validatePackagings(list, { takenBarcodes: taken })).toEqual(expect.any(String));
  });

  it('un producto sin fracciones rechaza un factor no entero; con fracciones lo acepta', () => {
    const media = { ...caja, factor: 2.5 };
    expect(validatePackagings([media], { allowFractions: false })).toBe('Este producto no permite fracciones: la equivalencia del empaque debe ser un número entero.');
    expect(validatePackagings([media], { allowFractions: true })).toBeNull();
    expect(validatePackagings([caja], { allowFractions: false })).toBeNull();
  });

  it('permite varios empaques sin barcode', () => {
    const sin = { name: 'Saco', factor: 50, unitCode: 46 };
    expect(validatePackagings([sin, { ...sin, name: 'Saco 2' }])).toBeNull();
  });
});

// tx falso: registra las escrituras y devuelve filas fijas por modelo
function fakeTx({ products = [], variants = [], packs = [], own = [] } = {}) {
  const calls = { create: [], update: [], updateMany: [], where: null };
  return {
    calls,
    product: { findMany: async () => products },
    productVariant: { findMany: async () => variants },
    productPackaging: {
      findMany: async ({ where }) => {
        if (where.NOT) { calls.where = where; return packs; } // consulta de barcodes tomados
        return own; // empaques actuales del producto
      },
      create: async ({ data }) => { calls.create.push(data); return { id: 'new1' }; },
      update: async (a) => { calls.update.push(a); },
      updateMany: async (a) => { calls.updateMany.push(a); }
    }
  };
}
const run = (tx, packagings, extra = {}) => savePackagings(tx, { companyId: 'c1', productId: 'p1', packagings, ...extra });
const caja24 = { name: 'Caja', factor: 24, unitCode: 6, barcode: '111' };

describe('savePackagings', () => {
  it('rechaza un id de empaque ajeno con 400', async () => {
    await expect(run(fakeTx({ own: [{ id: 'mio' }] }), [{ ...caja24, id: 'ajeno' }])).rejects.toMatchObject({ status: 400 });
  });

  it('marca como inactive los que faltan, sin borrar', async () => {
    const tx = fakeTx({ own: [{ id: 'a' }, { id: 'b' }] });
    await run(tx, [{ ...caja24, id: 'a' }]);
    expect(tx.calls.update).toHaveLength(1);
    expect(tx.calls.updateMany[0]).toMatchObject({ where: { productId: 'p1', id: { notIn: ['a'] } }, data: { status: 'inactive' } });
    expect(tx.productPackaging.delete).toBeUndefined();
  });

  it('rechaza el barcode del propio producto y el de sus variantes', async () => {
    const tx = fakeTx({ products: [{ barcode: '111' }] });
    await expect(run(tx, [caja24])).rejects.toMatchObject({ status: 400 });
    await expect(run(fakeTx({ variants: [{ barcode: '111' }] }), [caja24])).rejects.toMatchObject({ status: 400 });
    await expect(run(fakeTx(), [caja24], { productBarcode: ' 111 ' })).rejects.toMatchObject({ status: 400 });
  });

  it('savePackagings pasa allowFractions: false y responde 400 con factor no entero', async () => {
    await expect(run(fakeTx(), [{ ...caja24, factor: 2.5 }], { allowFractions: false })).rejects.toMatchObject({ status: 400 });
  });

  it('no trata como tomados los barcodes de sus propios empaques', async () => {
    const tx = fakeTx({ own: [{ id: 'a' }] });
    await run(tx, [{ ...caja24, id: 'a' }]);
    expect(tx.calls.where.NOT).toEqual({ productId: 'p1' });
  });
});
