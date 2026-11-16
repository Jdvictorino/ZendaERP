import { describe, it, expect, vi } from 'vitest';
import { assertSameCompany } from '../backend/src/services/ownership.js';

const fakeTx = (owned) => {
  const t = {};
  for (const m of ['customer', 'supplier', 'user', 'productCategory']) {
    t[m] = { count: vi.fn(async ({ where }) => (owned[m]?.includes(where.id) && where.companyId === 'c1' ? 1 : 0)) };
  }
  return t;
};

describe('assertSameCompany', () => {
  it('resuelve cuando todo es de la empresa', async () => {
    const tx = fakeTx({ customer: ['a'], productCategory: ['b'], supplier: ['s'], user: ['u'] });
    await expect(assertSameCompany(tx, 'c1', { customerId: 'a', categoryId: 'b', supplierId: 's', driverId: 'u' })).resolves.toBeUndefined();
  });
  it('rechaza con 400 un ID de otra empresa', async () => {
    const tx = fakeTx({ customer: ['a'] });
    await expect(assertSameCompany(tx, 'c2', { customerId: 'a' })).rejects.toMatchObject({ status: 400, message: 'Registro no encontrado' });
    await expect(assertSameCompany(fakeTx({}), 'c1', { driverId: 'x' })).rejects.toMatchObject({ status: 400 });
  });
  it('no consulta IDs vacíos', async () => {
    const tx = fakeTx({});
    await assertSameCompany(tx, 'c1', { customerId: undefined, categoryId: null });
    expect(tx.customer.count).not.toHaveBeenCalled();
    expect(tx.productCategory.count).not.toHaveBeenCalled();
  });
});
