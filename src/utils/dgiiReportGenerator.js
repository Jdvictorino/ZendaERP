import { format, parseISO } from 'date-fns';
import { isVoidInvoice } from './invoiceStatus.js';
import { filterByDateRange } from './reportFilters.js';
import { noteAmounts, noteReturnLines } from './noteSplit.js';

// Función para determinar el Tipo de ID según la longitud del RNC/Cédula
const getTypeId = (rnc) => {
    if (!rnc) return '3'; // Consumidor Final por defecto
    const cleanedRnc = rnc.replace(/-/g, '');
    if (cleanedRnc.length === 9) return '1'; // RNC
    if (cleanedRnc.length === 11) return '2'; // Cédula
    return '3'; // Pasaporte u otro
};

// Función para formatear la fecha a YYYYMMDD
// Soporta ISO strings (PostgreSQL) y timestamps (legacy Firebase)
const formatDateToDGII = (dateValue) => {
    if (!dateValue) return '';
    // Fechas sin hora (se guardan como medianoche UTC): en RD (UTC-4) saldrían con el día anterior
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z)?$/.test(dateValue)) {
        return dateValue.slice(0, 10).replace(/-/g, '');
    }

    let date;
    // ISO string (PostgreSQL)
    if (typeof dateValue === 'string') {
        date = parseISO(dateValue);
    }
    // Legacy Firebase timestamp con seconds
    else if (dateValue?.seconds) {
        date = new Date(dateValue.seconds * 1000);
    }
    // Date object
    else if (dateValue instanceof Date) {
        date = dateValue;
    }
    else {
        return '';
    }

    return format(date, 'yyyyMMdd');
};

// Las facturas llegan de la API con ncfNumber / customerRnc / taxAmount; "ncf" es el formato anterior
const ncfOf = (inv) => inv.ncf?.number || inv.ncfNumber || '';
const rncOf = (inv) => inv.ncf?.customerRnc || inv.customerRnc || '';

// GET /invoices trae _count.creditNotes; una factura con notas anulada por una nota total no es una anulación del 608
const hasNotes = (inv) => Number(inv._count?.creditNotes || 0) > 0;

// Fecha del comprobante: un e-CF lleva la de la venta (FechaEmision); un NCF en papel, la de facturación
export const voucherDateOf = (inv) => (ncfOf(inv).startsWith('E') ? inv.date || inv.billedDate : inv.billedDate || inv.date);

// Facturas cuyo comprobante cae en el período (607/608); filterByDateRange queda igual para los demás reportes
export const filterByVoucherDate = (invoices = [], from, to) =>
    filterByDateRange(invoices.map(inv => ({ inv, d: voucherDateOf(inv) })), 'd', from, to).map(x => x.inv);

// Factura con comprobante fiscal (B01, B02, E31, ...); las "Sin Valor Fiscal" no van al 607/608
export const isFiscalInvoice = (inv) => {
    const ncf = ncfOf(inv);
    return !!ncf && ncf !== 'NoFiscal' && ncf !== 'N/A' && inv.ncf?.type !== 'Sin Valor Fiscal';
};

/**
 * Genera los datos para el reporte 606 (Compras de Bienes y Servicios)
 * @param {Array} expenses - Array de gastos del período.
 * @param {Array} suppliers - Array de todos los proveedores.
 * @returns {Array} - Datos formateados para el reporte.
 */
export const generate606Data = (expenses = [], suppliers = []) => {
    // Los pagos al exterior (B17/E47) van en el 609, no en el 606
    return expenses.filter(exp => !['B17', 'E47'].includes(exp.issuedVoucher)).map(exp => {
        const supplier = suppliers.find(s => s.id === exp.supplierId) || {};
        // Nombres guardados en la base (expenseType, paymentType, ...); los otros son del formato anterior
        const rnc = exp.rncCedula || supplier.identificationNumber || supplier.rnc || '';

        return {
            "RNC o Cédula": rnc.replace(/-/g, ''),
            "Tipo Id": getTypeId(rnc),
            "Tipo Bienes y Servicios Comprados": String(exp.expenseType || exp.tipoGasto || '09').split('-')[0],
            "NCF": exp.ncf || '',
            "NCF ó Documento Modificado": exp.ncfModificado || '',
            "Fecha Comprobante": formatDateToDGII(exp.invoiceDate),
            "Fecha Pago": formatDateToDGII(exp.paymentDate),
            "Monto Facturado en Servicios": Number(exp.montoServicios || 0),
            "Monto Facturado en Bienes": Number(exp.montoBienes || 0),
            "Total Monto Facturado": Number(exp.montoFacturado ?? exp.totalMontoFacturado ?? 0),
            "ITBIS Facturado": Number(exp.itbisFacturado || 0),
            "ITBIS Retenido": Number(exp.itbisRetenido || 0),
            "ITBIS sujeto a Proporcionalidad (Art. 349)": exp.itbisProporcional || 0,
            "ITBIS llevado al Costo": exp.itbisAlCosto || 0,
            "ITBIS por Adelantar": exp.itbisAdelantar || 0,
            "ITBIS percibido en compras": exp.itbisPercibido || 0,
            "Tipo de Retención en ISR": exp.retencionIsrTipo || exp.retencionISR || '',
            "Monto Retención Renta": Number(exp.montoRetencionIsr ?? exp.montoRetencionISR ?? 0),
            "ISR Percibido en compras": exp.isrPercibido || 0,
            "Impuesto Selectivo al Consumo": exp.isc || 0,
            "Otros Impuesto/Tasas": exp.otrosImpuestos || 0,
            "Monto Propina Legal": Number(exp.propina || 0),
            "Forma de Pago": String(exp.paymentType || exp.formaPago || '01').split(' ')[0],
        };
    });
};

/**
 * Formato 609 (Pagos al Exterior): los gastos con Comprobante para Pagos al Exterior (B17/E47),
 * en el orden y con los textos de la plantilla de la DGII.
 */
export const generate609Data = (expenses = []) => {
    return expenses.filter(exp => ['B17', 'E47'].includes(exp.issuedVoucher)).map(exp => {
        const f = exp.foreignPayment || {};
        return {
            "Nombre o Razón Social": exp.supplierName || '',
            "Tipo ID Tributaria": f.idType || '',
            "ID Tributaria": f.taxId || '',
            "País de Destino": f.country || '',
            "Tipo de Servicio Adquirido": f.serviceType || '',
            "Detalle del Servicio Adquirido": f.serviceDetail || '',
            "Parte Relacionada": f.relatedParty ? 'Si' : 'No',
            "Número de Documento": f.documentNumber || exp.ncf || '',
            "Fecha de Documento": formatDateToDGII(exp.invoiceDate),
            "Monto Facturado": Number(exp.montoFacturado || 0),
            "Fecha de Retención ISR": formatDateToDGII(exp.paymentDate),
            "Renta Presunta": Number(f.rentaPresunta || exp.montoFacturado || 0),
            "ISR Retenido": Number(exp.montoRetencionIsr || 0),
        };
    });
};

/**
 * Genera los datos para el reporte 607 (Ventas de Bienes y Servicios)
 * @param {Array} invoices - Array de facturas del período.
 * @param {Array} creditNotes - Notas de crédito del período, cada una con su `invoice` (GET /invoices/credit-notes).
 * @returns {Array} - Datos formateados para el reporte.
 */
export const generate607Data = (invoices = [], creditNotes = []) => {
    // Notas de crédito (con su `invoice`): línea propia con su NCF y el NCF modificado, montos positivos.
    // Fuente: Instructivo 607 de la DGII (campo "Número Comprobante Fiscal Modificado") y Consulta 17 (las notas se remiten en el 607); el signo no lo dice el instructivo (SIN VERIFICAR).
    const noteRows = creditNotes.filter(n => n.invoice && n.ncfNumber).map(n => {
        const inv = n.invoice;
        const { base, itbis, exempt } = noteAmounts(n, inv, { lines: noteReturnLines(n, inv) });
        return {
            "RNC o Cédula": rncOf(inv).replace(/-/g, ''),
            "Tipo Id": getTypeId(rncOf(inv)),
            "NCF": n.ncfNumber || '',
            "NCF ó Documento Modificado": inv.ncfNumber || '',
            "Tipo de Ingreso": '01',
            "Fecha Comprobante": formatDateToDGII(n.createdAt),
            "Fecha de Retención": '',
            "Monto Facturado": Number((base + exempt).toFixed(2)),
            "ITBIS Facturado": itbis,
            "ITBIS Retenido por Terceros": 0, "ITBIS Percibido": 0, "Retención Renta por Terceros": 0, "ISR Percibido": 0,
            "Impuesto Selectivo al Consumo (ISC)": 0, "Otros Impuestos/Tasas": 0, "Monto Propina Legal": 0,
            "Efectivo": 0, "Cheque / Transferencia / Depósito": 0, "Tarjeta Débito / Crédito": 0, "Venta a Crédito": 0,
            "Bonos o Certificados de Regalo": 0, "Permuta": 0, "Otras Formas de Ventas": 0,
        };
    });
    const invoiceRows = invoices
        // Anulada por una nota total (tiene notas): sigue en el 607 de su período; solo las anuladas con "Anular" salen
        .filter(inv => !isVoidInvoice(inv) || hasNotes(inv))
        .map(inv => {
            // Agregamos por formas de pago a partir del historial de pagos si existe
            const pagos = Array.isArray(inv.payments) ? inv.payments : [];
            const sum = (arr, key) => arr.reduce((s, p) => s + (parseFloat(p?.[key]) || 0), 0);
            const efectivo = sum(pagos, 'efectivo');
            const chequeTransfer = sum(pagos, 'chequeTransferencia');
            const tarjeta = sum(pagos, 'tarjeta');
            const creditoPagos = sum(pagos, 'credito');

            // Si no hay desglose, caemos al monto pagado general
            const paidAmount = typeof inv.paidAmount === 'number' ? inv.paidAmount : (efectivo + chequeTransfer + tarjeta);
            const ventaCreditoCalculada = inv.paymentStatus === 'No Pagado' ? (inv.total || 0) : Math.max(0, (inv.total || 0) - paidAmount);
            const ventaCredito = Math.max(ventaCreditoCalculada, creditoPagos);

            return {
                "RNC o Cédula": rncOf(inv).replace(/-/g, ''),
                "Tipo Id": getTypeId(rncOf(inv)),
                "NCF": ncfOf(inv),
                "NCF ó Documento Modificado": inv.ncfModificado || '',
                "Tipo de Ingreso": '01', // Ingresos por Operaciones (No Financieros)
                "Fecha Comprobante": formatDateToDGII(voucherDateOf(inv)),
                "Fecha de Retención": formatDateToDGII(inv.retentionDate),
                "Monto Facturado": inv.subtotal || 0,
                "ITBIS Facturado": Number(inv.itbis ?? inv.taxAmount ?? 0),
                "ITBIS Retenido por Terceros": Number(inv.itbisRetenido || 0),
                "ITBIS Percibido": inv.itbisPercibido || 0,
                "Retención Renta por Terceros": Number(inv.retencionRenta || 0),
                "ISR Percibido": inv.isrPercibido || 0,
                "Impuesto Selectivo al Consumo (ISC)": inv.isc || 0,
                "Otros Impuestos/Tasas": inv.otrosImpuestos || 0,
                "Monto Propina Legal": inv.propina || 0,
                "Efectivo": efectivo || 0,
                "Cheque / Transferencia / Depósito": chequeTransfer || 0,
                "Tarjeta Débito / Crédito": tarjeta || 0,
                "Venta a Crédito": ventaCredito || 0,
                "Bonos o Certificados de Regalo": 0,
                "Permuta": 0,
                "Otras Formas de Ventas": 0,
            };
        });
    return [...invoiceRows, ...noteRows];
};

/**
 * Genera los datos para el reporte 608 (Comprobantes Anulados)
 * @param {Array} invoices - Array de facturas canceladas del período.
 * @returns {Array} - Datos formateados para el reporte 608.
 */
export const generate608Data = (invoices = []) => {
    return invoices
        .filter(inv => isVoidInvoice(inv) && !hasNotes(inv))
        .map(inv => ({
            "RNC o Cédula": rncOf(inv).replace(/-/g, ''),
            "Tipo Id": getTypeId(rncOf(inv)),
            "NCF": ncfOf(inv),
            "Fecha Comprobante": formatDateToDGII(voucherDateOf(inv)),
            "Fecha Anulación": formatDateToDGII(inv.cancelDate || inv.updatedAt || inv.date) || '',
            "Tipo de Anulación": inv.cancelReasonCode || '09', // 09: Otros (por defecto)
        }));
};

/**
 * Exporta los datos a un archivo de texto (.txt) con formato DGII (separado por |)
 * @param {Array} data - Datos a exportar.
 * @param {String} filename - Nombre del archivo.
 */
export const exportToTxt = (data, filename) => {
    const headers = Object.keys(data[0]);
    const content = data.map(row => headers.map(header => row[header]).join('|')).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
};
