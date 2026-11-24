// Original; la app tiene una copia en src/utils/tax.js — mantener iguales
// Los precios de catálogo van sin ITBIS; el ITBIS se calcula por línea.

export const TAXPAYER_TYPES = [
  { value: 'consumidor_final', label: 'Consumidor final', exemptible: false },
  { value: 'persona_fisica', label: 'Persona Física', exemptible: false },
  { value: 'empresa', label: 'Empresa', exemptible: false },
  { value: 'gubernamental', label: 'Gubernamental', exemptible: false },
  { value: 'zona_franca', label: 'Zona franca', exemptible: true },
  { value: 'regimen_especial', label: 'Régimen especial', exemptible: true },
  { value: 'diplomatico', label: 'Diplomático / organismo internacional', exemptible: true },
  { value: 'ong', label: 'ONG / sin fines de lucro', exemptible: true },
];

const EXEMPT_VOUCHERS = ['E44', 'B14'];

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Fecha de hoy en RD (UTC-4 sin horario de verano), no la del servidor/PC.
export function todayRD(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(now);
}

const isExemptible = (type) => TAXPAYER_TYPES.some((t) => t.value === type && t.exemptible);
const expiryDay = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

export function exemptionStatus(customer, today) {
  if (!customer || !isExemptible(customer.taxpayerType)) return 'none';
  const number = (customer.exemptionNumber || '').trim();
  if (!number || !customer.exemptionExpiresAt) return 'missing';
  return expiryDay(customer.exemptionExpiresAt) >= today ? 'valid' : 'expired';
}

export const isTaxExempt = (customer, today) => exemptionStatus(customer, today) === 'valid';

export function lineAmounts({ quantity, unitPrice, discountPercent = 0, taxRate = 0 }) {
  const base = round2(quantity * unitPrice * (1 - discountPercent / 100));
  return { base, itbis: round2((base * taxRate) / 100) };
}

export function invoiceTotals(lines) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const { base, itbis } = lineAmounts(l);
    subtotal += base;
    taxAmount += itbis;
  }
  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export function suggestedVoucher(customer, { ecf, exempt }) {
  const type = customer?.taxpayerType;
  if (exempt) return ecf ? 'E44' : 'B14';
  if (type === 'gubernamental') return ecf ? 'E45' : 'B15';
  if (!customer || type === 'consumidor_final') return ecf ? 'E32' : 'B02';
  return ecf ? 'E31' : 'B01';
}

export function voucherError(ncfType, { exemptApplied, taxpayerType }) {
  const isExemptVoucher = EXEMPT_VOUCHERS.includes(ncfType);
  if (exemptApplied && !isExemptVoucher) return 'Venta exenta de ITBIS: use el comprobante de Régimen Especial (E44/B14).';
  if (!exemptApplied && isExemptVoucher) return 'El comprobante de Régimen Especial (E44/B14) solo aplica a clientes exentos con carnet vigente.';
  if ((ncfType === 'E45' || ncfType === 'B15') && taxpayerType !== 'gubernamental') return 'El comprobante Gubernamental (E45/B15) solo aplica a clientes gubernamentales.';
  return null;
}

export const netUnitPrice = (item, pricesIncludeTax) =>
  pricesIncludeTax ? round2(item.unitPrice / (1 + item.taxRate / 100)) : item.unitPrice;
