/**
 * ecfConstants.js — Constantes para Facturación Electrónica (e-CF) DGII
 */

// Tipos de e-CF con sus códigos y nombres oficiales
export const ECF_TYPES = [
  { code: 'E31', dgiiCode: 31, name: 'Factura de Crédito Fiscal Electrónica', shortName: 'FCF Electrónica', requiresBuyer: true },
  { code: 'E32', dgiiCode: 32, name: 'Factura de Consumo Electrónica', shortName: 'FC Electrónica', requiresBuyer: false },
  { code: 'E33', dgiiCode: 33, name: 'Nota de Débito Electrónica', shortName: 'ND Electrónica', requiresBuyer: true },
  { code: 'E34', dgiiCode: 34, name: 'Nota de Crédito Electrónica', shortName: 'NC Electrónica', requiresBuyer: true },
  { code: 'E41', dgiiCode: 41, name: 'Comprobante de Compras Electrónico', shortName: 'Compras Elect.', requiresBuyer: true },
  { code: 'E43', dgiiCode: 43, name: 'Comprobante de Gastos Menores Electrónico', shortName: 'Gastos Menores', requiresBuyer: false },
  { code: 'E44', dgiiCode: 44, name: 'Comprobante de Regímenes Especiales Electrónico', shortName: 'Reg. Especiales', requiresBuyer: true },
  { code: 'E45', dgiiCode: 45, name: 'Comprobante Gubernamental Electrónico', shortName: 'Gubernamental', requiresBuyer: true },
  { code: 'E46', dgiiCode: 46, name: 'Comprobante para Exportaciones Electrónico', shortName: 'Exportaciones', requiresBuyer: false },
  { code: 'E47', dgiiCode: 47, name: 'Comprobante para Pagos al Exterior Electrónico', shortName: 'Pagos Exterior', requiresBuyer: false },
];

// Mapeo rápido por código
export const ECF_TYPE_MAP = Object.fromEntries(
  ECF_TYPES.map(t => [t.code, t])
);

// Estados DGII con sus etiquetas y colores
export const ECF_STATUSES = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', bgColor: '#fef3c7', icon: 'clock' },
  enviado: { label: 'Enviado', color: '#3b82f6', bgColor: '#dbeafe', icon: 'send' },
  en_proceso: { label: 'En Proceso', color: '#8b5cf6', bgColor: '#ede9fe', icon: 'loader' },
  aceptado: { label: 'Aceptado', color: '#10b981', bgColor: '#d1fae5', icon: 'check-circle' },
  aceptado_condicional: { label: 'Aceptado Condicional', color: '#f97316', bgColor: '#ffedd5', icon: 'alert-circle' },
  rechazado: { label: 'Rechazado', color: '#ef4444', bgColor: '#fee2e2', icon: 'x-circle' },
  error: { label: 'Error', color: '#dc2626', bgColor: '#fecaca', icon: 'alert-triangle' },
};

// Formas de pago según la DGII
export const ECF_PAYMENT_METHODS = [
  { code: 1, name: 'Efectivo' },
  { code: 2, name: 'Cheques / Transferencia / Depósito' },
  { code: 3, name: 'Tarjeta de Crédito / Débito' },
  { code: 4, name: 'Compra a Crédito' },
  { code: 5, name: 'Permuta' },
  { code: 6, name: 'Nota de Crédito' },
  { code: 7, name: 'Mixto' },
];

// Tipos de ingreso según la DGII
export const ECF_INCOME_TYPES = [
  { code: '01', name: 'Ingresos por operaciones (No financieros)' },
  { code: '02', name: 'Ingresos financieros' },
  { code: '03', name: 'Ingresos extraordinarios' },
  { code: '04', name: 'Ingresos por arrendamientos' },
  { code: '05', name: 'Ingresos por venta de activo depreciable' },
  { code: '06', name: 'Otros ingresos' },
];

// Ambientes DGII
export const ECF_ENVIRONMENTS = [
  { code: 'test', name: 'Pruebas (TesteCF)', description: 'Ambiente de pruebas para desarrollo', url: 'https://ecf.dgii.gov.do/TesteCF' },
  { code: 'certification', name: 'Certificación (CerteCF)', description: 'Ambiente de certificación DGII', url: 'https://ecf.dgii.gov.do/CerteCF' },
  { code: 'production', name: 'Producción (eCF)', description: 'Ambiente de producción real', url: 'https://ecf.dgii.gov.do/eCF' },
];

// Mapeo de NCF tradicional → e-CF equivalente
export const NCF_TO_ECF_MAP = {
  B01: 'E31', // Crédito Fiscal → FCF Electrónica
  B02: 'E32', // Consumidor Final → FC Electrónica
  B03: 'E33', // Nota de Débito
  B04: 'E34', // Nota de Crédito
  B11: 'E41', // Comprobante de Compras
  B13: 'E43', // Gastos Menores
  B14: 'E44', // Regímenes Especiales
  B15: 'E45', // Gubernamental
  B16: 'E46', // Exportaciones
  B17: 'E47', // Pagos al Exterior
};

// Estados de secuencia
export const SEQUENCE_STATUSES = {
  activa: { label: 'Activa', color: '#10b981' },
  agotada: { label: 'Agotada', color: '#ef4444' },
  vencida: { label: 'Vencida', color: '#f59e0b' },
  inactiva: { label: 'Inactiva', color: '#6b7280' },
};

export default {
  ECF_TYPES,
  ECF_TYPE_MAP,
  ECF_STATUSES,
  ECF_PAYMENT_METHODS,
  ECF_INCOME_TYPES,
  ECF_ENVIRONMENTS,
  NCF_TO_ECF_MAP,
  SEQUENCE_STATUSES,
};
