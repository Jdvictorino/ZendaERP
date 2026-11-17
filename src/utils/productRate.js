// Tasa de ITBIS de un producto: taxRate/isTaxable si vienen, si no el texto "Gravado (18%)".
export function productRate(p) {
  if (!p || p.isTaxable === false || p.taxStatus === 'Exento') return 0;
  if (Number.isFinite(parseFloat(p.taxRate))) return parseFloat(p.taxRate);
  const m = /(\d+(?:\.\d+)?)%/.exec(p.taxStatus || '');
  return m ? parseFloat(m[1]) : 18;
}
