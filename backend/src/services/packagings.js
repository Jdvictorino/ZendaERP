import { PACKAGE_TYPES, roundQty } from './units.js';

// Devuelve el primer error de la lista de empaques, o null si es válida.
export function validatePackagings(packagings, { takenBarcodes = new Set() } = {}) {
  const seen = new Set();
  for (const p of packagings) {
    const name = String(p.name ?? '').trim();
    if (!name) return 'Cada empaque necesita un nombre';
    const factor = Number(p.factor);
    if (!Number.isFinite(factor) || factor <= 0) return `El factor del empaque "${name}" debe ser mayor que 0`;
    if (roundQty(factor) !== factor) return `El factor del empaque "${name}" admite como máximo 3 decimales`;
    if (!PACKAGE_TYPES.some((t) => t.dgii === Number(p.unitCode))) return `Tipo de empaque inválido en "${name}"`;
    const barcode = String(p.barcode ?? '').trim();
    if (!barcode) continue;
    if (seen.has(barcode)) return `El código de barras ${barcode} está repetido entre los empaques`;
    if (takenBarcodes.has(barcode)) return `El código de barras ${barcode} ya lo usa otro producto, variante o empaque`;
    seen.add(barcode);
  }
  return null;
}

const bad = (message) => Object.assign(new Error(message), { status: 400 });

// Barcodes de la empresa (productos, variantes, empaques activos), salvo los del producto editado.
async function takenBarcodes(tx, companyId, productId) {
  const notSelf = productId ? { NOT: { id: productId } } : {};
  const [products, variants, packs] = await Promise.all([
    tx.product.findMany({ where: { companyId, ...notSelf }, select: { barcode: true } }),
    tx.productVariant.findMany({ where: { product: { companyId, ...notSelf } }, select: { barcode: true } }),
    tx.productPackaging.findMany({
      where: { companyId, status: 'active', ...(productId ? { NOT: { productId } } : {}) },
      select: { barcode: true }
    })
  ]);
  return new Set([...products, ...variants, ...packs].map((r) => r.barcode?.trim()).filter(Boolean));
}

/**
 * Reemplaza el conjunto de empaques del producto: crea, actualiza y marca
 * como inactive los que faltan (no se borran: las líneas de factura los referencian).
 * Debe llamarse dentro de una transacción.
 */
export async function savePackagings(tx, { companyId, productId, packagings }) {
  const error = validatePackagings(packagings, { takenBarcodes: await takenBarcodes(tx, companyId, productId) });
  if (error) throw bad(error);

  const current = await tx.productPackaging.findMany({ where: { productId }, select: { id: true } });
  const owned = new Set(current.map((c) => c.id));
  const keep = new Set();

  for (const p of packagings) {
    const data = {
      name: String(p.name).trim(),
      factor: Number(p.factor),
      unitCode: Number(p.unitCode),
      barcode: String(p.barcode ?? '').trim() || null,
      salePrice: p.salePrice === undefined || p.salePrice === null || p.salePrice === '' ? null : Number(p.salePrice),
      status: 'active'
    };
    if (p.id) {
      if (!owned.has(p.id)) throw bad('Empaque no encontrado');
      keep.add(p.id);
      await tx.productPackaging.update({ where: { id: p.id }, data });
    } else {
      const created = await tx.productPackaging.create({ data: { ...data, companyId, productId } });
      keep.add(created.id);
    }
  }

  await tx.productPackaging.updateMany({
    where: { productId, id: { notIn: [...keep] } },
    data: { status: 'inactive' }
  });
}
