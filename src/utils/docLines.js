import { netUnitPrice, round2 } from './tax.js';
import { formatQty, unitOf } from './units.js';
import { ECF_TYPE_MAP } from './ecfConstants.js';

// Cédula/RNC/pasaporte del cliente: la copia guardada al facturar o la del cliente. Nunca el id interno.
export function customerTaxId(customerDetails, docData) {
    return docData?.customerRnc || customerDetails?.rnc || customerDetails?.identificationNumber || null;
}

const NCF_TITLES = { B01: 'Factura de Crédito Fiscal', B02: 'Factura de Consumo', B14: 'Factura de Régimen Especial', B15: 'Factura Gubernamental' };

// Denominación del comprobante (Norma General 06-2018, art. 7)
export function invoiceTitle(docData) {
    const number = docData?.ecfData?.eNcf || docData?.ncf?.number || docData?.ncfNumber || docData?.ncfType || '';
    const code = String(number).slice(0, 3);
    return ECF_TYPE_MAP[code]?.name || NCF_TITLES[code] || 'Factura';
}

// La columna Notas solo tiene uso en modo Tienda con "Personalizar productos" activo (activo por defecto)
export function showNotesColumn(companyProfile) {
    const mode = companyProfile?.orderMode || companyProfile?.settings?.orderMode;
    return mode !== 'distributor' && companyProfile?.allowCustomization !== false;
}

// Cantidad impresa: número + unidad base ("1.5 lb", "3 ud."). Con empaque solo el número: la descripción ya dice "Saco de 100 lb".
// Líneas viejas sin producto ni empaque: solo el número, como siempre.
export function qtyText(item) {
    const q = Number(item.quantity) || 0;
    if (item.packagingName || !item.product?.unit) return formatQty(q);
    return formatQty(q, unitOf(item.product.unit).abbr);
}

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
