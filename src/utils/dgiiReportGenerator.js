import { format, parseISO } from 'date-fns';

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

/**
 * Genera los datos para el reporte 606 (Compras de Bienes y Servicios)
 * @param {Array} expenses - Array de gastos del período.
 * @param {Array} suppliers - Array de todos los proveedores.
 * @returns {Array} - Datos formateados para el reporte.
 */
export const generate606Data = (expenses = [], suppliers = []) => {
    return expenses.map(exp => {
        const supplier = suppliers.find(s => s.id === exp.supplierId) || {};
        
        return {
            "RNC o Cédula": supplier.rnc || '',
            "Tipo Id": getTypeId(supplier.rnc),
            "Tipo Bienes y Servicios Comprados": exp.tipoGasto ? exp.tipoGasto.split('-')[0] : '01',
            "NCF": exp.ncf || '',
            "NCF ó Documento Modificado": exp.ncfModificado || '',
            "Fecha Comprobante": formatDateToDGII(exp.invoiceDate),
            "Fecha Pago": formatDateToDGII(exp.paymentDate),
            "Monto Facturado en Servicios": exp.montoServicios || 0,
            "Monto Facturado en Bienes": exp.montoBienes || 0,
            "Total Monto Facturado": exp.totalMontoFacturado || 0,
            "ITBIS Facturado": exp.itbisFacturado || 0,
            "ITBIS Retenido": exp.itbisRetenido || 0,
            "ITBIS sujeto a Proporcionalidad (Art. 349)": exp.itbisProporcional || 0,
            "ITBIS llevado al Costo": exp.itbisAlCosto || 0,
            "ITBIS por Adelantar": exp.itbisAdelantar || 0,
            "ITBIS percibido en compras": exp.itbisPercibido || 0,
            "Tipo de Retención en ISR": exp.retencionISR || '',
            "Monto Retención Renta": exp.montoRetencionISR || 0,
            "ISR Percibido en compras": exp.isrPercibido || 0,
            "Impuesto Selectivo al Consumo": exp.isc || 0,
            "Otros Impuesto/Tasas": exp.otrosImpuestos || 0,
            "Monto Propina Legal": exp.propina || 0,
            "Forma de Pago": exp.formaPago ? exp.formaPago.split(' ')[0] : '01',
        };
    });
};

/**
 * Genera los datos para el reporte 607 (Ventas de Bienes y Servicios)
 * @param {Array} invoices - Array de facturas del período.
 * @returns {Array} - Datos formateados para el reporte.
 */
export const generate607Data = (invoices = []) => {
    return invoices
        .filter(inv => inv.status !== 'Cancelado')
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
                "RNC o Cédula": inv.ncf?.customerRnc || '',
                "Tipo Id": getTypeId(inv.ncf?.customerRnc),
                "NCF": inv.ncf?.number || '',
                "NCF ó Documento Modificado": inv.ncfModificado || '',
                "Tipo de Ingreso": '01', // Ingresos por Operaciones (No Financieros)
                "Fecha Comprobante": formatDateToDGII(inv.billedDate || inv.date),
                "Fecha de Retención": '', // No manejado actualmente
                "Monto Facturado": inv.subtotal || 0,
                "ITBIS Facturado": inv.itbis || 0,
                "ITBIS Retenido por Terceros": inv.itbisRetenido || 0,
                "ITBIS Percibido": inv.itbisPercibido || 0,
                "Retención Renta por Terceros": inv.retencionRenta || 0,
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
};

/**
 * Genera los datos para el reporte 608 (Comprobantes Anulados)
 * @param {Array} invoices - Array de facturas canceladas del período.
 * @returns {Array} - Datos formateados para el reporte 608.
 */
export const generate608Data = (invoices = []) => {
    return invoices
        .filter(inv => inv.status === 'Cancelado')
        .map(inv => ({
            "RNC o Cédula": inv.ncf?.customerRnc || '',
            "Tipo Id": getTypeId(inv.ncf?.customerRnc),
            "NCF": inv.ncf?.number || '',
            "Fecha Comprobante": formatDateToDGII(inv.billedDate || inv.date),
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
