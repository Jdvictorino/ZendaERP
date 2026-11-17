import { ECF_TYPE_MAP } from './ecfConstants.js';

// Comprobantes que el negocio puede emitir hoy: NCF tradicional con talonario vigente + e-CF con secuencia activa.
// ecfInfo = { enabled, sequences }; ncfNextLocal = contadores que avanzaron en esta sesión.
export function buildVoucherOptions(companyProfile, ecfInfo = { enabled: false, sequences: [] }, ncfNextLocal = {}) {
  const p = companyProfile || {};
  // GET /settings entrega las secuencias como ncf.b02_prefix / ncf.b02_sequence_next
  const ncf = p.ncf || {};
  const opts = [{ value: 'NoFiscal', label: 'Sin valor fiscal', requiresBuyer: false, preview: '' }];
  const traditional = [
    { value: 'B02', label: 'Consumo (B02)', prefix: ncf.b02_prefix ?? p.ncfB02Prefix, next: ncf.b02_sequence_next ?? p.ncfB02SequenceNext, end: ncf.b02_sequence_end ?? p.ncfB02SequenceEnd, requiresBuyer: false },
    { value: 'B01', label: 'Crédito fiscal (B01)', prefix: ncf.b01_prefix ?? p.ncfB01Prefix, next: ncf.b01_sequence_next ?? p.ncfB01SequenceNext, end: ncf.b01_sequence_end ?? p.ncfB01SequenceEnd, requiresBuyer: true },
  ];
  // B14 (régimen especial) y B15 (gubernamental): talonarios de Configuración > Secuencias NCF
  for (const [code, label] of [['B14', 'Régimen Especial (B14)'], ['B15', 'Gubernamental (B15)']]) {
    const q = (p.ncfSequences || []).find(x => x.code === code && x.active);
    if (q) traditional.push({ value: code, label, prefix: q.prefix, next: q.next, end: q.end, requiresBuyer: true });
  }
  for (const t of traditional) {
    const next = ncfNextLocal[t.value] || t.next || 1;
    if (t.prefix && (!t.end || next <= t.end)) {
      opts.push({ value: t.value, label: t.label, requiresBuyer: t.requiresBuyer, preview: `${t.prefix}${String(next).padStart(8, '0')}` });
    }
  }
  if (ecfInfo.enabled) {
    const ECF_LABELS = { E32: 'e-CF Consumo (E32)', E31: 'e-CF Crédito fiscal (E31)', E44: 'e-CF Regímenes especiales (E44)', E45: 'e-CF Gubernamental (E45)' };
    for (const code of Object.keys(ECF_LABELS)) {
      const seq = (ecfInfo.sequences || []).find(q => q.tipoEcf === code && q.estado === 'activa' && (!q.rangoHasta || q.secuencial <= q.rangoHasta));
      if (seq) opts.push({ value: code, label: ECF_LABELS[code], requiresBuyer: !!ECF_TYPE_MAP[code]?.requiresBuyer, preview: `${code}${String(seq.secuencial).padStart(10, '0')}` });
    }
  }
  return opts;
}

// Aviso cuando el cliente exige E44/B14 (exento) o E45/B15 (gubernamental) y no hay secuencia disponible; null si no aplica.
export function missingVoucherWarning(customer, { ecf, exempt }, options, suggested) {
  const code = suggested;
  const special = exempt ? 'Régimen Especial (E44/B14)' : customer?.taxpayerType === 'gubernamental' ? 'Gubernamental (E45/B15)' : null;
  if (!special || options.some(o => o.value === code)) return null;
  return `Este cliente requiere comprobante ${special}. Configure su secuencia en Gestión Fiscal.`;
}
