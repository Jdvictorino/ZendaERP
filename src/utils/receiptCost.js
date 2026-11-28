// Copia de allocateCharges (backend/src/services/purchases.js) para la vista previa; test/receiptCost.spec.js exige que den lo mismo.
const round4 = (n) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
export const CHARGE_KEYS = ['flete', 'seguro', 'aranceles', 'otros'];

const chargeNum = (v) => (typeof v === 'string' && v.trim() === '' ? 0 : typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN);

export const normalizeCharges = (charges) =>
  Object.fromEntries(CHARGE_KEYS.map((k) => [k, charges?.[k] == null ? 0 : chargeNum(charges[k]) || 0]));

export function allocateCharges(lines, charges = {}) {
  const c = normalizeCharges(charges);
  const T = Math.round(CHARGE_KEYS.reduce((a, k) => a + c[k], 0) * 100);
  const value = lines.map((l) => Number(l.quantity) * Number(l.unitCost));
  const weights = value.some((v) => v > 0) ? value : lines.map((l) => Number(l.quantity) * (Number(l.factor) || 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const cents = weights.map((w) => (sum > 0 ? Math.floor(T * w / sum) : 0));
  if (sum > 0) {
    let left = T - cents.reduce((a, b) => a + b, 0);
    const order = weights.map((w, i) => i).filter((i) => weights[i] > 0)
      .sort((i, j) => (T * weights[j] / sum - cents[j]) - (T * weights[i] / sum - cents[i]) || i - j);
    for (let k = 0; left > 0; k++, left--) cents[order[k % order.length]]++;
  }
  return Object.fromEntries(lines.map((l, i) => [l.itemId, cents[i] / 100]));
}

// Costo unitario final por unidad base de cada línea: unitCost/factor + parte/qBase, a 4 decimales.
export function previewUnitCosts(lines, charges) {
  const parts = allocateCharges(lines, charges);
  return Object.fromEntries(lines.map((l) => {
    const factor = Number(l.factor) || 1;
    const qBase = Number(l.quantity) * factor;
    return [l.itemId, qBase > 0 ? round4(Number(l.unitCost) / factor + parts[l.itemId] / qBase) : 0];
  }));
}
