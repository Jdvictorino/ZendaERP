// @vitest-environment node
// Existencia al vender y al devolver: nunca negativa, y por variante cuando la línea es de una variante.
import { vi } from 'vitest';

vi.mock('../backend/src/db.js', () => ({ default: {} }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/routes/alerts.js', () => ({ createAlert: vi.fn() }));
vi.mock('../backend/src/services/ecfService.js', () => ({}));

const { takeStock, restoreStock, takeNcf } = await import('../backend/src/routes/invoices.js');

// Base de datos en memoria con la misma condición que el UPDATE real: solo descuenta si stock >= cantidad
function fakeTx() {
  const products = { p1: { name: 'Taza', stock: 2 } };
  const variants = { v1: { name: 'Roja', stock: 1, productId: 'p1' } };
  const take = (row, data) => { row.stock -= data.stock.decrement; };
  return {
    products, variants, logs: [],
    product: {
      updateMany: async ({ where, data }) => {
        const p = products[where.id];
        if (!p || p.stock < where.stock.gte) return { count: 0 };
        take(p, data); return { count: 1 };
      },
      findFirst: async ({ where }) => products[where.id] || null,
      update: async ({ where, data }) => { products[where.id].stock += data.stock.increment; },
    },
    productVariant: {
      updateMany: async ({ where, data }) => {
        const v = variants[where.id];
        if (!v || v.productId !== where.productId || v.stock < where.stock.gte) return { count: 0 };
        take(v, data); return { count: 1 };
      },
      findFirst: async ({ where }) => (variants[where.id] ? { ...variants[where.id], product: products.p1 } : null),
      update: async ({ where, data }) => { variants[where.id].stock += data.stock.increment; },
    },
    inventoryLog: { create: async function ({ data }) { this.parent.logs.push(data); } },
  };
}

describe('takeStock', () => {
  it('descuenta mientras alcance y luego rechaza sin dejar negativo', async () => {
    const tx = fakeTx();
    await takeStock(tx, 'c1', { productId: 'p1', quantity: 2 });
    expect(tx.products.p1.stock).toBe(0);
    await expect(takeStock(tx, 'c1', { productId: 'p1', quantity: 1 })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Stock insuficiente para "Taza"') });
    expect(tx.products.p1.stock).toBe(0);
  });

  it('una línea de variante descuenta la variante, no el producto', async () => {
    const tx = fakeTx();
    await takeStock(tx, 'c1', { productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(tx.variants.v1.stock).toBe(0);
    expect(tx.products.p1.stock).toBe(2);
    await expect(takeStock(tx, 'c1', { productId: 'p1', variantId: 'v1', quantity: 1 })).rejects.toThrow('"Taza (Roja)"');
  });

  it('un producto que no es de la empresa no se vende', async () => {
    await expect(takeStock(fakeTx(), 'c1', { productId: 'otro', quantity: 1 })).rejects.toMatchObject({ status: 409, message: 'Uno de los productos del pedido no existe.' });
  });
});

describe('restoreStock', () => {
  it('devuelve producto y variante y deja el registro en el historial', async () => {
    const tx = fakeTx();
    tx.inventoryLog.parent = tx;
    const invoice = { id: 'i1', items: [{ productId: 'p1', quantity: 3 }, { productId: 'p1', variantId: 'v1', quantity: 2 }, { productId: null, quantity: 9 }] };
    await restoreStock(tx, invoice, 'u1', 'Anulación', 'invoice_cancel');
    expect(tx.products.p1.stock).toBe(5);
    expect(tx.variants.v1.stock).toBe(3);
    expect(tx.logs).toHaveLength(2);
  });
});

// Empresa en memoria: B01/B02 cuentan en columnas, B03/B04 en settings.ncfSequences
function ncfTx(sequences, columns = {}) {
  const state = { settings: { ncfSequences: sequences }, ncfB01Prefix: null, ncfB01SequenceNext: 1, ncfB02Prefix: null, ncfB02SequenceNext: 1, ...columns };
  return {
    state,
    $queryRaw: async () => [],
    $executeRaw: async (strings, path, value) => { state.settings.ncfSequences[Number(path[1])].next = value; },
    company: { findUnique: async () => state, update: async ({ data }) => Object.assign(state, data) },
  };
}

describe('takeNcf', () => {
  it('B02 usa el contador de la empresa y se detiene al llegar al fin del rango', async () => {
    const tx = ncfTx([{ code: 'B02', prefix: 'B02', start: 1, end: 2, next: 1, active: true }], { ncfB02Prefix: 'B02', ncfB02SequenceNext: 2 });
    await expect(takeNcf(tx, 'c1', 'B02')).resolves.toBe('B0200000002');
    expect(tx.state.ncfB02SequenceNext).toBe(3);
    await expect(takeNcf(tx, 'c1', 'B02')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Se agotó') });
  });

  it('B04 cuenta en la configuración', async () => {
    const tx = ncfTx([{ code: 'B04', prefix: 'B04', start: 1, end: 50, next: 7, active: true }]);
    await expect(takeNcf(tx, 'c1', 'B04')).resolves.toBe('B0400000007');
    expect(tx.state.settings.ncfSequences[0].next).toBe(8);
  });

  it('una secuencia inactiva o sin configurar no emite', async () => {
    await expect(takeNcf(ncfTx([{ code: 'B01', prefix: 'B01', start: 1, end: 9, next: 1, active: false }], { ncfB01Prefix: 'B01' }), 'c1', 'B01'))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('inactiva') });
    await expect(takeNcf(ncfTx([]), 'c1', 'B04')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Falta configurar') });
  });

  it('sin rango guardado, B01 sigue como antes (sin límite)', async () => {
    const tx = ncfTx([], { ncfB01Prefix: 'B01', ncfB01SequenceNext: 500 });
    await expect(takeNcf(tx, 'c1', 'B01')).resolves.toBe('B0100000500');
  });
});
