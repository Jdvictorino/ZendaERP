// Copia de backend/src/services/withholdings.js — mantener iguales (test/withholdings.spec.js prueba ambas)
// Retenciones de ITBIS/ISR: valores iniciales (verifica con tu contador), cálculo y saldo de factura.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => Number(v) || 0;

const SUPPLIER_TYPES = ['persona_fisica', 'empresa', 'informal', 'exterior', 'any'];
const ISR_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8'];

export const DEFAULT_WITHHOLDINGS = [
  { id: 'honorarios', name: 'Honorarios profesionales', supplierTypes: ['persona_fisica'], itbisPercent: 100, isrPercent: 15, isrType: '2', active: true },
  { id: 'servicios-tecnicos', name: 'Servicios técnicos (limpieza, fumigación…)', supplierTypes: ['persona_fisica'], itbisPercent: 100, isrPercent: 2, isrType: '3', active: true },
  { id: 'alquiler', name: 'Alquiler de local', supplierTypes: ['persona_fisica'], itbisPercent: 100, isrPercent: 15, isrType: '1', active: true },
  { id: 'informal', name: 'Compra a informal (B11)', supplierTypes: ['informal'], itbisPercent: 100, isrPercent: 0, isrType: null, active: true },
  { id: 'empresa-30', name: 'Servicios de empresas sujetos al 30 %', supplierTypes: ['empresa'], itbisPercent: 30, isrPercent: 0, isrType: null, active: true },
  { id: 'rst', name: 'Proveedor del RST', supplierTypes: ['any'], itbisPercent: 100, isrPercent: 0, isrType: null, active: true },
];

export const withholdingsOf = (settings) =>
  Array.isArray(settings?.withholdings) ? settings.withholdings : DEFAULT_WITHHOLDINGS;

export const conceptsFor = (list, supplierType) =>
  (list || []).filter((c) => c.active && (c.supplierTypes.includes(supplierType) || c.supplierTypes.includes('any')));

export const withholdingFor = (concept, { itbisFacturado, montoBienes, montoServicios } = {}) => {
  const isr = num(concept.isrPercent);
  return {
    itbisRetenido: round2((num(itbisFacturado) * num(concept.itbisPercent)) / 100),
    montoRetencionIsr: round2(((num(montoBienes) + num(montoServicios)) * isr) / 100),
    retencionIsrTipo: isr > 0 ? concept.isrType : null,
  };
};

const pct = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

export const validateWithholdings = (list) => {
  if (!Array.isArray(list)) return 'La tabla de retenciones no es válida';
  const ids = new Set();
  for (const c of list) {
    if (!c || !String(c.name || '').trim()) return 'Cada retención necesita un nombre';
    if (!c.id || ids.has(c.id)) return `Retención con id repetido o vacío: ${c.name}`;
    ids.add(c.id);
    if (!pct(c.itbisPercent) || !pct(c.isrPercent)) return `Los porcentajes de "${c.name}" deben estar entre 0 y 100`;
    if (!Array.isArray(c.supplierTypes) || !c.supplierTypes.length || c.supplierTypes.some((t) => !SUPPLIER_TYPES.includes(t)))
      return `Elige al menos un tipo de proveedor válido en "${c.name}"`;
    if (Number(c.isrPercent) > 0 && !ISR_TYPES.includes(String(c.isrType)))
      return `Elige el tipo de ISR (1 a 8) en "${c.name}"`;
  }
  return null;
};

const retained = (i) => num(i.itbisRetenido) + num(i.retencionRenta);

export const invoiceBalance = (i) => Math.max(0, round2(num(i.total) - num(i.amountPaid) - retained(i)));

export const invoiceStatus = (i) => {
  const settled = num(i.amountPaid) + retained(i);
  if (settled >= num(i.total) - 0.01) return 'Pagado';
  return settled > 0 ? 'Pagado Parcialmente' : 'Pendiente';
};
