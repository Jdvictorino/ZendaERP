import { quantityError } from './units.js';
import { sameCategory } from './categoryPricing.js';

// Categorías que ve la UI cuando la empresa nunca guardó las suyas
export const DEFAULT_CUSTOMER_CATEGORIES = ['General', 'VIP', 'Mayorista'];

// Devuelve el primer error de las filas de precios por categoría, o null si son válidas.
// Sin índice único en BD (NULL cuenta como distinto): la unicidad la garantiza esta validación.
export function validateCategoryPrices(rows, { categories = [], packagingIds = new Set(), allowFractions = true } = {}) {
  const seen = [];
  for (const r of rows) {
    const category = String(r.category ?? '').trim();
    if (!category || !categories.some((c) => sameCategory(c, category))) return `La categoría "${category}" no existe en la empresa`;
    const raw = r.price;
    const price = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(price) || price < 0) return `El precio de la categoría "${category}" debe ser un número mayor o igual a 0`;
    if (price >= 10000000000) return `El precio de la categoría "${category}" es demasiado grande`;
    const packagingId = r.packagingId || null;
    if (packagingId && !packagingIds.has(packagingId)) return `El empaque de la categoría "${category}" no pertenece al producto o está inactivo`;
    const minQuantity = Number(r.minQuantity);
    const qErr = quantityError({ quantity: minQuantity, allowFractions, hasPackaging: !!packagingId });
    if (qErr) return `Cantidad mínima de "${category}": ${qErr}`;
    if (seen.some((s) => sameCategory(s.category, category) && s.packagingId === packagingId && s.minQuantity === minQuantity)) {
      return `Hay un precio repetido para "${category}" con la misma cantidad mínima`;
    }
    seen.push({ category, packagingId, minQuantity });
  }
  return null;
}

/** Reemplaza todas las filas del producto (borra y crea). Debe llamarse dentro de una transacción. */
export async function saveCategoryPrices(tx, { companyId, productId, rows, categories, packagingIds, allowFractions = true }) {
  const error = validateCategoryPrices(rows, { categories, packagingIds, allowFractions });
  if (error) throw Object.assign(new Error(error), { status: 400 });
  await tx.categoryPrice.deleteMany({ where: { productId } });
  if (!rows.length) return;
  await tx.categoryPrice.createMany({
    data: rows.map((r) => ({
      companyId,
      productId,
      category: String(r.category).trim(),
      packagingId: r.packagingId || null,
      minQuantity: Number(r.minQuantity),
      price: Number(r.price)
    }))
  });
}
