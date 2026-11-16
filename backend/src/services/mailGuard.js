// Contador de ventana deslizante en memoria (se reinicia con el servidor).
export function createWindowCounter(limit, windowMs, now = Date.now) {
  const hits = new Map();
  return {
    hit(key) {
      const t = now();
      // shortcut: barrido completo solo al pasar de 1000 claves; así las claves inactivas no crecen sin límite
      if (hits.size > 1000) {
        for (const [k, arr] of hits) if (!arr.some(x => t - x < windowMs)) hits.delete(k);
      }
      const recent = (hits.get(key) || []).filter(x => t - x < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    }
  };
}

export async function isCompanyContact(tx, companyId, email) {
  const where = { companyId, email: { equals: email.trim(), mode: 'insensitive' } };
  const found = await Promise.all([
    tx.customer.findFirst({ where, select: { id: true } }),
    tx.supplier.findFirst({ where, select: { id: true } }),
    tx.user.findFirst({ where, select: { id: true } })
  ]);
  return found.some(Boolean);
}
