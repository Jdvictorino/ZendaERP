import { buildVoucherOptions, missingVoucherWarning } from '../src/utils/voucherOptions.js';
import { suggestedVoucher } from '../src/utils/tax.js';

const profile = { ncf: { b02_prefix: 'B02', b02_sequence_next: 1 }, ncfSequences: [{ code: 'B14', prefix: 'B14', next: 5, end: 100, active: true }] };
const ctx = (customer, exempt, ecf = false) => ({ ecf, exempt, code: suggestedVoucher(customer, { ecf, exempt }) });

describe('comprobantes disponibles y sugerencia', () => {
  it('exento con talonario B14 activo: ofrece y sugiere B14, sin aviso', () => {
    const opts = buildVoucherOptions(profile);
    expect(opts.map(o => o.value)).toEqual(['NoFiscal', 'B02', 'B14']);
    const c = { taxpayerType: 'zona_franca' };
    const { ecf, exempt, code } = ctx(c, true);
    expect(code).toBe('B14');
    expect(missingVoucherWarning(c, { ecf, exempt }, opts, code)).toBeNull();
  });
  it('exento sin B14: avisa y no cambia a NoFiscal', () => {
    const opts = buildVoucherOptions({ ncf: profile.ncf });
    const c = { taxpayerType: 'zona_franca' };
    expect(missingVoucherWarning(c, { ecf: false, exempt: true }, opts, 'B14')).toBe('Este cliente requiere comprobante Régimen Especial (E44/B14). Configure su secuencia en Gestión Fiscal.');
  });
  it('gubernamental sin E45 avisa; e-CF con secuencia activa ofrece E45', () => {
    const c = { taxpayerType: 'gubernamental' };
    expect(missingVoucherWarning(c, { ecf: true, exempt: false }, buildVoucherOptions(profile, { enabled: true, sequences: [] }), 'E45')).toMatch(/Gubernamental \(E45\/B15\)/);
    const opts = buildVoucherOptions(profile, { enabled: true, sequences: [{ tipoEcf: 'E45', estado: 'activa', secuencial: 3 }] });
    expect(opts.some(o => o.value === 'E45')).toBe(true);
    expect(missingVoucherWarning(c, { ecf: true, exempt: false }, opts, 'E45')).toBeNull();
  });
  it('cliente común no genera aviso', () => {
    expect(missingVoucherWarning({ taxpayerType: 'empresa' }, { ecf: false, exempt: false }, [], 'B01')).toBeNull();
  });
});
