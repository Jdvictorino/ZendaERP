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
