import { unitOf } from '../../utils/units.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Entradas vendibles de la caja: cada producto (o variante) en unidad base y una más por cada empaque activo.
// `baseId` agrupa las entradas de un mismo producto/variante (es la clave del chequeo de existencias);
// `options` lista unidad base + empaques para el selector de la línea.
export function catalogEntries(products) {
  return (Array.isArray(products) ? products : [])
    .filter((p) => p.status !== 'inactive')
    .flatMap((p) => {
      const packs = (p.packagings || []).filter((k) => k.status !== 'inactive');
      const unitAbbr = unitOf(p.unit).abbr;
      const bases = p.variants?.length
        ? p.variants.map((v) => ({
            ...p,
            id: `${p.id}:${v.id}`,
            productId: p.id,
            variantId: v.id,
            name: `${p.name} (${v.name})`,
            sku: v.sku || p.sku,
            barcode: v.barcode || p.barcode,
            salePrice: Number(v.salePrice) > 0 ? Number(v.salePrice) : Number(p.salePrice) + Number(v.priceAdjustment || 0),
            stock: v.stock,
          }))
        : [p];
      return bases.flatMap((b) => {
        const packEntries = packs.map((k) => ({
          ...b,
          id: `${b.id}#${k.id}`,
          packagingId: k.id,
          packagingName: k.name,
          factor: Number(k.factor),
          barcode: k.barcode,
          salePrice: k.salePrice != null ? Number(k.salePrice) : round2(Number(k.factor) * Number(b.salePrice)),
          name: `${b.name} — ${k.name}`,
        }));
        const base = { ...b, packagingId: null, packagingName: null, factor: 1, unitAbbr };
        const options = [
          { packagingId: null, packagingName: null, factor: 1, salePrice: Number(b.salePrice) || 0, id: b.id },
          ...packEntries.map((e) => ({ packagingId: e.packagingId, packagingName: e.packagingName, factor: e.factor, salePrice: e.salePrice, id: e.id })),
        ];
        return [base, ...packEntries].map((e) => ({ ...e, baseId: b.id, baseName: b.name, unitAbbr, options }));
      });
    });
}
