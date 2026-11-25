import { resolveUnitPrice } from '../../utils/categoryPricing.js';

// Reaplica precio y % de la categoría del cliente a una línea; lo escrito a mano por el cajero se respeta.
export function repriceRow(row, { category, categoryDiscountPercent = 0 } = {}) {
  if (!row.originalId || row.basePrice == null) return row;
  const r = resolveUnitPrice({ basePrice: row.basePrice, category, packagingId: row.packagingId || null, quantity: row.qty, categoryPrices: row.categoryPrices || [], categoryDiscountPercent });
  return { ...row, price: row.manualPrice ? row.price : r.price, disc: row.manualDisc ? row.disc : r.discountPercent };
}
