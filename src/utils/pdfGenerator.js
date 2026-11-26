import { formatCurrency } from './formatCurrency.js';
import toast from 'react-hot-toast';
import { loadScript } from './loadScript.js';
import { withEcfPrintData, qrModules } from './ecfPrint.js';
import { docLine, docTotals, qtyText, customerTaxId, invoiceTitle, showNotesColumn, isEcfDoc, lineDiscount, modificationInfo, baseSplit, termLines } from './docLines.js';
import { round2 } from './tax.js';

let pdfLibrariesPromise = null;

const ensurePdfLibraries = async () => {
    if (!pdfLibrariesPromise) {
        pdfLibrariesPromise = (async () => {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        })();
    }
    return pdfLibrariesPromise;
};

const formatDate = (dateObject) => {
    if (!dateObject) return 'N/A';
    // Firebase Timestamp
    if (dateObject.seconds) {
        return new Date(dateObject.seconds * 1000).toLocaleDateString('es-DO');
    }
    // Date object
    if (dateObject instanceof Date) {
        return dateObject.toLocaleDateString('es-DO');
    }
    // Fecha sin hora (guardada como medianoche UTC): en RD (UTC-4) saldría con el día anterior
    if (typeof dateObject === 'string' && /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z)?$/.test(dateObject)) {
        return dateObject.slice(0, 10).split('-').reverse().join('/');
    }
    // ISO string (PostgreSQL/Prisma)
    if (typeof dateObject === 'string') {
        const parsed = new Date(dateObject);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('es-DO');
        }
    }
    return 'Fecha inválida';
};

const DEFAULT_THEME = {
    primary: [24, 43, 73],
    accent: [60, 130, 246],
    textPrimary: [30, 41, 59],
    textSecondary: [100, 116, 139],
    subtleBg: [241, 245, 249],
    cardBg: [248, 250, 252],
    tableAltRow: [234, 238, 243],
    border: [223, 230, 238],
};

const hexToRgb = (value) => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.replace('#', '');
    if (normalized.length !== 6) return null;
    const bigint = parseInt(normalized, 16);
    return [
        (bigint >> 16) & 255,
        (bigint >> 8) & 255,
        bigint & 255,
    ];
};

const clampColor = (channel) => Math.min(255, Math.max(0, Math.round(channel)));

const lightenColor = (rgb, amount = 0.2) => {
    if (!rgb) return null;
    return rgb.map((channel) => clampColor(channel + (255 - channel) * amount));
};

const resolveTheme = (companyProfile = {}) => {
    const brandColor = hexToRgb(companyProfile.brandColor) || hexToRgb(companyProfile.primaryColor);
    const accentColor = hexToRgb(companyProfile.accentColor);

    if (!brandColor && !accentColor) {
        return DEFAULT_THEME;
    }

    const primary = brandColor || DEFAULT_THEME.primary;
    const accent = accentColor || lightenColor(primary, 0.3) || DEFAULT_THEME.accent;

    return {
        primary,
        accent,
        textPrimary: DEFAULT_THEME.textPrimary,
        textSecondary: DEFAULT_THEME.textSecondary,
        subtleBg: DEFAULT_THEME.subtleBg,
        cardBg: DEFAULT_THEME.cardBg,
        tableAltRow: DEFAULT_THEME.tableAltRow,
        border: DEFAULT_THEME.border,
    };
};

const setBodyTextColor = (doc, theme) => {
    doc.setTextColor(...(theme.textPrimary || DEFAULT_THEME.textPrimary));
};

const drawDocumentHeader = (doc, theme, { companyProfile = {}, docTitle, numberLabel, docNumber, documentDate, validUntil, modification }) => {
    // Encabezado blanco: texto oscuro sobre el papel y una línea fina debajo (sin banda de color)
    const rightLines = [
        validUntil ? `Válido hasta: ${String(validUntil).slice(0, 10).split('-').reverse().join('/')}` : '',
        modification?.ncf ? `${String(modification.ncf).startsWith('E') ? 'e-NCF' : 'NCF'} modificado: ${modification.ncf}` : '',
        modification ? modification.label : '',
    ].filter(Boolean);
    const headerHeight = Math.max(48, 38 + rightLines.length * 6);
    const ink = theme.textPrimary || DEFAULT_THEME.textPrimary;
    const muted = theme.textSecondary || DEFAULT_THEME.textSecondary;

    const hasLogo = Boolean(companyProfile.logo);
    if (hasLogo) {
        try {
            doc.addImage(companyProfile.logo, 'PNG', 18, 10, 28, 28);
        } catch (error) {
            console.error('Error adding logo to PDF header:', error);
        }
    }

    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(companyProfile.name || 'Nombre de la Empresa', hasLogo ? 52 : 18, 20);

    const contactLines = [];
    const addWrappedLine = (text) => {
        if (!text) return;
        const wrapped = doc.splitTextToSize(text, hasLogo ? 120 : 150);
        contactLines.push(...wrapped);
    };

    if (companyProfile.rnc) {
        addWrappedLine(`RNC: ${companyProfile.rnc}`);
    }
    const { street, sector, city, province, zipCode, country } = companyProfile.address || {};
    // DGII: dirección, municipio y provincia del emisor
    const addressParts = [street, sector, city, province, zipCode, country].filter(Boolean).join(', ');
    addWrappedLine(addressParts);

    const contactParts = [companyProfile.phone, companyProfile.email].filter(Boolean).join(' | ');
    addWrappedLine(contactParts);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    if (contactLines.length) {
        doc.text(contactLines, hasLogo ? 52 : 18, 28, { lineHeightFactor: 1.4 });
    }

    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(docTitle || 'Documento', 196, 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (numberLabel) {
        doc.text(`${numberLabel} ${docNumber || 'N/A'}`, 196, 26, { align: 'right' });
    }
    doc.text(`Fecha: ${formatDate(documentDate)}`, 196, 32, { align: 'right' });
    // Norma General 06-2018: vencimiento de la secuencia. Notas: comprobante modificado y código de modificación en palabras.
    rightLines.forEach((line, i) => doc.text(line, 196, 38 + i * 6, { align: 'right' }));

    setBodyTextColor(doc, theme);
    doc.setDrawColor(...ink);
    doc.setLineWidth(0.5);
    doc.line(14, headerHeight, 196, headerHeight);

    return headerHeight + 6;
};

// Datos del cliente como pide la DGII: RNC/Cédula y nombre o razón social; el resto solo si existe
const buildCustomerLines = (doc, customerDetails, docData, width) => {
    const taxId = customerTaxId(customerDetails, docData);
    const phone = customerDetails?.phone || docData?.customerPhone;
    const email = customerDetails?.email || docData?.customerEmail;
    const rawAddress = customerDetails?.address || docData?.customerAddress;
    const address = rawAddress && typeof rawAddress === 'object' ? Object.values(rawAddress).filter(Boolean).join(', ') : rawAddress;
    const lines = [
        taxId ? `RNC/Cédula: ${taxId}` : '',
        `Nombre o razón social: ${customerDetails?.name || docData?.customerName || 'Consumidor final'}`,
        phone ? `Tel.: ${phone}` : '',
        email ? `Correo: ${email}` : '',
        address ? `Dirección: ${address}` : '',
    ].filter(Boolean);

    return doc.splitTextToSize(lines, width);
};

const buildEmitterLines = (doc, emitterInfo) => {
    if (!emitterInfo) {
        return [''];
    }

    // Compatibilidad Firebase y PostgreSQL
    const fullName = emitterInfo.fullName || 
        (emitterInfo.firstName && emitterInfo.lastName ? `${emitterInfo.firstName} ${emitterInfo.lastName}` : '') ||
        emitterInfo.name || '';
    // emitterInfo.id es el id interno del usuario: no se imprime
    const lines = [
        fullName,
        emitterInfo.employeeId ? `Empleado N.º ${emitterInfo.employeeId}` : '',
    ].filter(Boolean);

    return doc.splitTextToSize(lines.length ? lines : [''], 48);
};

// Cliente a la izquierda (parte inferior del encabezado, art. 7 Norma 06-2018); "Atendido por" pequeño a la derecha
const drawInfoCards = (doc, theme, { customerDetails, docData, emitterInfo, startY, leftTitle = 'Cliente' }) => {
    const cardPadding = 6;
    const cardWidth = 128;
    const emitterX = 148;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const customerLines = buildCustomerLines(doc, customerDetails, docData, cardWidth - cardPadding * 2);
    doc.setFontSize(8);
    const emitterLines = emitterInfo ? buildEmitterLines(doc, emitterInfo) : [];

    const cardHeight = Math.max(24, customerLines.length * 5 + cardPadding * 2 + 6);

    doc.setFillColor(...(theme.cardBg || DEFAULT_THEME.cardBg));
    doc.roundedRect(14, startY, cardWidth, cardHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(leftTitle, 14 + cardPadding, startY + cardPadding + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(customerLines, 14 + cardPadding, startY + cardPadding + 9, { lineHeightFactor: 1.4 });

    if (emitterLines.length && emitterLines[0]) {
        doc.setTextColor(...(theme.textSecondary || DEFAULT_THEME.textSecondary));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Atendido por', emitterX, startY + cardPadding + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(emitterLines, emitterX, startY + cardPadding + 7, { lineHeightFactor: 1.4 });
        setBodyTextColor(doc, theme);
    }

    return startY + cardHeight + 8;
};

const drawModificationSummary = (doc, theme, { startY, docType, docData, currency }) => {
    const title = `Detalles de la Nota de ${docType === 'credit-note' ? 'Crédito' : 'Débito'}`;
    const detailsLines = [
        `Tipo: ${docData.noteType || 'N/A'}`,
        `Factura original afectada: ${docData.originalInvoiceNumber || 'N/A'}`,
        `Monto: ${formatCurrency(docData.amount || 0, currency)}`,
        `Motivo: ${docData.reason || 'N/A'}`,
    ];

    const content = doc.splitTextToSize(detailsLines, 174);
    const blockHeight = content.length * 5 + 24;

    doc.setFillColor(...(lightenColor(theme.accent || DEFAULT_THEME.accent, 0.6)));
    doc.roundedRect(14, startY, 182, blockHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, 20, startY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(content, 20, startY + 20, { lineHeightFactor: 1.5 });

    return startY + blockHeight + 8;
};

const resolveSku = (item) => {
    const isValid = (value) => typeof value === 'string' && value.trim().length > 0;
    const candidates = [
        item?.sku,
        item?.productSku,
        item?.variantSku,
        item?.variantInfo?.sku,
        item?.code,
        item?.productCode,
        item?.ean,
        item?.product?.sku,
        item?.product?.code,
        item?.source?.variant?.sku,
        item?.source?.variant?.code,
        item?.source?.product?.sku,
        item?.source?.product?.code,
    ];
    const match = candidates.find(isValid);
    return match ? String(match).trim() : '-';
};

const drawItemsTable = (doc, theme, { items = [], currency, startY, pricesIncludeTax, withNotes, unitWords, topMargin = 20, bottomReserve = 20, onNewPage, rowPages = [] }) => {
    if (!items.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('No se registraron productos o servicios en este documento.', 14, startY + 4);
        return startY + 16;
    }

    // Modelo DGII (Informe Técnico e-CF, 18.2.2): Cant. | [E] Descripción | Precio | [Desc.] | ITBIS | Valor.
    // "E" a la izquierda de los exentos; el código va debajo de la descripción, en pequeño.
    const skus = items.map((item) => { const sku = resolveSku(item); return sku === '-' ? null : sku; });
    const discounts = items.map((item) => lineDiscount(item, pricesIncludeTax));
    const withDiscount = discounts.some((d) => d > 0);
    const tableRows = items.map((item, i) => {
        // Compatibilidad con estructura Firebase y PostgreSQL
        const name = item.name || item.productName || item.product?.name || '-';
        const { unit: price, amount } = docLine(item, pricesIncludeTax);
        const rate = Number(item.taxRate) || 0;
        const itbis = round2(amount * rate / 100);
        const row = [item.quantity ? qtyText(item, { words: unitWords }) : '0', rate === 0 ? `E  ${name}` : name];
        if (withNotes) row.push(item.customizationNotes || item.description || item.notes || '—');
        row.push(formatCurrency(price, currency));
        if (withDiscount) row.push(discounts[i] > 0 ? formatCurrency(-discounts[i], currency) : '—');
        row.push(formatCurrency(itbis, currency), formatCurrency(amount, currency));
        return row;
    });

    const head = ['Cant.', 'Descripción', ...(withNotes ? ['Notas'] : []), 'Precio', ...(withDiscount ? ['Desc.'] : []), 'ITBIS', 'Valor'];
    const qtyWidth = unitWords ? 24 : 18;
    const moneyWidth = withDiscount ? 28 : 30;
    const moneyCols = withDiscount ? 4 : 3;
    const firstMoney = withNotes ? 3 : 2;
    const columnStyles = {
        0: { halign: 'center', cellWidth: qtyWidth },
        1: { cellWidth: 182 - qtyWidth - (withNotes ? 28 : 0) - moneyWidth * moneyCols },
        ...(withNotes ? { 2: { cellWidth: 28 } } : {}),
    };
    // Montos con menos relleno lateral para que "RD$4,500.00" no se parta en dos líneas
    for (let c = firstMoney; c < firstMoney + moneyCols; c += 1) {
        columnStyles[c] = { halign: 'right', cellWidth: moneyWidth, cellPadding: { top: 4, right: 3, bottom: 4, left: 2 } };
    }
    const muted = theme.textSecondary || DEFAULT_THEME.textSecondary;

    doc.autoTable({
        head: [head],
        body: tableRows,
        startY,
        theme: 'grid',
        // Paginación (Informe Técnico e-CF 18.2): el encabezado se repite en cada página y abajo queda espacio para el pie
        margin: { left: 14, right: 14, top: topMargin, bottom: bottomReserve },
        didDrawPage: (d) => { if (d.pageNumber > 1) onNewPage?.(); },
        styles: {
            fontSize: 9,
            cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
            textColor: theme.textPrimary || DEFAULT_THEME.textPrimary,
            lineColor: theme.border || DEFAULT_THEME.border,
        },
        headStyles: {
            fillColor: theme.subtleBg || DEFAULT_THEME.subtleBg, // formato blanco: cabecera de tabla clara
            textColor: theme.textPrimary || DEFAULT_THEME.textPrimary,
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: theme.tableAltRow || DEFAULT_THEME.tableAltRow,
        },
        columnStyles,
        tableWidth: 182,
        didParseCell: (d) => {
            if (d.section === 'head') d.cell.styles.halign = d.column.index === 0 ? 'center' : d.column.index >= firstMoney ? 'right' : 'left';
            if (d.section === 'body' && d.column.index === 1 && skus[d.row.index]) d.cell.styles.cellPadding = { top: 4, right: 4, bottom: 8, left: 4 };
        },
        didDrawCell: (d) => {
            if (d.section === 'body' && d.column.index === 0) rowPages[d.row.index] = doc.internal.getCurrentPageInfo().pageNumber;
            if (d.section !== 'body' || d.column.index !== 1 || !skus[d.row.index]) return;
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            doc.text(`Cód. ${skus[d.row.index]}`, d.cell.x + 4, d.cell.y + d.cell.height - 3);
            doc.setFontSize(9);
            setBodyTextColor(doc, theme);
        },
    });

    return doc.lastAutoTable.finalY + 6;
};

const drawFinancialSection = (doc, theme, { docData, currency, bankDetails, startY: firstY, newPage }) => {
    let startY = firstY;
    const cardWidth = 86;
    const summaryX = bankDetails?.bankName ? 110 : 14;
    
    // Compatibilidad Firebase y PostgreSQL
    const coupon = docTotals(docData); // con cupón: suma de las líneas (incluye lo exento) y la parte del cupón en la base
    const split = baseSplit(docData);
    const taxableAmount = coupon?.subtotal ?? split.gravado;
    const exemptAmount = coupon ? 0 : split.exento;
    const taxAmount = docData.itbis ?? docData.taxAmount ?? 0;
    const totalAmount = docData.total ?? 0;
    const discAmount = coupon?.discount ?? docData.discountAmount ?? 0;
    
    const summaryEntries = [
        { label: 'Monto gravado', value: taxableAmount },
        { label: 'Monto exento', value: exemptAmount },
    ];

    if (discAmount > 0) {
        summaryEntries.push({ label: 'Descuento', value: -discAmount });
    }

    summaryEntries.push(
        { label: 'ITBIS (18%)', value: taxAmount },
        { label: 'Total', value: totalAmount, highlight: true },
    );

    // Compacto para que el QR del e-CF quepa en la primera página
    const terms = termLines(docData).flatMap((l) => doc.splitTextToSize(l, cardWidth - 16));
    const summaryHeight = summaryEntries.length * 8 + 20 + terms.length * 4.5;
    const bankHeight = bankDetails?.bankName ? 52 : 0;
    const boxHeight = Math.max(summaryHeight, bankHeight);
    const adjustedHeight = boxHeight || summaryHeight;
    if (newPage && startY + adjustedHeight > doc.internal.pageSize.height - 14) startY = newPage();

    if (bankDetails?.bankName) {
        doc.setFillColor(...(theme.subtleBg || DEFAULT_THEME.subtleBg));
        doc.roundedRect(14, startY, cardWidth, adjustedHeight, 4, 4, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Pago por transferencia', 22, startY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize([
            `Banco: ${bankDetails.bankName || ''}`,
            `Beneficiario: ${bankDetails.beneficiaryName || ''}`,
            `Tipo de cuenta: ${bankDetails.accountType || ''}`,
            `No. de cuenta: ${bankDetails.accountNumber || ''}`,
            `RNC/Cédula: ${bankDetails.beneficiaryId || ''}`,
        ], cardWidth - 16);
        doc.text(lines, 22, startY + 18, { lineHeightFactor: 1.4 });
    }

    doc.setFillColor(...(theme.cardBg || DEFAULT_THEME.cardBg));
    doc.roundedRect(summaryX, startY, cardWidth, adjustedHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resumen', summaryX + 8, startY + 10);

    let cursorY = startY + 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    summaryEntries.forEach(({ label, value, highlight }) => {
        if (highlight) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
        }
        doc.text(label, summaryX + 8, cursorY);
        doc.text(formatCurrency(value, currency), summaryX + cardWidth - 8, cursorY, { align: 'right' });
        if (highlight) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
        }
        cursorY += 8;
    });

    if (docData.exemptionNumber) {
        doc.setFontSize(8);
        doc.text(`Exento de ITBIS — Carnet N.º ${docData.exemptionNumber}`, summaryX + 8, cursorY - 2);
    }

    if (terms.length) {
        doc.setFontSize(8);
        terms.forEach((line, i) => doc.text(line, summaryX + 8, cursorY + 2 + i * 4.5));
    }

    return startY + adjustedHeight;
};

const drawExtraNotes = (doc, theme, { startY, docData, newPage }) => {
    const notes = docData?.notes || docData?.termsAndConditions || docData?.observations;
    if (!notes) {
        return startY;
    }

    const maxY = doc.internal.pageSize.height - 20;
    let currentY = startY;
    if (currentY + 30 > maxY) {
        if (newPage) currentY = newPage();
        else { doc.addPage(); currentY = 20; }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notas adicionales', 14, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const text = doc.splitTextToSize(notes, 182);
    doc.text(text, 14, currentY + 14, { lineHeightFactor: 1.5 });

    return currentY + 14 + text.length * 5;
};

// Informe Técnico e-CF 18.2.3: el QR va abajo a la izquierda, a 2 cm o más del borde de la hoja, de 22 mm o más
const QR_X = 21;

const drawEcfFooter = (doc, theme, { startY, ecfData, newPage }) => {
    if (!ecfData || !ecfData.eNcf) return startY;

    const maxY = doc.internal.pageSize.height - 12;
    let currentY = startY + 2;
    if (currentY + 42 > maxY) {
        if (newPage) currentY = newPage();
        else { doc.addPage(); currentY = 20; }
    }

    // Bloque e-CF
    doc.setFillColor(245, 247, 255);
    doc.roundedRect(14, currentY, 182, 40, 4, 4, 'F');

    // QR de consulta en la DGII, dibujado módulo a módulo (jsPDF no puede cargar imágenes remotas)
    if (ecfData.qrCodeUrl) {
        const modules = qrModules(ecfData.qrCodeUrl);
        const cell = 32 / modules.length;
        doc.setFillColor(255, 255, 255);
        doc.rect(QR_X, currentY + 4, 32, 32, 'F');
        doc.setFillColor(0, 0, 0);
        modules.forEach((row, y) => row.forEach((on, x) => {
            if (on) doc.rect(QR_X + x * cell, currentY + 4 + y * cell, cell, cell, 'F');
        }));
    }

    const textX = ecfData.qrCodeUrl ? QR_X + 38 : 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(79, 70, 229); // brand-600
    doc.text('Comprobante Fiscal Electrónico (e-CF)', textX, currentY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...(theme.textPrimary || DEFAULT_THEME.textPrimary));
    doc.text(`e-NCF: ${ecfData.eNcf}`, textX, currentY + 18);

    if (ecfData.securityCode) {
        doc.text(`Código de seguridad: ${ecfData.securityCode}`, textX, currentY + 23);
    }
    if (ecfData.signedAt) {
        doc.text(`Fecha de firma digital: ${ecfData.signedAt}`, textX, currentY + 28);
    }

    doc.setFontSize(7);
    doc.setTextColor(...(theme.textSecondary || DEFAULT_THEME.textSecondary));
    doc.text('Escanea el código para consultar este comprobante en la DGII', textX, currentY + 35);

    setBodyTextColor(doc, theme);
    return currentY + 44;
};

// Paginación (Informe Técnico e-CF 18.2.3): con más de una página, cada una lleva "Página X de N"; las que no son la
// última llevan sus subtotales (gravado, exento, ITBIS y monto total de la página) y la información de consulta del e-CF.
const drawPageFooters = (doc, theme, { docData, currency, rowPages }) => {
    const pages = doc.internal.getNumberOfPages();
    if (pages < 2) return;
    const height = doc.internal.pageSize.height;
    const items = docData?.items || [];
    const ecf = docData?.ecfData;
    const muted = theme.textSecondary || DEFAULT_THEME.textSecondary;

    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(`Página ${page} de ${pages}`, 196, height - 6, { align: 'right' });
        setBodyTextColor(doc, theme);
        if (page === pages) continue;

        const onPage = items.filter((_, i) => rowPages[i] === page);
        if (!onPage.length) continue;
        let gravado = 0; let exento = 0; let itbis = 0;
        onPage.forEach((item) => {
            const { amount } = docLine(item, docData?.pricesIncludeTax);
            const rate = Number(item.taxRate) || 0;
            if (rate > 0) { gravado += amount; itbis += round2(amount * rate / 100); } else exento += amount;
        });
        const lines = [
            ['Subtotal gravado página', gravado],
            ['Subtotal exento página', exento],
            ['Subtotal ITBIS página', itbis],
            ['Monto total página', gravado + exento + itbis],
        ];
        const top = height - (ecf?.qrCodeUrl ? 40 : 30);
        lines.forEach(([label, value], i) => {
            doc.setFont('helvetica', i === lines.length - 1 ? 'bold' : 'normal');
            doc.text(label, 120, top + i * 5);
            doc.text(formatCurrency(round2(value), currency), 196, top + i * 5, { align: 'right' });
        });

        if (ecf?.qrCodeUrl) {
            // QR de 22 mm (mínimo DGII) a 2 cm del borde, con su código de seguridad y fecha de firma
            const size = 22;
            const qrTop = height - 40;
            const modules = qrModules(ecf.qrCodeUrl);
            const cell = size / modules.length;
            doc.setFillColor(0, 0, 0);
            modules.forEach((row, y) => row.forEach((on, x) => { if (on) doc.rect(QR_X + x * cell, qrTop + y * cell, cell, cell, 'F'); }));
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(`Código de seguridad: ${ecf.securityCode || ''}`, QR_X + size + 4, qrTop + 8);
            if (ecf.signedAt) doc.text(`Fecha de firma digital: ${ecf.signedAt}`, QR_X + size + 4, qrTop + 13);
        }
    }
};

const handleActionOutput = (doc, action, filename) => {
    if (action === 'arraybuffer') return doc.output('arraybuffer');
    if (action === 'blob') return doc.output('blob');
    if (action === 'dataurl') return doc.output('datauristring');

    if (action === 'print') {
        doc.autoPrint();
        window.open(doc.output('bloburl'), '_blank');
        return doc;
    }

    if (action === 'download') {
        doc.save(filename);
        return doc;
    }

    window.open(doc.output('bloburl'), '_blank');
    return doc;
};

// Comprobante que emite la empresa al comprar (B11/B13/B17 o E41/E43/E47), a partir del gasto
const VOUCHER_TITLES = {
    B11: 'Comprobante de Compras', E41: 'Comprobante de Compras Electrónico',
    B13: 'Comprobante de Gastos Menores', E43: 'Comprobante de Gastos Menores Electrónico',
    B17: 'Comprobante para Pagos al Exterior', E47: 'Comprobante para Pagos al Exterior Electrónico',
};
export const voucherDocData = (expense, currency = 'DOP') => {
    const n = (v) => Number(v || 0);
    const itbis = n(expense.itbisFacturado);
    const base = n(expense.montoBienes) + n(expense.montoServicios) || n(expense.montoFacturado);
    const total = base + itbis;
    const withheld = n(expense.itbisRetenido) + n(expense.montoRetencionIsr);
    const items = [['Bienes', expense.montoBienes], ['Servicios', expense.montoServicios]]
        .filter(([, amount]) => n(amount) > 0)
        .map(([name, amount]) => ({ productName: name, description: expense.description || '', quantity: 1, unitPrice: n(amount) }));
    const notes = [
        n(expense.itbisRetenido) > 0 && `ITBIS retenido: ${formatCurrency(n(expense.itbisRetenido), currency)}`,
        n(expense.montoRetencionIsr) > 0 && `ISR retenido: ${formatCurrency(n(expense.montoRetencionIsr), currency)}`,
        withheld > 0 && `Neto pagado al ${['B11', 'E41'].includes(expense.issuedVoucher) ? 'vendedor' : 'proveedor'}: ${formatCurrency(total - withheld, currency)}`,
        // El B11 en papel lo firma el vendedor al recibir el pago
        expense.issuedVoucher === 'B11' && '\nRecibido conforme (firma del vendedor): ________________________________    Cédula: ____________________',
    ].filter(Boolean).join('\n');
    return {
        ...expense,
        ncfNumber: expense.ncf,
        date: expense.invoiceDate,
        items,
        montoGravado: itbis > 0 ? base : 0,
        montoExento: itbis > 0 ? 0 : base,
        itbis,
        total,
        notes,
        customerName: expense.supplierName,
        customerRnc: expense.rncCedula || expense.foreignPayment?.taxId,
    };
};

// Orden de compra al suplidor: costos por unidad de la línea (sin ITBIS), no precios de venta
export const purchaseOrderDocData = (order) => {
    const supplier = order.supplier || {};
    const expected = order.expectedDate && order.expectedDate.slice(0, 10).split('-').reverse().join('/');
    return {
        ...order,
        items: (order.items || []).map((it) => ({
            productName: (it.product?.name ?? '') + (it.packagingName ? ` — ${it.packagingName}` : ''),
            quantity: it.quantity,
            unitPrice: Number(it.unitCost),
            taxRate: it.taxRate,
            subtotal: round2(Number(it.quantity) * Number(it.unitCost)),
            product: it.packagingName ? {} : { unit: it.product?.unit },
        })),
        subtotal: Number(order.subtotal),
        itbis: Number(order.itbis),
        total: Number(order.total),
        date: order.createdAt,
        notes: [order.notes, expected && `Fecha esperada: ${expected}`].filter(Boolean).join('\n'),
        customerName: supplier.name,
        customerRnc: supplier.identificationNumber || supplier.rnc,
        pricesIncludeTax: false,
    };
};

export const generatePDF = async (docData, docType, companyProfile, customerDetails, emitterInfo, action = 'view') => {
    if (docType === 'purchase-order') docData = purchaseOrderDocData(docData);
    if (docType === 'purchase-voucher') docData = voucherDocData(docData, companyProfile?.currency || 'DOP');
    try {
        await ensurePdfLibraries();
        // Un e-CF impreso lleva su QR, código de seguridad y fecha de firma (representación impresa DGII)
        docData = await withEcfPrintData(docData);
    } catch (error) {
        console.error('Failed to load PDF generation scripts:', error);
        toast.error('No se pudieron cargar las librerías para generar el PDF.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const currency = companyProfile?.currency || 'USD';
    const theme = resolveTheme(companyProfile);

    let docTitle = '';
    let docNumber = '';
    let numberLabel = 'NCF:';
    let documentDate = docData?.date;
    let isModificationDocument = false;
    const validUntil = ['invoice', 'purchase-voucher'].includes(docType) ? (docData?.ncfExpiresAt || docData?.ecfData?.sequenceExpiresAt?.split('-').reverse().join('-')) : null;
    // NCF guardado por el servidor (ncfNumber); "ncf" es el formato anterior
    const savedNcf = docData?.ncfNumber && docData.ncfNumber !== 'NoFiscal' ? docData.ncfNumber : null;

    switch (docType) {
        case 'invoice':
            docTitle = invoiceTitle(docData);
            docNumber = docData?.ncf?.number || savedNcf || docData?.invoiceNumber;
            if (docData?.ncf?.type === 'Sin Valor Fiscal' || (!docData?.ncf && !savedNcf)) {
                numberLabel = 'Factura N°:';
                docNumber = docData?.invoiceNumber;
            }
            // e-CF: Si tiene eNcf, usar ese como número principal
            if (docData?.ecfData?.eNcf) {
                numberLabel = 'e-NCF:';
                docNumber = docData.ecfData.eNcf;
            }
            documentDate = docData?.billedDate || docData?.date;
            break;
        case 'credit-note':
            docTitle = isEcfDoc(docData) ? invoiceTitle(docData) : 'Nota de Crédito';
            docNumber = savedNcf || docData?.ncf || docData?.creditNoteNumber;
            if (!savedNcf && (!docData?.ncf || docData?.ncf === 'N/A')) {
                numberLabel = 'Nota N°:';
                docNumber = docData?.creditNoteNumber;
            }
            if (docData?.ecfData?.eNcf) {
                numberLabel = 'e-NCF:';
                docNumber = docData.ecfData.eNcf;
            }
            isModificationDocument = true;
            break;
        case 'debit-note':
            docTitle = isEcfDoc(docData) ? invoiceTitle(docData) : 'Nota de Débito';
            docNumber = savedNcf || docData?.ncf || docData?.debitNoteNumber;
            if (!savedNcf && (!docData?.ncf || docData?.ncf === 'N/A')) {
                numberLabel = 'Nota N°:';
                docNumber = docData?.debitNoteNumber;
            }
            if (docData?.ecfData?.eNcf) {
                numberLabel = 'e-NCF:';
                docNumber = docData.ecfData.eNcf;
            }
            isModificationDocument = true;
            break;
        case 'purchase-voucher':
            docTitle = VOUCHER_TITLES[docData?.issuedVoucher] || 'Comprobante';
            docNumber = docData?.ncfNumber;
            documentDate = docData?.invoiceDate;
            break;
        case 'purchase-order':
            docTitle = 'Orden de Compra';
            docNumber = docData?.number;
            numberLabel = 'N.º';
            break;
        case 'quote':
        default:
            docTitle = 'Cotización';
            docNumber = docData?.orderNumber;
            numberLabel = 'Cotización N°:';
            break;
    }

    if (numberLabel === 'NCF:' && String(docNumber || '').startsWith('E')) numberLabel = 'e-NCF:';

    const headerArgs = { companyProfile, docTitle, numberLabel, docNumber, documentDate, validUntil, modification: modificationInfo(docType, docData) };
    // Página nueva con el encabezado repetido (DGII: el encabezado va en cada página)
    const newPage = () => { doc.addPage(); return drawDocumentHeader(doc, theme, headerArgs); };
    let cursorY = drawDocumentHeader(doc, theme, headerArgs);
    const headerBottom = cursorY;
    const rowPages = [];

    cursorY = drawInfoCards(doc, theme, {
        customerDetails,
        docData,
        emitterInfo,
        startY: cursorY,
        leftTitle: docType === 'purchase-voucher' ? (['B11', 'E41'].includes(docData?.issuedVoucher) ? 'Vendedor' : 'Proveedor') : docType === 'purchase-order' ? 'Suplidor' : 'Cliente',
    });

    if (isModificationDocument) {
        cursorY = drawModificationSummary(doc, theme, {
            startY: cursorY,
            docType,
            docData,
            currency,
        });
    } else {
        cursorY = drawItemsTable(doc, theme, {
            items: docData?.items || [],
            currency,
            pricesIncludeTax: docData?.pricesIncludeTax,
            startY: cursorY,
            withNotes: docType === 'purchase-order' ? false : showNotesColumn(companyProfile),
            unitWords: isEcfDoc(docData),
            topMargin: headerBottom,
            bottomReserve: docData?.ecfData?.qrCodeUrl ? 44 : 30,
            onNewPage: () => drawDocumentHeader(doc, theme, headerArgs),
            rowPages,
        });

        cursorY = drawFinancialSection(doc, theme, {
            docData,
            currency,
            bankDetails: ['purchase-voucher', 'purchase-order'].includes(docType) ? null : companyProfile?.bankDetails,
            startY: cursorY + 4,
            newPage,
        });
    }

    cursorY = drawExtraNotes(doc, theme, {
        startY: cursorY + 8,
        docData,
        newPage,
    });

    // e-CF: Representación Impresa con QR de validación
    if (docData?.ecfData) {
        cursorY = drawEcfFooter(doc, theme, {
            startY: cursorY,
            ecfData: docData.ecfData,
            newPage,
        });
    }

    drawPageFooters(doc, theme, { docData, currency, rowPages });

    return handleActionOutput(doc, action, `${docType}-${docNumber || 'documento'}.pdf`);
};

export const generateAccountStatementPDF = async ({ entries = [], companyProfile = {}, customer = {}, action = 'view' }) => {
    try {
        await ensurePdfLibraries();
    } catch (error) {
        console.error('Failed to load PDF generation scripts:', error);
        toast.error('No se pudieron cargar las librerías para generar el PDF.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const theme = resolveTheme(companyProfile);
    const currency = companyProfile?.currency || 'USD';

    const referenceInvoice = entries[0]?.invoice || {};

    let cursorY = drawDocumentHeader(doc, theme, {
        companyProfile,
        docTitle: 'Estado de Cuenta',
        numberLabel: 'ID Cliente:',
        docNumber: customerTaxId(customer, referenceInvoice) || customer?.customerCode || '',
        documentDate: new Date(),
    });

    cursorY = drawInfoCards(doc, theme, {
        customerDetails: {
            name: customer?.name || referenceInvoice.customerName,
            identificationNumber: customerTaxId(customer, referenceInvoice),
            phone: customer?.phone || referenceInvoice.customerPhone,
            email: customer?.email || referenceInvoice.customerEmail,
            address: customer?.address,
        },
        docData: referenceInvoice,
        emitterInfo: {
            fullName: companyProfile?.contactName || companyProfile?.name,
            cargo: companyProfile?.contactRole || 'Atención al cliente',
        },
        startY: cursorY,
    });

    const tableRows = entries.map((entry) => ([
        entry.invoice?.orderNumber || entry.invoice?.invoiceNumber || entry.invoice?.id || '-',
        formatDate(entry.invoice?.billedDate || entry.invoice?.date),
        formatDate(entry.dueDate),
        formatCurrency(entry.total || 0, currency),
        formatCurrency(entry.paid || 0, currency),
        formatCurrency(entry.outstanding || 0, currency),
        entry.status || '',
    ]));

    if (entries.length) {
        doc.autoTable({
            head: [['Documento', 'Emisión', 'Vencimiento', 'Total', 'Pagado', 'Pendiente', 'Estado']],
            body: tableRows,
            startY: cursorY,
            theme: 'grid',
            margin: { left: 14, right: 14 },
            styles: {
                fontSize: 9,
                cellPadding: 4,
                textColor: theme.textPrimary || DEFAULT_THEME.textPrimary,
                lineColor: theme.border || DEFAULT_THEME.border,
            },
            headStyles: {
                fillColor: theme.subtleBg || DEFAULT_THEME.subtleBg, // formato blanco: cabecera de tabla clara
                textColor: theme.textPrimary || DEFAULT_THEME.textPrimary,
                fontStyle: 'bold',
            },
            alternateRowStyles: {
                fillColor: theme.tableAltRow || DEFAULT_THEME.tableAltRow,
            },
            columnStyles: {
                0: { cellWidth: 28 },
                1: { cellWidth: 26 },
                2: { cellWidth: 26 },
                3: { halign: 'right', cellWidth: 26 },
                4: { halign: 'right', cellWidth: 26 },
                5: { halign: 'right', cellWidth: 26 },
                6: { cellWidth: 24 },
            },
        });

        cursorY = doc.lastAutoTable.finalY + 10;
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('No se registran movimientos pendientes para este cliente.', 14, cursorY + 6);
        cursorY += 20;
    }

    const summary = entries.reduce((acc, entry) => {
        acc.total += entry.total || 0;
        acc.paid += entry.paid || 0;
        acc.outstanding += entry.outstanding || 0;
        return acc;
    }, { total: 0, paid: 0, outstanding: 0 });

    doc.setFillColor(...(theme.cardBg || DEFAULT_THEME.cardBg));
    doc.roundedRect(14, cursorY, 86, 54, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resumen de cuenta', 22, cursorY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total facturado: ${formatCurrency(summary.total, currency)}`, 22, cursorY + 20);
    doc.text(`Total pagado: ${formatCurrency(summary.paid, currency)}`, 22, cursorY + 30);
    doc.setFont('helvetica', 'bold');
    doc.text(`Saldo pendiente: ${formatCurrency(summary.outstanding, currency)}`, 22, cursorY + 42);

    return handleActionOutput(
        doc,
        action,
        `estado-de-cuenta-${(customer?.name || referenceInvoice.customerName || 'cliente')}.pdf`,
    );
};
