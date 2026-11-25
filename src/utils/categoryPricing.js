// Copia de backend/src/services/categoryPricing.js — mantener iguales (test/categoryPricing.spec.js prueba ambas)
// Precio por categoría de cliente con escalones por cantidad (precios sin ITBIS).

const norm = (c) => (c || '').trim().toLowerCase() || 'sin categoría';

export const sameCategory = (a, b) => norm(a) === norm(b);

// minQuantity va en la unidad de la línea (base, o cantidad de empaques si hay packagingId)
export function resolveUnitPrice({ basePrice, category, packagingId = null, quantity, categoryPrices = [], categoryDiscountPercent = 0 }) {
  const qty = Number(quantity) || 0;
  const row = norm(category) === 'sin categoría' ? null : categoryPrices
    .filter((r) => sameCategory(r.category, category) && (r.packagingId ?? null) === (packagingId ?? null) && Number(r.minQuantity) <= qty)
    .sort((a, b) => Number(b.minQuantity) - Number(a.minQuantity))[0];
  return row
    ? { price: Number(row.price), discountPercent: 0, fromCategory: true }
    : { price: Number(basePrice), discountPercent: Number(categoryDiscountPercent) || 0, fromCategory: false };
}
