import { netUnitPrice, round2 } from './tax.js';

// Precio unitario sin ITBIS e importe (base) de una línea de documento.
// Facturas guardadas (pricesIncludeTax es booleano): la base es item.subtotal. Carritos/pedidos: precio * cantidad.
export function docLine(item, pricesIncludeTax) {
    const qty = Number(item.quantity) || 0;
    const saved = typeof pricesIncludeTax === 'boolean';
    const unit = netUnitPrice({ unitPrice: Number(item.price ?? item.unitPrice) || 0, taxRate: Number(item.taxRate) || 0 }, pricesIncludeTax === true);
    const amount = saved && item.subtotal != null ? Number(item.subtotal) : round2(unit * qty);
    return { unit, amount };
}

// Montos impresos de una factura con cupón: subtotal y taxAmount se guardan ya rebajados (igual que el e-CF), así que
// Subtotal = suma de las líneas impresas y Descuento = la parte de la base que quitó el cupón; Subtotal − Descuento + ITBIS = Total.
// Sin cupón: null (cada documento usa lo suyo). Sin líneas guardadas: base de antes del cupón sacada del total.
export function docTotals(doc) {
    const discountAmount = Number(doc?.discountAmount) || 0;
    if (!(discountAmount > 0)) return null;
    const itbis = Number(doc.taxAmount ?? doc.itbis ?? 0);
    const total = Number(doc.total) || 0;
    const items = Array.isArray(doc.items) ? doc.items : [];
    if (!items.length || items.some((i) => i.subtotal == null)) {
        return { subtotal: round2(total - itbis + discountAmount), discount: discountAmount, itbis, total };
    }
    const subtotal = round2(items.reduce((sum, i) => sum + round2(Number(i.subtotal)), 0));
    return { subtotal, discount: round2(subtotal - Number(doc.subtotal)), itbis, total };
}
