import { describe, it, expect } from 'vitest';
import { appendPayments } from '../backend/src/services/payments.js';

describe('appendPayments', () => {
  it('no agrega dos veces el mismo cobro', () => {
    const una = appendPayments([], [{ id: 'a', efectivo: 10 }]);
    expect(appendPayments(una, [{ id: 'a', efectivo: 10 }])).toHaveLength(1);
  });
  it('agrega un cobro con otro id', () => {
    expect(appendPayments([{ id: 'a' }], [{ id: 'b' }])).toHaveLength(2);
  });
  it('agrega siempre un cobro sin id (app vieja)', () => {
    expect(appendPayments([{ efectivo: 1 }], [{ efectivo: 1 }])).toHaveLength(2);
  });
  it('ignora un id repetido dentro del mismo envío', () => {
    expect(appendPayments([], [{ id: 'a' }, { id: 'a' }])).toHaveLength(1);
  });
});
