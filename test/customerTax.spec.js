import { customerTaxFields, exemptionChangeError } from '../backend/src/services/customerTax.js';

describe('customerTaxFields', () => {
  it('zona franca conserva carnet y fecha', () => {
    expect(customerTaxFields({ taxpayerType: 'zona_franca', exemptionNumber: ' ZF-9 ', exemptionExpiresAt: '2027-01-31' }))
      .toEqual({ taxpayerType: 'zona_franca', exemptionNumber: 'ZF-9', exemptionExpiresAt: new Date('2027-01-31T00:00:00Z') });
  });
  it('tipo no exemptible borra carnet y fecha', () => {
    expect(customerTaxFields({ taxpayerType: 'empresa', exemptionNumber: 'X', exemptionExpiresAt: '2027-01-31' }))
      .toEqual({ taxpayerType: 'empresa', exemptionNumber: null, exemptionExpiresAt: null });
  });
  it('mapea el type viejo', () => {
    expect(customerTaxFields({ type: 'Zona Franca' }).taxpayerType).toBe('zona_franca');
    expect(customerTaxFields({ type: 'Persona' }).taxpayerType).toBe('consumidor_final');
  });
  it('tipo inválido lanza 400', () => {
    expect(() => customerTaxFields({ taxpayerType: 'exportacion' })).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('fecha inválida lanza 400', () => {
    expect(() => customerTaxFields({ taxpayerType: 'ong', exemptionExpiresAt: 'no-fecha' })).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('vacío es consumidor final', () => {
    expect(customerTaxFields({})).toEqual({ taxpayerType: 'consumidor_final', exemptionNumber: null, exemptionExpiresAt: null });
  });
});

describe('customerTaxFields sobre un cliente existente (PUT)', () => {
  const zf = { taxpayerType: 'zona_franca', exemptionNumber: 'ZF-1', exemptionExpiresAt: new Date('2027-05-01T00:00:00Z') };
  it('solo exemptionNumber conserva tipo y vencimiento', () => {
    expect(customerTaxFields({ exemptionNumber: 'X' }, zf)).toEqual({ ...zf, exemptionNumber: 'X' });
  });
  it('solo taxpayerType igual conserva el carnet', () => {
    expect(customerTaxFields({ taxpayerType: 'zona_franca' }, zf)).toEqual(zf);
  });
  it('cambiar a tipo no exemptible borra el carnet', () => {
    expect(customerTaxFields({ taxpayerType: 'empresa' }, zf)).toEqual({ taxpayerType: 'empresa', exemptionNumber: null, exemptionExpiresAt: null });
  });
});

describe('type viejo en PUT', () => {
  const zf = { taxpayerType: 'zona_franca', exemptionNumber: 'ZF-1', exemptionExpiresAt: new Date('2027-05-01T00:00:00Z') };
  it('PUT con type Persona conserva tipo y carnet (solo POST mapea type)', () => {
    expect(customerTaxFields({ type: 'Persona', phone: 'x' }, zf)).toEqual(zf);
  });
});

describe('exemptionChangeError: solo gerencia registra el carnet', () => {
  const msg = 'Solo un gerente o administrador puede registrar el carnet de exención.';
  const zf = { taxpayerType: 'zona_franca', exemptionNumber: 'ZF-1', exemptionExpiresAt: new Date('2027-05-01T00:00:00Z') };
  const cajero = { role: 'cashier' };
  it('cajero no puede poner carnet al crear', () => {
    expect(exemptionChangeError({ taxpayerType: 'zona_franca', exemptionNumber: 'ZF-9', exemptionExpiresAt: new Date('2027-01-31T00:00:00Z') }, null, cajero)).toBe(msg);
  });
  it('cajero no puede cambiar número ni vencimiento', () => {
    expect(exemptionChangeError({ ...zf, exemptionNumber: 'ZF-2' }, zf, cajero)).toBe(msg);
    expect(exemptionChangeError({ ...zf, exemptionExpiresAt: new Date('2028-05-01T00:00:00Z') }, zf, cajero)).toBe(msg);
  });
  it('cajero puede guardar el mismo carnet o un cliente sin carnet', () => {
    expect(exemptionChangeError({ ...zf }, zf, cajero)).toBeNull();
    expect(exemptionChangeError({ taxpayerType: 'empresa', exemptionNumber: null, exemptionExpiresAt: null }, null, cajero)).toBeNull();
  });
  it('gerente y administrador sí pueden', () => {
    expect(exemptionChangeError({ ...zf, exemptionNumber: 'ZF-2' }, zf, { role: 'manager' })).toBeNull();
    expect(exemptionChangeError({ ...zf, exemptionNumber: 'ZF-2' }, null, { role: 'admin' })).toBeNull();
    expect(exemptionChangeError({ ...zf, exemptionNumber: 'ZF-2' }, null, { role: 'cashier', isAdmin: true })).toBeNull();
  });
});
