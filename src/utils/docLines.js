import { netUnitPrice, round2 } from './tax.js';
import { formatQty, unitOf } from './units.js';
import { ECF_TYPE_MAP } from './ecfConstants.js';
import { installmentsOf } from './paymentTerms.js';

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

// "libra" → "libras", "unidad" → "unidades", "galón" → "galones"
const pluralUnit = (word) => (/[aeiou]$/.test(word) ? `${word}s` : word.endsWith('ón') ? `${word.slice(0, -2)}ones` : `${word}es`);

// Cantidad impresa: número + unidad base ("1.5 lb", "3 ud."). Con empaque solo el número: la descripción ya dice "Saco de 100 lb".
// Líneas viejas sin producto ni empaque: solo el número, como siempre.
// words: en la representación impresa del e-CF la DGII pide la unidad en palabras ("1.5 libras").
export function qtyText(item, { words = false } = {}) {
    const q = Number(item.quantity) || 0;
    if (item.packagingName || !item.product?.unit) return formatQty(q);
    if (!words) return formatQty(q, unitOf(item.product.unit).abbr);
    const label = unitOf(item.product.unit).label.toLowerCase();
    return formatQty(q, q === 1 ? label : pluralUnit(label));
}

// ¿Comprobante fiscal electrónico? (e-NCF empieza por E)
export function isEcfDoc(docData) {
    return /^E\d{2}/.test(docData?.ecfData?.eNcf || docData?.ncfNumber || '');
}

// Monto descontado en la línea (Monto Descuento del e-CF); 0 si la línea no tiene descuento
export function lineDiscount(item, pricesIncludeTax) {
    if (!(Number(item.discountPercent) > 0)) return 0;
    const { unit, amount } = docLine(item, pricesIncludeTax);
    return Math.max(0, round2(unit * (Number(item.quantity) || 0) - amount));
}

const MODIFICATION_CODES = {
    1: 'Anula el NCF modificado',
    2: 'Corrige texto del comprobante fiscal modificado',
    3: 'Corrige montos del NCF modificado',
    4: 'Reemplazo NCF emitido en contingencia',
};

// Notas de crédito/débito: comprobante modificado y código de modificación en palabras (sección 18.2.1 del Informe Técnico e-CF).
// Del XML firmado si es e-CF; en papel, como lo decide el servidor (anulación total = 1, el resto = 3).
export function modificationInfo(docType, docData) {
    if (docType !== 'credit-note' && docType !== 'debit-note') return null;
    const annuls = docType === 'credit-note' && /^Anulación de Factura/.test(docData?.noteType || docData?.reason || '');
    const code = docData?.ecfData?.modificationCode || (annuls ? '1' : '3');
    return {
        ncf: docData?.ecfData?.modifiedNcf || docData?.originalNcf || null,
        label: MODIFICATION_CODES[code] || MODIFICATION_CODES[3],
    };
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

// Subtotal gravado y exento (DGII: "Subtotal Gravado" / "Subtotal Exento"). Con líneas guardadas se separan por la tasa
// de cada línea; sin ellas, lo que traiga el documento (comprobantes de compra) o todo como gravado.
export function baseSplit(doc) {
    const items = Array.isArray(doc?.items) ? doc.items : [];
    if (doc?.montoGravado != null || !items.length || items.some((i) => i.subtotal == null)) {
        return { gravado: Number(doc?.montoGravado ?? doc?.subtotal) || 0, exento: Number(doc?.montoExento) || 0 };
    }
    const sum = (list) => round2(list.reduce((s, i) => s + round2(Number(i.subtotal)), 0));
    return { gravado: sum(items.filter((i) => Number(i.taxRate) > 0)), exento: sum(items.filter((i) => !(Number(i.taxRate) > 0))) };
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

// 'YYYY-MM-DD…' → 'dd/MM/yyyy' sin pasar por Date (el día no se corre por la zona horaria)
const dmy = (iso, sep = '/') => String(iso).slice(0, 10).split('-').reverse().join(sep);

// Condición de pago impresa (factura y ticket). Contado o factura vieja sin plazo guardado: [].
export function termLines(invoice) {
    const t = invoice?.paymentTerm;
    if (!t?.schedule?.length) return [];
    const list = installmentsOf(invoice, '');
    const lines = [`Condición: ${t.name}`];
    if (list.length === 1) lines.push(`Vence: ${dmy(list[0].dueDate)}`);
    else list.forEach((c, i) => lines.push(`Cuota ${i + 1}: ${dmy(c.dueDate)} — RD$ ${c.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`));
    const sale = new Date(`${String(t.saleDate).slice(0, 10)}T12:00:00Z`); // UTC: el día no se corre
    if (t.discount && !Number.isNaN(sale.getTime())) {
        sale.setUTCDate(sale.getUTCDate() + Number(t.discount.days));
        lines.push(`${t.discount.percent} % de descuento si paga todo antes del ${dmy(sale.toISOString())}`);
    }
    return lines;
}
