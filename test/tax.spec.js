import { readFileSync } from 'fs';
import * as server from '../backend/src/services/tax.js';
import * as app from '../src/utils/tax.js';

describe.each([['servidor', server], ['app', app]])('tax (%s)', (_n, t) => {
  const ex = (o = {}) => ({ taxpayerType: 'zona_franca', exemptionNumber: 'ZF-1', exemptionExpiresAt: '2026-11-16', ...o });

  it('lineAmounts', () => {
    expect(t.lineAmounts({ quantity: 2, unitPrice: 100, discountPercent: 0, taxRate: 18 })).toEqual({ base: 200, itbis: 36 });
    expect(t.lineAmounts({ quantity: 2, unitPrice: 100, discountPercent: 10, taxRate: 18 })).toEqual({ base: 180, itbis: 32.4 });
    expect(t.lineAmounts({ quantity: 3, unitPrice: 33.33, taxRate: 18 })).toEqual({ base: 99.99, itbis: 18 });
    expect(t.lineAmounts({ quantity: 1, unitPrice: 50, taxRate: 0 }).itbis).toBe(0);
  });

  it('invoiceTotals', () => {
    const l = (unitPrice, taxRate) => ({ quantity: 1, unitPrice, discountPercent: 0, taxRate });
    expect(t.invoiceTotals([l(100, 18), l(50, 16), l(25, 0)])).toEqual({ subtotal: 175, taxAmount: 26, total: 201 });
  });

  it('isTaxExempt', () => {
    expect(t.isTaxExempt(ex(), '2026-11-16')).toBe(true);
    expect(t.isTaxExempt(ex({ exemptionExpiresAt: '2026-11-15' }), '2026-11-16')).toBe(false);
    expect(t.isTaxExempt(ex({ exemptionNumber: '' }), '2026-11-16')).toBe(false);
    expect(t.isTaxExempt(ex({ taxpayerType: 'empresa' }), '2026-11-16')).toBe(false);
    expect(t.isTaxExempt(null, '2026-11-16')).toBe(false);
    expect(t.isTaxExempt(ex({ exemptionExpiresAt: new Date('2026-12-31T00:00:00Z') }), '2026-11-16')).toBe(true);
  });

  it('exemptionStatus', () => {
    expect(t.exemptionStatus(ex({ taxpayerType: 'empresa' }), '2026-11-16')).toBe('none');
    expect(t.exemptionStatus(ex({ taxpayerType: 'ong', exemptionExpiresAt: null }), '2026-11-16')).toBe('missing');
    expect(t.exemptionStatus(ex({ exemptionExpiresAt: '2026-11-15' }), '2026-11-16')).toBe('expired');
    expect(t.exemptionStatus(ex(), '2026-11-16')).toBe('valid');
  });

  it('suggestedVoucher', () => {
    expect(t.suggestedVoucher(ex(), { ecf: true, exempt: true })).toBe('E44');
    expect(t.suggestedVoucher(ex(), { ecf: false, exempt: true })).toBe('B14');
    expect(t.suggestedVoucher({ taxpayerType: 'gubernamental' }, { ecf: false, exempt: false })).toBe('B15');
    expect(t.suggestedVoucher(null, { ecf: true, exempt: false })).toBe('E32');
    expect(t.suggestedVoucher({ taxpayerType: 'empresa' }, { ecf: true, exempt: false })).toBe('E31');
    expect(t.suggestedVoucher(ex(), { ecf: false, exempt: false })).toBe('B01');
  });

  it('voucherError', () => {
    expect(t.voucherError('B02', { exemptApplied: true })).toBe('Venta exenta de ITBIS: use el comprobante de Régimen Especial (E44/B14).');
    expect(t.voucherError('E44', { exemptApplied: false, taxpayerType: 'empresa' })).toBe('El comprobante de Régimen Especial (E44/B14) solo aplica a clientes exentos con carnet vigente.');
    expect(t.voucherError('B15', { exemptApplied: false, taxpayerType: 'empresa' })).toBe('El comprobante Gubernamental (E45/B15) solo aplica a clientes gubernamentales.');
    expect(t.voucherError('E31', { exemptApplied: false, taxpayerType: 'empresa' })).toBeNull();
  });

  it('netUnitPrice', () => {
    expect(t.netUnitPrice({ unitPrice: 118, taxRate: 18 }, true)).toBe(100);
    expect(t.netUnitPrice({ unitPrice: 118, taxRate: 18 }, false)).toBe(118);
  });

  it('todayRD usa la fecha de Santo Domingo', () => {
    expect(t.todayRD(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
  });

  it('TAXPAYER_TYPES: 8 tipos, 4 exentables', () => {
    expect(t.TAXPAYER_TYPES).toHaveLength(8);
    expect(t.TAXPAYER_TYPES.filter((x) => x.exemptible).map((x) => x.value)).toEqual(['zona_franca', 'regimen_especial', 'diplomatico', 'ong']);
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (p) => readFileSync(p, 'utf8').split('\n').slice(1).join('\n');
  expect(body('src/utils/tax.js')).toBe(body('backend/src/services/tax.js'));
});
