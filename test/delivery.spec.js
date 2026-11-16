import { describe, it, expect } from 'vitest';
import { canConfirmDelivery } from '../backend/src/services/delivery.js';

const shipment = { deliveryToken: 'tok-1', companyId: 'c1' };

describe('canConfirmDelivery', () => {
  it('acepta la llave correcta sin usuario', () => {
    expect(canConfirmDelivery({ shipment, token: 'tok-1' })).toBe(true);
  });
  it('rechaza una llave incorrecta sin usuario', () => {
    expect(canConfirmDelivery({ shipment, token: 'otra' })).toBe(false);
  });
  it('rechaza sin llave y sin usuario', () => {
    expect(canConfirmDelivery({ shipment })).toBe(false);
  });
  it('acepta a un usuario de la misma empresa sin llave', () => {
    expect(canConfirmDelivery({ shipment, user: { companyId: 'c1' } })).toBe(true);
  });
  it('rechaza a un usuario de otra empresa', () => {
    expect(canConfirmDelivery({ shipment, user: { companyId: 'c2' } })).toBe(false);
  });
});
