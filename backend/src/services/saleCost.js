// Costo por unidad base que la venta guarda en la línea: el de la variante si es mayor que 0; si no, el del producto.
// Sin producto (servicio o texto libre): null.
export function lineCost(product, variant) {
  if (!product) return null;
  const v = Number(variant?.purchasePrice || 0);
  return v > 0 ? v : Number(product.costPrice || 0);
}

// Lee el costo dentro de la transacción que descuenta la existencia (el UPDATE del stock ya tomó el bloqueo de la fila).
export async function readLineCost(tx, companyId, { productId, variantId }) {
  if (!productId) return null;
  const product = await tx.product.findFirst({ where: { id: productId, companyId }, select: { costPrice: true } });
  const variant = variantId ? await tx.productVariant.findFirst({ where: { id: variantId, productId }, select: { purchasePrice: true } }) : null;
  return lineCost(product, variant);
}
