// Reglas puras de compras: totales, recepción, facturación y sugerencia de reposición.
import { round2 } from './tax.js';
import { roundQty, quantityError } from './units.js';

const lineAmounts = (quantity, unitCost, taxRate) => {
  const amount = round2(Number(quantity) * Number(unitCost));
  return { amount, itbis: round2(amount * Number(taxRate || 0) / 100) };
};

export function orderTotals(items) {
  let subtotal = 0, itbis = 0;
  for (const i of items) {
    const l = lineAmounts(i.quantity, i.unitCost, i.taxRate);
    subtotal += l.amount;
    itbis += l.itbis;
  }
  subtotal = round2(subtotal); itbis = round2(itbis);
  return { subtotal, itbis, total: round2(subtotal + itbis) };
}

const round4 = (n) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
const CHARGE_KEYS = ['flete', 'seguro', 'aranceles', 'otros'];
const CHARGE_LABELS = { flete: 'el flete', seguro: 'el seguro', aranceles: 'los aranceles', otros: 'los otros gastos' };

export function validateCharges(charges) {
  for (const k of CHARGE_KEYS) {
    const v = charges?.[k];
    if (v === undefined || v === null || v === '') continue;
    if (!Number.isFinite(Number(v)) || Number(v) < 0) return `Revisa ${CHARGE_LABELS[k]}: debe ser un monto de 0 o más.`;
  }
  return null;
}

// Reparte los gastos (RD$) entre las líneas por valor (o por cantidad base si todo vale 0); la última absorbe el redondeo.
export function allocateCharges(lines, charges = {}) {
  const total = round2(CHARGE_KEYS.reduce((a, k) => a + (Number(charges?.[k]) || 0), 0));
  const value = lines.map((l) => Number(l.quantity) * Number(l.unitCost));
  const weights = value.some((v) => v > 0) ? value : lines.map((l) => Number(l.quantity) * (Number(l.factor) || 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = {};
  let given = 0;
  lines.forEach((l, i) => {
    const part = i === lines.length - 1 ? round2(total - given) : (sum > 0 ? round2(total * weights[i] / sum) : 0);
    given = round2(given + part);
    out[l.itemId] = part;
  });
  return out;
}

// Promedio ponderado; con existencia <= 0 el costo nuevo es el de la recepción.
export function averageCost(stock, currentCost, qBase, unitCostFinal) {
  const s = Math.max(Number(stock) || 0, 0), q = Number(qBase) || 0;
  if (s + q === 0) return round4(Number(currentCost) || 0);
  return round4((s * (Number(currentCost) || 0) + q * Number(unitCostFinal)) / (s + q));
}

const nameOf = (item, productsById) => item.productName || productsById?.[item.productId]?.name || 'el producto';

export function planReceipt(orderItems, receiptLines, productsById = {}, charges = {}) {
  const changes = [];
  const alloc = [];
  for (const line of receiptLines) {
    const quantity = Number(line.quantity);
    if (quantity === 0) continue;
    const item = orderItems.find((i) => i.id === line.itemId);
    if (!item) return { changes: [], error: 'Una línea no pertenece a esta orden.' };
    const name = nameOf(item, productsById);
    const qtyError = quantityError({ quantity, allowFractions: !!productsById[item.productId]?.allowFractions, hasPackaging: !!item.packagingId });
    if (qtyError) return { changes: [], error: `${name}: ${qtyError}` };
    const received = Number(item.receivedQuantity);
    if (quantity > roundQty(Number(item.quantity) - received)) return { changes: [], error: `No puedes recibir más de lo pendiente de "${name}".` };
    const factor = Number(item.packagingFactor ?? 1) || 1;
    alloc.push({ itemId: item.id, quantity, unitCost: Number(item.unitCost), factor });
    changes.push({
      itemId: item.id, productId: item.productId, quantity,
      baseQuantity: roundQty(quantity * factor),
      newReceived: roundQty(received + quantity),
      costPrice: 0, unitCostFinal: 0 // se completan abajo con el reparto de gastos
    });
  }
  if (!changes.length) return { changes, error: 'No hay nada que recibir.' };
  const parts = allocateCharges(alloc, charges);
  for (const c of changes) {
    const a = alloc.find((x) => x.itemId === c.itemId);
    c.unitCostFinal = c.baseQuantity > 0 ? round4(a.unitCost / a.factor + parts[c.itemId] / c.baseQuantity) : 0;
    c.costPrice = c.unitCostFinal;
  }
  return { changes, error: null };
}

export const nextStatus = (items) =>
  items.every((i) => Number(i.receivedQuantity) >= Number(i.quantity)) ? 'recibida' : 'parcial';

export function planInvoice(orderItems, lines) {
  let montoBienes = 0, itbisFacturado = 0;
  const updates = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (quantity === 0) continue;
    const item = orderItems.find((i) => i.id === line.itemId);
    if (!item) return { montoBienes: 0, itbisFacturado: 0, updates: [], error: 'Una línea no pertenece a esta orden.' };
    const invoiced = Number(item.invoicedQuantity);
    if (!(quantity > 0) || quantity > roundQty(Number(item.receivedQuantity) - invoiced)) {
      return { montoBienes: 0, itbisFacturado: 0, updates: [], error: `No puedes facturar más de lo recibido y no facturado de "${nameOf(item)}".` };
    }
    const l = lineAmounts(quantity, item.unitCost, item.taxRate);
    montoBienes += l.amount; itbisFacturado += l.itbis;
    updates.push({ itemId: item.id, newInvoiced: roundQty(invoiced + quantity) });
  }
  if (!updates.length) return { montoBienes: 0, itbisFacturado: 0, updates, error: 'No hay nada que facturar.' };
  return { montoBienes: round2(montoBienes), itbisFacturado: round2(itbisFacturado), updates, error: null };
}

// Resta de invoicedQuantity lo que facturó un gasto ({ itemId, quantity }[]); nunca baja de 0
export function undoInvoice(orderItems, lines) {
  const out = [];
  for (const l of lines) {
    const item = orderItems.find((i) => i.id === l.itemId);
    if (item) out.push({ itemId: item.id, newInvoiced: Math.max(0, roundQty(Number(item.invoicedQuantity) - Number(l.quantity))) });
  }
  return out;
}

export function purchaseSuggestions({ products, pendingByProduct = {}, lastPackagingByProduct = {} }) {
  const out = { bySupplier: {}, noSupplier: [], reviewByHand: [] };
  for (const p of products) {
    const min = Number(p.minStock || 0), stock = Number(p.stock || 0);
    if (p.status === 'inactive' || min <= 0 || stock > min) continue;
    if (p.hasVariants || p.variants?.length) { out.reviewByHand.push(p); continue; }
    const target = Number(p.maxStock) > 0 ? Number(p.maxStock) : 2 * min;
    const need = target - stock - Number(pendingByProduct[p.id] || 0);
    if (need <= 0) continue;
    const pk = lastPackagingByProduct[p.id];
    const factor = pk ? Number(pk.packagingFactor) || 1 : 1;
    const line = {
      productId: p.id,
      packagingId: pk?.packagingId ?? null,
      packagingName: pk?.packagingName ?? null,
      packagingFactor: factor,
      quantity: Math.ceil(roundQty(need / factor)),
      unitCost: round2(Number(p.costPrice || 0) * factor)
    };
    if (p.supplierId) (out.bySupplier[p.supplierId] ||= []).push(line);
    else out.noSupplier.push(line);
  }
  return out;
}

// Valida y normaliza las líneas de una orden. productsById: { id: { name, allowFractions, isTaxable, taxRate, status, hasVariants, packagings: [{id, name, factor, status}] } }
export function validateOrderLines(lines, productsById) {
  if (!Array.isArray(lines) || !lines.length) return { error: 'Agrega al menos un producto a la orden.' };
  const out = [];
  for (const l of lines) {
    const p = productsById[l.productId];
    if (!p || p.status !== 'active') return { error: 'Uno de los productos no existe o está inactivo.' };
    if (p.hasVariants) return { error: 'Las compras de productos con variantes se hacen a mano por ahora.' };
    const pack = l.packagingId ? p.packagings?.find((k) => k.id === l.packagingId && k.status === 'active') : null;
    if (l.packagingId && !pack) return { error: `El empaque de "${p.name}" no existe o está inactivo.` };
    const qErr = quantityError({ quantity: l.quantity, allowFractions: p.allowFractions, hasPackaging: !!pack });
    if (qErr) return { error: `${p.name}: ${qErr}` };
    const rawCost = Number(l.unitCost);
    if (!Number.isFinite(rawCost) || rawCost < 0) return { error: `${p.name}: el costo no puede ser negativo.` };
    const unitCost = round2(rawCost); // los totales se calculan sobre el costo que se guarda
    out.push({
      productId: l.productId,
      packagingId: pack ? pack.id : null,
      packagingName: pack ? pack.name : null,
      packagingFactor: pack ? Number(pack.factor) : 1,
      quantity: Number(l.quantity),
      unitCost,
      taxRate: p.isTaxable ? Number(p.taxRate) : 0
    });
  }
  return { lines: out, error: null };
}
