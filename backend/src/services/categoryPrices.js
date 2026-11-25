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

const has = (list, c) => list.some((x) => sameCategory(x, c));

/**
 * Qué cambia al pasar de la lista vieja a la nueva. Cada categoría vieja sigue la cadena de entradas
 * (la UI manda una por tecla) hasta su nombre final:
 * - renames: el nombre final es nuevo y está en la lista (precios y clientes se mueven)
 * - merges: el nombre final ya existía, o ya lo toma otra categoría (solo clientes; los precios de la origen se borran)
 * - removed: precios a borrar (categorías quitadas y orígenes de un merge); vacío salvo que migrations.pricesAware === true,
 *   y solo de las que estén en migrations.base (lista que la app cargó)
 * Con varias categorías que terminan en el mismo nombre, solo una es renombre: la primera de la lista vieja
 * cuya cadena no pasa por otra del grupo. Lista nueva vacía o ausente: nada.
 */
export function planCategoryChanges(oldList, newList, migrations) {
  if (!Array.isArray(newList) || !newList.length) return { renames: [], merges: [], removed: [] };
  const old = Array.isArray(oldList) ? oldList : [];
  const entries = (migrations?.entries || []).filter((e) => e?.from && e?.to);
  const merges = [], removed = [], groups = [];
  for (const o of old) {
    if (has(newList, o)) continue;
    let cur = o;
    const via = [];
    for (const e of entries) if (sameCategory(e.from, cur)) { cur = e.to; via.push(cur); }
    if (sameCategory(cur, o) || !has(newList, cur)) { removed.push(o); continue; }
    const g = groups.find((x) => sameCategory(x.to, cur));
    if (g) g.items.push({ from: o, via }); else groups.push({ to: cur, items: [{ from: o, via }] });
  }
  const renames = [];
  for (const { to, items } of groups) {
    const direct = (i) => !items.some((j) => j !== i && i.via.some((v) => sameCategory(v, j.from)));
    const winner = has(old, to) ? null : items.find(direct) || items[0];
    for (const i of items) {
      if (i === winner) renames.push({ from: i.from, to });
      else { merges.push({ from: i.from, to }); removed.push(i.from); }
    }
  }
  // solo se borran precios de categorías que la app conocía (base): las creadas en otro equipo no se tocan
  const base = Array.isArray(migrations?.base) ? migrations.base : [];
  return { renames, merges, removed: migrations?.pricesAware === true ? removed.filter((r) => has(base, r)) : [] };
}

/** Filas base (cantidad 1, sin empaque) con el precio al por mayor de cada producto que aún no la tiene en la categoría. */
export function wholesaleRows(products, existing, category) {
  return products
    .filter((p) => Number(p.wholesalePrice) > 0
      && !existing.some((e) => e.productId === p.id && sameCategory(e.category, category) && !e.packagingId && Number(e.minQuantity) === 1))
    .map((p) => ({ productId: p.id, category, packagingId: null, minQuantity: 1, price: Number(p.wholesalePrice) }));
}
