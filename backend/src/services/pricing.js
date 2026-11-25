import { round2 } from './tax.js';
import { resolveUnitPrice } from './categoryPricing.js';

const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;

// Valida una línea de factura contra el catálogo: el precio debe ser uno de lista y el ITBIS el del producto.
// Sin producto (línea libre) siempre pide autorización y solo admite 0, 16 o 18 de ITBIS.
// ctx = { category, categoryDiscountPercent, maxDiscountNoCategory }: habilita el precio de la categoría (product.categoryPrices)
export function checkLinePrice(item, product, variant, maxDiscount, packaging = null, ctx = {}) {
  let needsApproval = Number(item.discountPercent) > maxDiscount;
  if (!product) {
    const taxRate = Number(item.taxRate);
    if (![0, 16, 18].includes(taxRate)) return { needsApproval: true, taxRate, error: 'Tasa de ITBIS no válida' };
    return { needsApproval: true, taxRate, error: null };
  }
  // con variante solo valen su precio efectivo (el mismo del POS) y el mayorista; el precio suelto del producto no
  const wholesale = product.wholesalePrice != null ? Number(product.wholesalePrice) : null;
  // con empaque: salePrice propio, o factor × precio efectivo por unidad (el de la variante si la hay).
  // shortcut: wholesalePrice no aplica a líneas con empaque en este PR.
  const unitList = variant && Number(variant.salePrice) > 0 ? Number(variant.salePrice) : Number(product.salePrice) + Number(variant?.priceAdjustment || 0);
  const lists = packaging
    ? [packaging.salePrice != null ? Number(packaging.salePrice) : round2(Number(packaging.factor) * unitList)]
    : variant
    ? [Number(variant.salePrice) > 0 ? Number(variant.salePrice) : Number(product.salePrice) + Number(variant.priceAdjustment || 0), ...(wholesale > 0 ? [wholesale] : [])]
    : [Number(product.salePrice), ...(wholesale != null ? [wholesale] : [])];
  // un precio de categoría reemplaza el % de la categoría: el tope sin PIN no lo cuenta, lo mande o no el cajero
  const rule = ctx.category != null && product.categoryPrices?.length
    ? resolveUnitPrice({ basePrice: lists[0], category: ctx.category, packagingId: packaging?.id ?? null, quantity: item.quantity, categoryPrices: product.categoryPrices, categoryDiscountPercent: ctx.categoryDiscountPercent })
    : null;
  if (rule?.fromCategory) {
    lists.push(rule.price);
    needsApproval = Number(item.discountPercent) > (ctx.maxDiscountNoCategory ?? maxDiscount);
  }
  if (!lists.some((p) => near(p, item.unitPrice))) needsApproval = true;
  return { needsApproval, taxRate: product.isTaxable ? Number(product.taxRate) : 0, error: null };
}

// ¿Alguna línea ya salió a precio de la categoría? (entonces el % de la categoría no se suma sobre el total)
export const anyLineFromCategory = (items, category, categoryPrices) =>
  !!category?.trim() && items.some((i) => resolveUnitPrice({ basePrice: i.unitPrice, category, packagingId: i.packagingId ?? null, quantity: i.quantity, categoryPrices: categoryPrices.filter((r) => r.productId === i.productId) }).fromCategory);

export const creditExceeded = ({ creditLimit, pendingBalance, newTotal }) =>
  Number(creditLimit) > 0 && Number(pendingBalance) + Number(newTotal) > Number(creditLimit) + 0.01;

// Mismo cruce de nombres que usa la pantalla de pedidos (sin distinguir mayúsculas)
export function categoryDiscount(category, discounts = {}) {
  if (!category || !discounts) return 0;
  const key = Object.keys(discounts).find((k) => k === category || k?.toLowerCase?.() === category.toLowerCase());
  return key ? Number(discounts[key]) || 0 : 0;
}

// Descuento (%) permitido sin PIN: el mayor entre el tope general, el del cliente y el de su categoría
export function allowedDiscountPercent(pricing, customer, { withCategory = true } = {}) {
  const max = Number(pricing?.maxDiscountPercent ?? 5);
  return Math.max(
    Number.isFinite(max) ? max : 5,
    Number(customer?.defaultDiscount) || 0,
    withCategory ? categoryDiscount(customer?.category?.trim() || 'Sin categoría', pricing?.categoryDiscounts) : 0
  );
}

// Descuento en monto que cubre un cupón vigente sobre el total bruto
export function couponCap(offer, grossTotal, now = new Date()) {
  if (!offer || offer.status !== 'active') return 0;
  if ((offer.validFrom && offer.validFrom > now) || (offer.validUntil && offer.validUntil < now)) return 0;
  const value = Number(offer.discountValue) || 0;
  return offer.discountType === 'percent' ? grossTotal * value / 100 : value;
}
