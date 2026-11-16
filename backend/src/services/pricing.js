const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;

// Valida una línea de factura contra el catálogo: el precio debe ser uno de lista y el ITBIS el del producto.
// Sin producto (línea libre) siempre pide autorización y solo admite 0, 16 o 18 de ITBIS.
export function checkLinePrice(item, product, variant, maxDiscount) {
  let needsApproval = Number(item.discountPercent) > maxDiscount;
  if (!product) {
    const taxRate = Number(item.taxRate);
    if (![0, 16, 18].includes(taxRate)) return { needsApproval: true, taxRate, error: 'Tasa de ITBIS no válida' };
    return { needsApproval: true, taxRate, error: null };
  }
  const lists = [product.salePrice, product.wholesalePrice, variant?.salePrice]
    .filter((p) => p != null)
    .map(Number);
  // el ajuste de la variante se suma al precio del producto (así lo muestra el POS)
  if (variant && variant.priceAdjustment != null) lists.push(Number(product.salePrice) + Number(variant.priceAdjustment));
  if (!lists.some((p) => near(p, item.unitPrice))) needsApproval = true;
  return { needsApproval, taxRate: product.isTaxable ? Number(product.taxRate) : 0, error: null };
}

export const creditExceeded = ({ creditLimit, pendingBalance, newTotal }) =>
  Number(creditLimit) > 0 && Number(pendingBalance) + Number(newTotal) > Number(creditLimit) + 0.01;

// Mismo cruce de nombres que usa la pantalla de pedidos (sin distinguir mayúsculas)
export function categoryDiscount(category, discounts = {}) {
  if (!category || !discounts) return 0;
  const key = Object.keys(discounts).find((k) => k === category || k?.toLowerCase?.() === category.toLowerCase());
  return key ? Number(discounts[key]) || 0 : 0;
}

// Descuento (%) permitido sin PIN: el mayor entre el tope general, el del cliente y el de su categoría
export function allowedDiscountPercent(pricing, customer) {
  const max = Number(pricing?.maxDiscountPercent ?? 5);
  return Math.max(
    Number.isFinite(max) ? max : 5,
    Number(customer?.defaultDiscount) || 0,
    categoryDiscount(customer?.category?.trim() || 'Sin categoría', pricing?.categoryDiscounts)
  );
}

// Descuento en monto que cubre un cupón vigente sobre el total bruto
export function couponCap(offer, grossTotal, now = new Date()) {
  if (!offer || offer.status !== 'active') return 0;
  if ((offer.validFrom && offer.validFrom > now) || (offer.validUntil && offer.validUntil < now)) return 0;
  const value = Number(offer.discountValue) || 0;
  return offer.discountType === 'percent' ? grossTotal * value / 100 : value;
}
