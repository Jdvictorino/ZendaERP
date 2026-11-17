import { ECF_TYPE_MAP } from './ecfConstants.js';

// Comprobantes que el negocio puede emitir hoy: NCF tradicional con talonario vigente + e-CF con secuencia activa.
// ecfInfo = { enabled, sequences }; ncfNextLocal = contadores que avanzaron en esta sesión.
export function buildVoucherOptions(companyProfile, ecfInfo = { enabled: false, sequences: [] }, ncfNextLocal = {}) {
  const p = companyProfile || {};
  // GET /settings entrega las secuencias como ncf.b02_prefix / ncf.b02_sequence_next
  const ncf = p.ncf || {};
  const opts = [{ value: 'NoFiscal', label: 'Sin valor fiscal', requiresBuyer: false, preview: '' }];
  const seqs = Array.isArray(p.ncfSequences) ? p.ncfSequences : [];
  // Mismo criterio que takeNcf: B01/B02 usan el prefijo de la columna y, si no hay, el de Secuencias NCF; una secuencia inactiva no se ofrece
  const traditional = [
    ['B02', 'Consumo (B02)', false, true], ['B01', 'Crédito fiscal (B01)', true, true],
    ['B14', 'Régimen Especial (B14)', true, false], ['B15', 'Gubernamental (B15)', true, false],
  ].flatMap(([code, label, requiresBuyer, hasColumn]) => {
    const key = code.toLowerCase();
    const seq = seqs.find(x => x.code === code);
    const prefix = (hasColumn && (ncf[`${key}_prefix`] ?? p[`ncf${code}Prefix`])) || seq?.prefix;
    if (!prefix || (seq && !seq.active)) return [];
    const next = hasColumn ? (ncf[`${key}_sequence_next`] ?? p[`ncf${code}SequenceNext`] ?? seq?.next) : seq?.next;
    return [{ value: code, label, prefix, next, end: seq?.end ?? ncf[`${key}_sequence_end`] ?? p[`ncf${code}SequenceEnd`], requiresBuyer }];
  });
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
