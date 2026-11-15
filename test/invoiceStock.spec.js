// @vitest-environment node
// Existencia al vender y al devolver: nunca negativa, y por variante cuando la línea es de una variante.
import { vi } from 'vitest';

vi.mock('../backend/src/db.js', () => ({ default: {} }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/routes/alerts.js', () => ({ createAlert: vi.fn() }));
vi.mock('../backend/src/services/ecfService.js', () => ({}));

const { takeStock, restoreStock } = await import('../backend/src/routes/invoices.js');

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
