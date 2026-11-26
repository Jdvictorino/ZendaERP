// Copia de src/utils/noteSplit.js — mantener iguales (test/noteSplit.spec.js prueba ambas)
// Reparto de base e ITBIS de una nota de crédito/débito: lo comparten el e-CF, el 607 y la contabilidad.
import { lineAmounts, netUnitPrice, round2 } from './tax.js';
import { unitOf } from './units.js';

// Base e ITBIS de una línea; fuente única para los ítems y los totales
export function lineCalc(item) {
  if (item.storedBase === undefined) return lineAmounts(item);
  const base = item.storedBase;
  if (!(item.taxRate > 0)) return { base, itbis: 0 };
  // Línea con ITBIS incluido: el ITBIS es lo cobrado menos la base, así la línea suma exactamente lo cobrado
  return { base, itbis: item.storedGross !== undefined ? round2(item.storedGross - base) : round2((base * item.taxRate) / 100) };
}

/**
 * Reparte `target` (total con ITBIS) entre las líneas en proporción a su monto con ITBIS (`net` = base de la línea).
 * Cada línea conserva su precio unitario sin ITBIS (`unitPrice`); la rebaja queda como descuento de la línea.
 * El centavo que sobra del redondeo va en la línea más grande, así el total queda a un centavo o menos de `target`.
 * Sin líneas con monto, una línea exenta de ajuste. Usado por las notas y por facturas con cupón.
 */
export function scaleToTotal(lines, target, reason = 'Ajuste') {
  const rate = (l) => Number(l.taxRate || 0);
  const withTax = lines.reduce((sum, l) => sum + l.net * (1 + rate(l) / 100), 0);
  if (!(withTax > 0) || !(target > 0)) {
    return [{ productName: reason, quantity: 1, taxRate: 0, discountPercent: 0, unitPrice: round2(target) }];
  }
  const factor = target / withTax;
  const out = lines.map((l) => ({ productName: l.productName, quantity: Number(l.quantity), unitCode: l.packaging?.unitCode ?? l.unitCode ?? unitOf(l.product?.unit).dgii, taxRate: rate(l), discountPercent: 0, unitPrice: Number(l.unitPrice), storedBase: round2(l.net * factor) }));
  const gross = (l, base = l.storedBase) => base + round2((base * l.taxRate) / 100);
  const bySize = [...out].sort((a, b) => b.storedBase - a.storedBase);
  const largest = bySize[0];
  for (let i = bySize.length - 1; ; i--) {
    const rest = out.reduce((sum, l) => (l === largest ? sum : sum + gross(l)), 0);
    // Base de la línea más grande que deja el total más cerca de target (con ITBIS no todo total existe al centavo)
    const ideal = Math.max(0, round2((target - rest) / (1 + largest.taxRate / 100)));
    const off = (b) => Math.abs(round2(rest + gross(largest, b) - target));
    largest.storedBase = [ideal, round2(ideal - 0.01), round2(ideal + 0.01)].filter((b) => b >= 0).reduce((a, b) => (off(b) < off(a) ? b : a));
    if (off(largest.storedBase) <= 0.01 || i < 1) break;
    // Nota pequeña sobre muchas líneas: los centavos redondeados de las demás ya pasan target; se quita la más pequeña
    bySize[i].storedBase = 0;
  }
  // Una nota pequeña deja en cero algunas líneas: no se declaran (las de precio cero desde la venta sí)
  const kept = out.filter((l, i) => l.storedBase > 0 || !(lines[i].net > 0));
  return kept.length ? kept : out;
}

/**
 * Calcula los totales desglosados por tasa de ITBIS, redondeando cada línea
 */
export function calcularTotalesPorTasa(items) {
  const t = { montoGravadoI1: 0, montoGravadoI2: 0, montoGravadoI3: 0, montoExento: 0, totalITBIS1: 0, totalITBIS2: 0, totalITBIS3: 0 };

  for (const item of items) {
    const rate = item.taxRate;
    const { base, itbis } = lineCalc(item);
    if (rate === 18) { t.montoGravadoI1 += base; t.totalITBIS1 += itbis; }
    else if (rate === 16) { t.montoGravadoI2 += base; t.totalITBIS2 += itbis; }
    else if (rate > 0) { t.montoGravadoI3 += base; t.totalITBIS3 += itbis; }
    else t.montoExento += base;
  }

  for (const k of Object.keys(t)) t[k] = round2(t[k]);
  const montoGravadoTotal = round2(t.montoGravadoI1 + t.montoGravadoI2 + t.montoGravadoI3);
  const totalITBIS = round2(t.totalITBIS1 + t.totalITBIS2 + t.totalITBIS3);
  return { ...t, montoGravadoTotal, totalITBIS, montoTotal: round2(montoGravadoTotal + t.montoExento + totalITBIS) };
}

/** Líneas (sin ITBIS, llevadas al monto de la nota) que declara la nota; `lines` = artículos devueltos. */
export function noteLines(note, invoice, { lines } = {}) {
  const source = lines?.length ? lines : invoice.items || [];
  const unit = (i) => netUnitPrice({ unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate || 0) }, !!invoice.pricesIncludeTax);
  const amount = parseFloat(note.amount);
  return scaleToTotal(source.map((i) => ({ ...i, unitPrice: unit(i), net: unit(i) * (1 - parseFloat(i.discountPercent || 0) / 100) * Number(i.quantity) })), amount, note.reason || 'Ajuste');
}

/** Base gravada, ITBIS y exento de la nota (lo que declara su e-CF), más el detalle por tasa. */
export function noteAmounts(note, invoice, opts) {
  const t = calcularTotalesPorTasa(noteLines(note, invoice, opts));
  return { base: t.montoGravadoTotal, itbis: t.totalITBIS, exempt: t.montoExento, byRate: t };
}

/** Artículos que devolvió una nota guardada (`note.items` = [{ itemId, quantity }]) tomados de la factura; sin items, queda vacío y la nota usa toda la factura. */
export function noteReturnLines(note, invoice) {
  const rows = Array.isArray(note.items) ? note.items : [];
  return rows.map((r) => { const it = (invoice.items || []).find((i) => i.id === r.itemId); return it && { ...it, quantity: r.quantity }; }).filter(Boolean);
}
