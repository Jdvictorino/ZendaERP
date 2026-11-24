// @vitest-environment node
// Cantidades decimales y empaques en facturas: existencias en unidad base y precio de empaque.
import { vi } from 'vitest';

vi.mock('../backend/src/db.js', () => ({ default: {} }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/routes/alerts.js', () => ({ createAlert: vi.fn() }));
vi.mock('../backend/src/services/ecfService.js', () => ({ ECF_RECEIVED: ['enviado', 'aceptado'] }));

const { takeStock, restoreStock, unreturnedLines, validateInvoiceLines } = await import('../backend/src/routes/invoices.js');
const { checkLinePrice } = await import('../backend/src/services/pricing.js');

function fakeTx(stock = 100) {
  const p = { name: 'Agua', stock };
  const logs = [];
  return {
    p, logs,
    product: {
      updateMany: async ({ where, data }) => {
        if (p.stock < where.stock.gte) return { count: 0 };
        p.stock -= data.stock.decrement; return { count: 1 };
      },
      findFirst: async () => p,
      update: async ({ data }) => { p.stock += data.stock.increment; },
    },
    inventoryLog: { create: async ({ data }) => { logs.push(data); } },
  };
}

describe('existencias en unidad base', () => {
  it('2 cajas de 24 descuentan 48', async () => {
    const tx = fakeTx();
    await takeStock(tx, 'c1', { productId: 'p1', quantity: 2, packagingFactor: 24 });
    expect(tx.p.stock).toBe(52);
  });
  it('una caja que no alcanza se rechaza con la cantidad en unidad base', async () => {
    const tx = fakeTx(30);
    await expect(takeStock(tx, 'c1', { productId: 'p1', quantity: 2, packagingFactor: 24 })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('pedido: 48') });
    expect(tx.p.stock).toBe(30);
  });
  it('app 1.1.x: cantidad 3 sin empaque descuenta 3', async () => {
    const tx = fakeTx();
    await takeStock(tx, 'c1', { productId: 'p1', quantity: 3 });
    expect(tx.p.stock).toBe(97);
  });
  it('restoreStock devuelve fracciones y multiplica por el empaque guardado', async () => {
    const tx = fakeTx(0);
    await restoreStock(tx, { id: 'i1', items: [{ productId: 'p1', quantity: 2.25, packagingFactor: 1 }] }, 'u1', 'x', 'credit_note');
    expect(tx.p.stock).toBe(2.25);
    await restoreStock(tx, { id: 'i1', items: [{ productId: 'p1', quantity: 2, packagingFactor: 24 }, { productId: 'p1', quantity: 1 }] }, 'u1', 'x', 'credit_note');
    expect(tx.p.stock).toBe(2.25 + 48 + 1);
    expect(tx.logs.map((l) => l.quantity)).toEqual([2.25, 48, 1]);
  });
});

describe('unreturnedLines con fracciones', () => {
  it('2.25 vendido y 0.5 devuelto deja 1.75', () => {
    expect(unreturnedLines([{ id: 'a', quantity: 2.25 }], [{ items: [{ itemId: 'a', quantity: 0.5 }] }])).toEqual([{ id: 'a', quantity: 1.75 }]);
  });
});

describe('checkLinePrice con empaque', () => {
  const product = { salePrice: 50, wholesalePrice: null, isTaxable: true, taxRate: 18 };
  const item = (unitPrice) => ({ unitPrice, discountPercent: 0, taxRate: 18 });
  it('acepta el salePrice del empaque', () => {
    const pk = { factor: 24, salePrice: 1000 };
    expect(checkLinePrice(item(1000), product, null, 5, pk).needsApproval).toBe(false);
    expect(checkLinePrice(item(1200), product, null, 5, pk).needsApproval).toBe(true);
  });
  it('sin salePrice acepta factor × precio base', () => {
    const pk = { factor: 24, salePrice: null };
    expect(checkLinePrice(item(1200), product, null, 5, pk).needsApproval).toBe(false);
    expect(checkLinePrice(item(50), product, null, 5, pk).needsApproval).toBe(true);
  });
  it('con variante: factor × precio efectivo de la variante', () => {
    const pk = { factor: 24, salePrice: null };
    expect(checkLinePrice(item(1440), product, { priceAdjustment: 10, salePrice: 0 }, 5, pk).needsApproval).toBe(false);
    expect(checkLinePrice(item(1210), product, { priceAdjustment: 10, salePrice: 0 }, 5, pk).needsApproval).toBe(true);
    expect(checkLinePrice(item(1800), product, { priceAdjustment: 0, salePrice: 75 }, 5, pk).needsApproval).toBe(false);
  });
});

describe('validateInvoiceLines', () => {
  const pk = { id: 'k1', name: 'Caja', factor: 24, salePrice: null };
  const prod = (o) => ({ id: 'p1', salePrice: 50, wholesalePrice: null, isTaxable: true, taxRate: 18, allowFractions: false, variants: [], packagings: [pk], ...o });
  const run = (item, product = prod()) => validateInvoiceLines([{ unitPrice: 50, discountPercent: 0, taxRate: 18, quantity: 1, ...item }], new Map([[product.id, product]]), 5);
  it('empaque de otro producto o sin producto: 400', () => {
    expect(run({ productId: 'p1', packagingId: 'otro' }).error).toBe('El empaque no pertenece al producto.');
    expect(run({ packagingId: 'k1' }).error).toBe('El empaque no pertenece al producto.');
  });
  it('1.5 en producto entero o en línea libre se rechaza', () => {
    expect(run({ productId: 'p1', quantity: 1.5 }).error).toEqual(expect.any(String));
    expect(run({ quantity: 1.5 }).error).toEqual(expect.any(String));
    expect(run({ productId: 'p1', quantity: 1.5 }, prod({ allowFractions: true })).error).toBeUndefined();
  });
  it('app 1.1.x: cantidad 3 sin empaque pasa con factor 1', () => {
    const items = [{ productId: 'p1', quantity: 3, unitPrice: 50, discountPercent: 0, taxRate: 18 }];
    expect(validateInvoiceLines(items, new Map([['p1', prod()]]), 5)).toEqual({ needsApproval: false });
    expect(items[0]).toMatchObject({ packagingId: null, packagingFactor: 1 });
  });
  it('con empaque guarda copia del nombre y factor', () => {
    const items = [{ productId: 'p1', packagingId: 'k1', quantity: 2, unitPrice: 1200, discountPercent: 0, taxRate: 18 }];
    expect(validateInvoiceLines(items, new Map([['p1', prod()]]), 5)).toEqual({ needsApproval: false });
    expect(items[0]).toMatchObject({ packagingName: 'Caja', packagingFactor: 24 });
  });
});
