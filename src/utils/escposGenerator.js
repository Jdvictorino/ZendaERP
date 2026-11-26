import { formatCurrency } from './formatCurrency.js';
import { invoiceBalance } from './withholdings.js';
import { qrSvg } from './ecfPrint.js';
import { docLine, docTotals, qtyText, customerTaxId, invoiceTitle, isEcfDoc, lineDiscount, modificationInfo, baseSplit, termLines, LATE_NOTE_LEGEND } from './docLines.js';
import { round2 } from './tax.js';

// Montos de las líneas sin símbolo de moneda (caben en 80 mm); el símbolo va en el total
const amountText = (n) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const row = (label, value, cls = '') => `<div class="flex ${cls}"><span>${label}</span><span>${value}</span></div>`;

// Ticket de 80 mm con el orden de la Representación Impresa del e-CF (Informe Técnico e-CF v1.0, sección 18):
// emisor; comprobante, e-NCF, vencimiento y fecha; cliente; detalle; totales; QR, código de seguridad y firma digital.
// Para un e-CF, pasar docData por withEcfPrintData (ecfPrint.js) antes: así el ticket lleva QR y código de seguridad.
export const generateThermalReceiptHTML = (docData, docType, companyProfile, customerDetails, emitterInfo) => {
    const ecf = docData?.ecfData;
    const currency = companyProfile?.currency || 'USD';

    // Emisor
    const address = companyProfile?.address;
    const addressLine = typeof address === 'string' ? address : [address?.street, address?.sector, address?.city, address?.province].filter(Boolean).join(', ');
    const emitterHtml = [
        companyProfile?.name ? `<div class="center bold text-lg">${esc(companyProfile.name.toUpperCase())}</div>` : '',
        companyProfile?.rnc ? `<div class="center">RNC ${esc(companyProfile.rnc)}</div>` : '',
        addressLine ? `<div class="center">${esc(addressLine)}</div>` : '',
        companyProfile?.phone ? `<div class="center">Tel. ${esc(companyProfile.phone)}</div>` : '',
    ].join('');

    // Comprobante
    let docTitle = 'COTIZACIÓN';
    let docNumber = docData?.orderNumber;
    let numberLabel = 'No.';
    switch (docType) {
        case 'invoice':
            docTitle = invoiceTitle(docData).toUpperCase();
            if (docData?.ncfType === 'NoFiscal' || docData?.ncfNumber === 'NoFiscal' || !(docData?.ncfNumber || docData?.ncf)) {
                docNumber = docData?.invoiceNumber || docData?.orderNumber;
            } else {
                docNumber = docData?.ncfNumber || docData?.ncf?.number || docData?.ncf;
                numberLabel = 'NCF';
            }
            break;
        case 'credit-note':
            docTitle = isEcfDoc(docData) ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'NOTA DE CRÉDITO';
            docNumber = docData?.ncfNumber || docData?.ncf || docData?.creditNoteNumber;
            numberLabel = 'NCF';
            break;
        case 'debit-note':
            docTitle = isEcfDoc(docData) ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'NOTA DE DÉBITO';
            docNumber = docData?.ncfNumber || docData?.ncf || docData?.debitNoteNumber;
            numberLabel = 'NCF';
            break;
        default:
            break;
    }
    if (ecf?.eNcf) docNumber = ecf.eNcf;
    if (numberLabel === 'NCF' && String(docNumber || '').startsWith('E')) numberLabel = 'e-NCF';

    const printed = new Date(docData?.billedDate || docData?.date);
    const dateStr = (Number.isNaN(printed.getTime()) ? new Date() : printed).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
    const expires = docType === 'invoice'
        ? (docData?.ncfExpiresAt ? String(docData.ncfExpiresAt).slice(0, 10).split('-').reverse().join('/') : ecf?.sequenceExpiresAt?.replace(/-/g, '/'))
        : null;
    const modification = modificationInfo(docType, docData);
    const docHtml = [
        `<div class="center bold">${docTitle}</div>`,
        `<div class="center">${numberLabel} ${esc(docNumber || '—')}</div>`,
        expires ? `<div class="center">Válido hasta ${expires}</div>` : '',
        modification?.ncf ? `<div class="center">${String(modification.ncf).startsWith('E') ? 'e-NCF' : 'NCF'} modificado ${esc(modification.ncf)}</div>` : '',
        modification ? `<div class="center">${modification.label}</div>` : '',
        `<div class="center">Fecha ${dateStr}</div>`,
        docType === 'invoice' && docData?.orderNumber && docData.orderNumber !== docNumber ? `<div class="center">Orden ${esc(docData.orderNumber)}</div>` : '',
    ].join('');

    // Cliente: la factura de consumo sin cliente no lo lleva (DGII)
    const rawName = customerDetails?.name || docData?.customerName;
    const customerName = rawName && !/^consumidor final$/i.test(rawName) ? rawName : null;
    const customerId = customerTaxId(customerDetails, docData);
    const customerPhone = customerDetails?.phone || docData?.customerPhone;
    const customerHtml = customerName || customerId ? `
        <div class="sep"></div>
        ${customerName ? `<div>Cliente: ${esc(customerName)}</div>` : ''}
        ${customerId ? `<div>RNC/Céd.: ${esc(customerId)}</div>` : ''}
        ${customerPhone ? `<div>Tel.: ${esc(customerPhone)}</div>` : ''}` : '';

    // Detalle y totales
    let bodyHtml = '';
    if (docType === 'credit-note' || docType === 'debit-note') {
        bodyHtml += `<div>Motivo: ${esc(docData?.reason || '—')}</div>`;
        bodyHtml += `<div class="sep"></div>${row('MONTO', formatCurrency(docData?.amount || 0, currency), 'bold text-lg')}`;
        if (docType === 'credit-note' && docData?.lateNote) bodyHtml += `<div class="center">${LATE_NOTE_LEGEND}</div>`;
    } else {
        const words = isEcfDoc(docData);
        const lines = (docData?.items || []).map((item) => {
            const name = String(item.name || item.productName || item.product?.name || 'Artículo');
            const { unit, amount } = docLine(item, docData?.pricesIncludeTax);
            const rate = Number(item.taxRate) || 0;
            const itbis = round2(amount * rate / 100);
            const discount = lineDiscount(item, docData?.pricesIncludeTax);
            // Formato de recibo: descripción y valor; debajo, cantidad × precio, ITBIS y descuento de la línea
            const detail = [`<span class="qty">${qtyText(item, { words })}</span> x ${amountText(unit)}`, itbis > 0 ? `ITBIS ${amountText(itbis)}` : '', discount > 0 ? `Desc. -${amountText(discount)}` : ''].filter(Boolean).join(' · ');
            return `
                <tr>
                    <td class="desc">${rate === 0 ? '<b>E</b> ' : ''}${esc(name)}</td>
                    <td class="right nowrap">${amountText(amount)}</td>
                </tr>
                <tr class="detail"><td colspan="2">${detail}</td></tr>`;
        }).join('');
        bodyHtml += `
            <table>
                <thead><tr class="head"><th>DESCRIPCIÓN</th><th class="right">VALOR</th></tr></thead>
                <tbody>${lines}</tbody>
            </table>`;

        const coupon = docTotals(docData);
        const split = baseSplit(docData);
        const tax = docData?.taxAmount ?? docData?.itbis ?? 0;
        const total = docData?.total || 0;
        bodyHtml += '<div class="sep"></div>';
        if (coupon) {
            bodyHtml += row('Subtotal', amountText(coupon.subtotal));
            bodyHtml += row('Descuento', `-${amountText(coupon.discount)}`);
        } else {
            if (split.gravado > 0 || !split.exento) bodyHtml += row('Subtotal gravado', amountText(split.gravado));
            if (split.exento > 0) bodyHtml += row('Subtotal exento', amountText(split.exento));
        }
        bodyHtml += row('ITBIS', amountText(tax));
        bodyHtml += row('TOTAL', formatCurrency(total, currency), 'bold total');
        termLines(docData).forEach((line) => { bodyHtml += `<div>${esc(line)}</div>`; });
        if (docData?.exemptionNumber) bodyHtml += `<div>Exento de ITBIS — Carnet N.º ${esc(docData.exemptionNumber)}</div>`;

        const paid = docData?.amountPaid ?? docData?.paidAmount ?? 0;
        if (paid > 0) {
            bodyHtml += '<div class="sep"></div>';
            bodyHtml += row('Pagado', amountText(paid));
            const balance = invoiceBalance({ ...docData, total, amountPaid: paid });
            if (balance > 0) bodyHtml += row('Pendiente', amountText(balance));
            else if (docData?.changeAmount > 0) bodyHtml += row('Cambio', amountText(docData.changeAmount));
        }
    }

    // Consulta del e-CF: QR (≥ 22 mm), código de seguridad y fecha de firma digital
    const ecfHtml = ecf?.qrCodeUrl ? `
        <div class="sep"></div>
        <div class="center qr">${qrSvg(ecf.qrCodeUrl)}</div>
        <div class="center">Código de seguridad: ${esc(ecf.securityCode || '')}</div>
        ${ecf.signedAt ? `<div class="center">Fecha de firma digital: ${esc(ecf.signedAt)}</div>` : ''}` : '';

    // Quien atendió: nombre y número de empleado (nunca el id interno)
    const sellerName = emitterInfo?.fullName || [emitterInfo?.firstName, emitterInfo?.lastName].filter(Boolean).join(' ') || emitterInfo?.name || docData?.user?.firstName || '';
    const sellerHtml = sellerName ? `<div class="center">Atendido por: ${esc(sellerName)}${emitterInfo?.employeeId ? ` · Emp. ${esc(emitterInfo.employeeId)}` : ''}</div>` : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            /* Rollo de 80 mm: el área imprimible es de 72 mm; más ancho se corta a la derecha */
            @page { margin: 0; }
            * { box-sizing: border-box; }
            body {
                font-family: 'Courier New', Courier, monospace;
                width: 72mm;
                margin: 0;
                padding: 2mm 1mm 0;
                font-size: 12px;
                line-height: 1.3;
                color: #000;
                background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .nowrap { white-space: nowrap; }
            .text-lg { font-size: 14px; }
            .total { font-size: 16px; margin-top: 2px; }
            .flex { display: flex; justify-content: space-between; gap: 8px; }
            .sep { border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; }
            th { font-weight: bold; text-align: left; border-bottom: 1px dashed #000; padding: 0 0 2px; }
            td { vertical-align: top; padding: 3px 0 0; }
            td.desc { padding-right: 6px; }
            tr.detail td { padding: 0 0 2px 10px; font-size: 11px; }
            .qty { white-space: nowrap; }
            .qr { margin: 4px 0; }
            .qr svg { width: 37mm; height: 37mm; }
        </style>
    </head>
    <body>
        ${emitterHtml}
        <div class="sep"></div>
        ${docHtml}
        ${customerHtml}
        <div class="sep"></div>
        ${bodyHtml}
        ${ecfHtml}
        <div class="sep"></div>
        ${sellerHtml}
        ${docData?.notes ? `<div class="center">Nota: ${esc(docData.notes)}</div>` : ''}
        <div class="center bold" style="margin-top: 6px;">Gracias por su compra</div>
        <div style="height: 10mm;"></div>
    </body>
    </html>
    `;
};
