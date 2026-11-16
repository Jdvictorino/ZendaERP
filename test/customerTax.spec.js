import { customerTaxFields } from '../backend/src/services/customerTax.js';

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
