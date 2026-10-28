import { formatCurrency } from './formatCurrency.js';
import toast from 'react-hot-toast';
import { loadScript } from './loadScript.js';

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

const drawDocumentHeader = (doc, theme, { companyProfile = {}, docTitle, numberLabel, docNumber, documentDate }) => {
    const headerHeight = 48;
    doc.setFillColor(...(theme.primary || DEFAULT_THEME.primary));
    doc.rect(0, 0, 210, headerHeight, 'F');

    const hasLogo = Boolean(companyProfile.logo);
    if (hasLogo) {
        try {
            doc.addImage(companyProfile.logo, 'PNG', 18, 10, 28, 28);
        } catch (error) {
            console.error('Error adding logo to PDF header:', error);
        }
    }

    doc.setTextColor(255, 255, 255);
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
    const { street, sector, city, zipCode, country } = companyProfile.address || {};
    const addressParts = [street, sector, city, zipCode, country].filter(Boolean).join(', ');
    addWrappedLine(addressParts);

    const contactParts = [companyProfile.phone, companyProfile.email].filter(Boolean).join(' | ');
    addWrappedLine(contactParts);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (contactLines.length) {
        doc.text(contactLines, hasLogo ? 52 : 18, 28, { lineHeightFactor: 1.4 });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(docTitle || 'Documento', 196, 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (numberLabel) {
        doc.text(`${numberLabel} ${docNumber || 'N/A'}`, 196, 26, { align: 'right' });
    }
    doc.text(`Fecha: ${formatDate(documentDate)}`, 196, 32, { align: 'right' });

    setBodyTextColor(doc, theme);
    doc.setDrawColor(...(theme.border || DEFAULT_THEME.border));
    doc.setLineWidth(0.4);
    doc.line(14, headerHeight, 196, headerHeight);

    return headerHeight + 6;
};

const buildCustomerLines = (doc, customerDetails, docData) => {
    const idLabel = customerDetails?.type === 'Empresa' ? 'RNC/Cédula:' : 'Cédula/Pasaporte:';
    const lines = [
        customerDetails?.name || docData?.customerName || 'Consumidor Final',
        `${idLabel} ${customerDetails?.identificationNumber || docData?.customerId || 'N/A'}`,
        `Tel: ${customerDetails?.phone || docData?.customerPhone || 'N/A'}`,
        `Email: ${customerDetails?.email || docData?.customerEmail || 'N/A'}`,
    ];

    if (customerDetails?.address) {
        lines.push(`Dirección: ${customerDetails.address}`);
    } else if (docData?.customerAddress) {
        lines.push(`Dirección: ${docData.customerAddress}`);
    }

    return doc.splitTextToSize(lines.filter(Boolean), 80);
};

const buildEmitterLines = (doc, emitterInfo) => {
    if (!emitterInfo) {
        return [''];
    }

    // Compatibilidad Firebase y PostgreSQL
    const fullName = emitterInfo.fullName || 
        (emitterInfo.firstName && emitterInfo.lastName ? `${emitterInfo.firstName} ${emitterInfo.lastName}` : '') ||
        emitterInfo.name || '';
    const position = emitterInfo.cargo || emitterInfo.role || emitterInfo.position || '';
    const empId = emitterInfo.employeeId || emitterInfo.id || '';
    const dept = emitterInfo.department || '';

    const lines = [
        fullName,
        position ? `Puesto: ${position}` : '',
        empId ? `ID empleado: ${empId}` : '',
        dept ? `Departamento: ${dept}` : '',
    ].filter(Boolean);

    return doc.splitTextToSize(lines.length ? lines : [''], 80);
};

const drawInfoCards = (doc, theme, { customerDetails, docData, emitterInfo, startY }) => {
    const cardPadding = 7;
    const cardHeightBase = 38;
    const columnWidth = 86;

    const customerLines = buildCustomerLines(doc, customerDetails, docData);
    const emitterLines = buildEmitterLines(doc, emitterInfo);

    const customerHeight = customerLines.length * 5 + cardPadding * 2;
    const emitterHeight = emitterLines.length * 5 + cardPadding * 2;
    const cardHeight = Math.max(cardHeightBase, customerHeight, emitterHeight);

    doc.setFillColor(...(theme.cardBg || DEFAULT_THEME.cardBg));
    doc.roundedRect(14, startY, columnWidth, cardHeight, 4, 4, 'F');
    doc.roundedRect(108, startY, columnWidth, cardHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Cliente', 14 + cardPadding, startY + cardPadding + 2);
    doc.text('Atendido por', 108 + cardPadding, startY + cardPadding + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(customerLines, 14 + cardPadding, startY + cardPadding + 10, { lineHeightFactor: 1.4 });
    doc.text(emitterLines, 108 + cardPadding, startY + cardPadding + 10, { lineHeightFactor: 1.4 });

    return startY + cardHeight + 12;
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

const drawItemsTable = (doc, theme, { items = [], currency, startY }) => {
    if (!items.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('No se registraron productos o servicios en este documento.', 14, startY + 4);
        return startY + 16;
    }

    const tableRows = items.map((item) => {
        // Compatibilidad con estructura Firebase y PostgreSQL
        const name = item.name || item.productName || item.product?.name || '-';
        const price = item.price ?? item.unitPrice ?? 0;
        const qty = item.quantity || 0;
        const notes = item.customizationNotes || item.description || item.notes || '—';
        return [
            resolveSku(item),
            name,
            notes,
            qty,
            formatCurrency(price, currency),
            formatCurrency(price * qty, currency),
        ];
    });

    doc.autoTable({
        head: [['SKU', 'Artículo', 'Notas', 'Cant.', 'Precio Unit.', 'Importe']],
        body: tableRows,
        startY,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        styles: {
            fontSize: 9,
            cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
            textColor: theme.textPrimary || DEFAULT_THEME.textPrimary,
            lineColor: theme.border || DEFAULT_THEME.border,
        },
        headStyles: {
            fillColor: theme.primary || DEFAULT_THEME.primary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: theme.tableAltRow || DEFAULT_THEME.tableAltRow,
        },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 48 },
            2: { cellWidth: 42 },
            3: { halign: 'center', cellWidth: 16 },
            4: { halign: 'right', cellWidth: 27 },
            5: { halign: 'right', cellWidth: 27 },
        },
        tableWidth: 182,
    });

    return doc.lastAutoTable.finalY + 6;
};

const drawFinancialSection = (doc, theme, { docData, currency, bankDetails, startY }) => {
    const cardWidth = 86;
    const summaryX = bankDetails?.bankName ? 110 : 14;
    
    // Compatibilidad Firebase y PostgreSQL
    const taxableAmount = docData.montoGravado ?? docData.subtotal ?? 0;
    const exemptAmount = docData.montoExento ?? 0;
    const taxAmount = docData.itbis ?? docData.taxAmount ?? 0;
    const totalAmount = docData.total ?? 0;
    const discAmount = docData.discountAmount ?? 0;
    
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

    const summaryHeight = summaryEntries.length * 9 + 22;
    const bankHeight = bankDetails?.bankName ? 60 : 0;
    const boxHeight = Math.max(summaryHeight, bankHeight);
    const adjustedHeight = boxHeight || summaryHeight;

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

    return startY + adjustedHeight;
};

const drawExtraNotes = (doc, theme, { startY, docData }) => {
    const notes = docData?.notes || docData?.termsAndConditions || docData?.observations;
    if (!notes) {
        return startY;
    }

    const maxY = doc.internal.pageSize.height - 20;
    let currentY = startY;
    if (currentY + 30 > maxY) {
        doc.addPage();
        currentY = 20;
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

const drawEcfFooter = (doc, theme, { startY, ecfData }) => {
    if (!ecfData || !ecfData.eNcf) return startY;

    const maxY = doc.internal.pageSize.height - 20;
    let currentY = startY + 6;
    if (currentY + 50 > maxY) {
        doc.addPage();
        currentY = 20;
    }

    // Separador
    doc.setDrawColor(...(theme.border || DEFAULT_THEME.border));
    doc.setLineWidth(0.3);
    doc.line(14, currentY, 196, currentY);
    currentY += 6;

    // Bloque e-CF
    doc.setFillColor(245, 247, 255);
    doc.roundedRect(14, currentY, 182, 40, 4, 4, 'F');

    // QR Code (Google Charts API)
    if (ecfData.qrCodeUrl) {
        const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=80x80&chl=${encodeURIComponent(ecfData.qrCodeUrl)}`;
        try {
            doc.addImage(qrUrl, 'PNG', 18, currentY + 4, 32, 32);
        } catch (e) {
            // Si falla el QR, solo mostramos texto
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('[QR]', 34, currentY + 20, { align: 'center' });
        }
    }

    const textX = ecfData.qrCodeUrl ? 56 : 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(79, 70, 229); // brand-600
    doc.text('Comprobante Fiscal Electrónico (e-CF)', textX, currentY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...(theme.textPrimary || DEFAULT_THEME.textPrimary));
    doc.text(`e-NCF: ${ecfData.eNcf}`, textX, currentY + 18);

    if (ecfData.securityCode) {
        doc.text(`Código de seguridad: ${ecfData.securityCode}`, textX, currentY + 24);
    }

    doc.setFontSize(7);
    doc.setTextColor(...(theme.textSecondary || DEFAULT_THEME.textSecondary));
    doc.text('Documento generado electrónicamente — Validar en dgii.gov.do', textX, currentY + 32);

    setBodyTextColor(doc, theme);
    return currentY + 44;
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

export const generatePDF = async (docData, docType, companyProfile, customerDetails, emitterInfo, action = 'view') => {
    try {
        await ensurePdfLibraries();
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

    switch (docType) {
        case 'invoice':
            docTitle = 'Factura';
            docNumber = docData?.ncf?.number || docData?.invoiceNumber;
            if (docData?.ncf?.type === 'Sin Valor Fiscal') {
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
            docTitle = 'Nota de Crédito';
            docNumber = docData?.ncf || docData?.creditNoteNumber;
            if (docData?.ncf === 'N/A') {
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
            docTitle = 'Nota de Débito';
            docNumber = docData?.ncf || docData?.debitNoteNumber;
            if (docData?.ncf === 'N/A') {
                numberLabel = 'Nota N°:';
                docNumber = docData?.debitNoteNumber;
            }
            if (docData?.ecfData?.eNcf) {
                numberLabel = 'e-NCF:';
                docNumber = docData.ecfData.eNcf;
            }
            isModificationDocument = true;
            break;
        case 'quote':
        default:
            docTitle = 'Cotización';
            docNumber = docData?.orderNumber;
            numberLabel = 'Cotización N°:';
            break;
    }

    let cursorY = drawDocumentHeader(doc, theme, {
        companyProfile,
        docTitle,
        numberLabel,
        docNumber,
        documentDate,
    });

    cursorY = drawInfoCards(doc, theme, {
        customerDetails,
        docData,
        emitterInfo,
        startY: cursorY,
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
            startY: cursorY,
        });

        cursorY = drawFinancialSection(doc, theme, {
            docData,
            currency,
            bankDetails: companyProfile?.bankDetails,
            startY: cursorY + 4,
        });
    }

    cursorY = drawExtraNotes(doc, theme, {
        startY: cursorY + 8,
        docData,
    });

    // e-CF: Representación Impresa con QR de validación
    if (docData?.ecfData) {
        cursorY = drawEcfFooter(doc, theme, {
            startY: cursorY,
            ecfData: docData.ecfData,
        });
    }

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
        docNumber: customer?.identificationNumber || referenceInvoice.customerId || 'N/A',
        documentDate: new Date(),
    });

    cursorY = drawInfoCards(doc, theme, {
        customerDetails: {
            name: customer?.name || referenceInvoice.customerName,
            identificationNumber: customer?.identificationNumber || referenceInvoice.customerId,
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
                fillColor: theme.primary || DEFAULT_THEME.primary,
                textColor: [255, 255, 255],
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
