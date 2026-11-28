// Costo por unidad base de una línea vendida: el guardado en la venta; solo en facturas viejas (null) el actual del producto.
export function lineCostFor(item, productsById) {
  if (item.costPrice != null) return Number(item.costPrice);
  const p = productsById.get(item.productId);
  if (!p) return 0;
  const v = item.variantId ? (p.variants || []).find((x) => x.id === item.variantId) : null;
  return Number(v?.purchasePrice) > 0 ? Number(v.purchasePrice) : Number(p.costPrice || 0);
}
