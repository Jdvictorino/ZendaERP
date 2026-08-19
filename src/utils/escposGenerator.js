import { formatCurrency } from './formatCurrency.js';

export const generateThermalReceiptHTML = (docData, docType, companyProfile, customerDetails, emitterInfo) => {
    // Header
    const companyName = companyProfile?.name ? `<div class="center bold text-lg">${companyProfile.name.toUpperCase()}</div>` : '';
    const rnc = companyProfile?.rnc ? `<div class="center">RNC: ${companyProfile.rnc}</div>` : '';
    const phone = companyProfile?.phone ? `<div class="center">Tel: ${companyProfile.phone}</div>` : '';
    
    let addressHtml = '';
    if (companyProfile?.address) {
        const { street, city, sector } = companyProfile.address;
        const addressLine = [street, sector, city].filter(Boolean).join(', ');
        if (addressLine) {
            addressHtml = `<div class="center">${addressLine}</div>`;
        } else if (typeof companyProfile.address === 'string') {
            addressHtml = `<div class="center">${companyProfile.address}</div>`;
        }
    }

    let docTitle = 'COTIZACION';
    let docNumber = docData?.orderNumber;
    let numberLabel = 'No:';

    switch (docType) {
        case 'invoice':
            if (docData?.ncfType === 'NoFiscal' || docData?.ncfNumber === 'NoFiscal') {
                docTitle = 'FACTURA (CONSUMO)';
                docNumber = docData?.invoiceNumber || docData?.orderNumber;
            } else {
                docTitle = 'FACTURA CON COMPROBANTE';
                docNumber = docData?.ncfNumber || docData?.ncf?.number || docData?.ncf || docData?.invoiceNumber;
                numberLabel = 'NCF:';
            }
            break;
        case 'credit-note':
            docTitle = 'NOTA DE CREDITO';
            docNumber = docData?.ncfNumber || docData?.ncf || docData?.creditNoteNumber;
            numberLabel = 'NCF:';
            break;
        case 'debit-note':
            docTitle = 'NOTA DE DEBITO';
            docNumber = docData?.ncfNumber || docData?.ncf || docData?.debitNoteNumber;
            numberLabel = 'NCF:';
            break;
    }

    const dateToPrint = new Date(docData?.billedDate || docData?.date);
    const dateStr = !isNaN(dateToPrint.getTime()) ? dateToPrint.toLocaleString('es-DO') : new Date().toLocaleString('es-DO');

    const customerName = customerDetails?.name || docData?.customerName || 'Consumidor Final';
    const customerId = customerDetails?.identificationNumber || docData?.customerRnc || docData?.customerId;
    const customerPhone = customerDetails?.phone || docData?.customerPhone;

    let itemsHtml = '';
    const currency = companyProfile?.currency || 'USD';

    if (docType === 'credit-note' || docType === 'debit-note') {
        itemsHtml += `<div>Motivo: ${docData?.reason || 'N/A'}</div>`;
        itemsHtml += `<div class="border-t my-1 flex bold pt-1"><span>MONTO:</span><span>${formatCurrency(docData?.amount || 0, currency)}</span></div>`;
    } else {
        itemsHtml += `
            <table class="w-full mt-2 text-sm">
                <thead>
                    <tr class="border-b border-dashed">
                        <th class="text-left w-6">CANT</th>
                        <th class="text-left" style="padding-left: 4px;">DESCRIPCION</th>
                        <th class="text-right">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
        `;
        (docData?.items || []).forEach(item => {
            const itemName = String(item.name || item.productName || item.product?.name || 'Item');
            const qty = item.quantity || 1;
            const itemPrice = item.price ?? item.unitPrice ?? 0;
            const itemTotal = itemPrice * qty;
            itemsHtml += `
                <tr>
                    <td>${qty}</td>
                    <td style="padding-left: 4px;">${itemName}</td>
                    <td class="text-right">${formatCurrency(itemTotal, currency)}</td>
                </tr>
            `;
        });
        itemsHtml += `</tbody></table>`;

        const taxableAmount = docData?.subtotal || 0;
        const exemptAmount = docData?.montoExento || 0;
        const subtotal = taxableAmount + exemptAmount;
        const tax = docData?.taxAmount || docData?.itbis || 0;
        const discount = docData?.discountAmount || 0;
        const total = docData?.total || 0;

        itemsHtml += `<div class="border-t border-dashed mt-2 pt-1 text-sm">`;
        if (discount > 0) {
            itemsHtml += `<div class="flex"><span>SUBTOTAL:</span><span>${formatCurrency(subtotal, currency)}</span></div>`;
            itemsHtml += `<div class="flex"><span>DESCUENTO:</span><span>-${formatCurrency(discount, currency)}</span></div>`;
        } else {
            itemsHtml += `<div class="flex"><span>SUBTOTAL:</span><span>${formatCurrency(subtotal, currency)}</span></div>`;
        }
        itemsHtml += `<div class="flex"><span>ITBIS:</span><span>${formatCurrency(tax, currency)}</span></div>`;
        itemsHtml += `<div class="flex text-lg mt-1 bold"><span>TOTAL:</span><span>${formatCurrency(total, currency)}</span></div>`;
        itemsHtml += `</div>`;

        const paidAmount = docData?.amountPaid ?? docData?.paidAmount ?? 0;
        if (paidAmount > 0) {
             itemsHtml += `<div class="border-t border-dashed mt-2 pt-1 text-sm">`;
             itemsHtml += `<div class="flex"><span>PAGADO:</span><span>${formatCurrency(paidAmount, currency)}</span></div>`;
             const balance = Math.max(0, total - paidAmount);
             if (balance > 0) {
                 itemsHtml += `<div class="flex"><span>PENDIENTE:</span><span>${formatCurrency(balance, currency)}</span></div>`;
             } else if (docData?.changeAmount > 0) {
                 itemsHtml += `<div class="flex"><span>CAMBIO:</span><span>${formatCurrency(docData.changeAmount, currency)}</span></div>`;
             }
             itemsHtml += `</div>`;
        }
    }

    const seller = emitterInfo?.firstName || emitterInfo?.fullName || emitterInfo?.name || docData?.user?.firstName || 'Cajero';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @page { margin: 0; size: 80mm auto; }
            body {
                font-family: 'Courier New', Courier, monospace;
                width: 76mm;
                margin: 0 auto;
                padding: 2mm 2mm;
                font-size: 12px;
                line-height: 1.25;
                color: #000;
            }
            .center { text-align: center; }
            .left { text-align: left; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .text-lg { font-size: 14px; }
            .flex { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; vertical-align: top; padding: 2px 0; }
            .text-right { text-align: right; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .border-dashed { border-style: dashed !important; border-width: 1px; border-color: #000; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mb-2 { margin-bottom: 8px; }
            .pt-1 { padding-top: 4px; }
            .my-1 { margin-top: 4px; margin-bottom: 4px; }
            .w-full { width: 100%; }
            .w-6 { width: 24px; }
        </style>
    </head>
    <body onload="window.print(); window.setTimeout(window.close, 100);">
        ${companyName}
        ${rnc}
        ${phone}
        ${addressHtml}
        
        <div class="border-t border-dashed mt-2 mb-2"></div>
        
        <div class="center bold text-lg">${docTitle}</div>
        <div class="center">${numberLabel} ${docNumber || 'N/A'}</div>
        <div class="center">Fecha: ${dateStr}</div>
        ${docType === 'invoice' && docData?.orderNumber && docData?.orderNumber !== docNumber ? `<div class="center">Orden: ${docData.orderNumber}</div>` : ''}
        
        <div class="border-t border-dashed mt-2 mb-2"></div>
        
        <div class="left">Cliente: ${customerName}</div>
        ${customerId && customerName !== 'Consumidor Final' ? `<div class="left">RNC/Ced: ${customerId}</div>` : ''}
        ${customerPhone ? `<div class="left">Tel: ${customerPhone}</div>` : ''}
        
        <div class="border-t border-dashed mt-2 mb-2"></div>
        
        ${itemsHtml}
        
        <div class="border-t border-dashed mt-2 mb-2"></div>
        
        <div class="center mt-2">Le atendió: ${seller}</div>
        ${docData?.notes ? `<div class="center mt-1">Nota: ${docData.notes}</div>` : ''}
        <div class="center bold mt-2 mb-2">*** GRACIAS POR SU COMPRA ***</div>
        
        <div style="height: 10mm;"></div>
    </body>
    </html>
    `;
};
