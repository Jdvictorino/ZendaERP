// Agrega cobros al desglose de la factura sin repetir los que ya llegaron (cola offline o doble clic).
// Los cobros sin `id` (app vieja) se agregan siempre.
export function appendPayments(previous, added) {
  const seen = new Set(previous.map((p) => p?.id).filter(Boolean));
  const fresh = added.filter((p) => !p?.id || !seen.has(p.id) && seen.add(p.id));
  return [...previous, ...fresh];
}
