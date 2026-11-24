// Original; la app tiene una copia en src/utils/units.js — mantener iguales
// Unidades base, tipos de empaque (códigos de la Tabla IV de la DGII) y regla de cantidad de una línea.

export const BASE_UNITS = [
  { code: 'unidad', label: 'Unidad', abbr: 'und', dgii: 43 },
  { code: 'docena', label: 'Docena', abbr: 'doc', dgii: 13 },
  { code: 'libra', label: 'Libra', abbr: 'lb', dgii: 23 },
  { code: 'onza', label: 'Onza', abbr: 'oz', dgii: 61 },
  { code: 'kilogramo', label: 'Kilogramo', abbr: 'kg', dgii: 21 },
  { code: 'gramo', label: 'Gramo', abbr: 'g', dgii: 17 },
  { code: 'metro', label: 'Metro', abbr: 'm', dgii: 26 },
  { code: 'centimetro', label: 'Centímetro', abbr: 'cm', dgii: 8 },
  { code: 'pie', label: 'Pie', abbr: 'pie', dgii: 33 },
  { code: 'yarda', label: 'Yarda', abbr: 'yd', dgii: 41 },
  { code: 'litro', label: 'Litro', abbr: 'L', dgii: 24 },
  { code: 'mililitro', label: 'Mililitro', abbr: 'ml', dgii: 59 },
  { code: 'galon', label: 'Galón', abbr: 'gal', dgii: 15 },
];

export const PACKAGE_TYPES = [
  { dgii: 6, label: 'Caja' },
  { dgii: 46, label: 'Saco' },
  { dgii: 31, label: 'Paquete' },
  { dgii: 14, label: 'Fardo' },
  { dgii: 2, label: 'Bolsa' },
  { dgii: 5, label: 'Botella' },
  { dgii: 4, label: 'Bulto' },
  { dgii: 7, label: 'Cajetilla' },
  { dgii: 48, label: 'Display' },
  { dgii: 47, label: 'Lata' },
  { dgii: 49, label: 'Bidón' },
  { dgii: 35, label: 'Rollo' },
  { dgii: 13, label: 'Docena' },
  { dgii: 43, label: 'Unidad' },
];

export const unitOf = (code) => BASE_UNITS.find((u) => u.code === code) || BASE_UNITS[0];

export const roundQty = (x) => Math.round((Number(x) + Number.EPSILON) * 1000) / 1000;

export const baseQuantity = ({ quantity, factor = 1 }) => roundQty(Number(quantity) * Number(factor));

// Cantidad de una línea: > 0, a lo sumo 2 decimales; fracciones solo en unidad base de un producto que las permite.
export function quantityError({ quantity, allowFractions, hasPackaging }) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0 || Math.round(q * 100) === 0) return 'La cantidad debe ser mayor que cero.';
  if (Math.abs(q * 100 - Math.round(q * 100)) > 1e-6) return 'Usa como máximo 2 decimales.';
  if (Number.isInteger(q)) return null;
  if (hasPackaging) return 'Los empaques se venden en cantidades enteras.';
  if (!allowFractions) return 'Este producto se vende solo en cantidades enteras.';
  return null;
}

export const formatQty = (quantity, label) => {
  const n = Number(quantity).toLocaleString('es-DO', { maximumFractionDigits: 3 });
  return label ? `${n} ${label}` : n;
};
