/**
 * ecfXmlBuilder.js
 * Mapea Invoice del sistema al formato IECF de dgii-ecf para generar XML válido DGII.
 */
import { Transformer } from 'dgii-ecf';

// Mapeo de tipos e-CF a código numérico DGII
const ECF_TYPE_CODES = {
  E31: 31, // Factura de Crédito Fiscal Electrónica
  E32: 32, // Factura de Consumo Electrónica
  E33: 33, // Nota de Débito Electrónica
  E34: 34, // Nota de Crédito Electrónica
  E41: 41, // Comprobante de Compras Electrónico
  E43: 43, // Comprobante de Gastos Menores Electrónico
  E44: 44, // Comprobante de Regímenes Especiales Electrónico
  E45: 45, // Comprobante Gubernamental Electrónico
  E46: 46, // Comprobante para Exportaciones
  E47: 47, // Comprobante para Pagos al Exterior
};

// Mapeo de métodos de pago del sistema a formas de pago DGII
const PAYMENT_METHOD_MAP = {
  'Efectivo': 1,
  'Tarjeta': 2,
  'Transferencia': 3,
  'Cheque': 4,
  'Crédito': 5,
  'Bonos o Certificados de Regalo': 6,
  'Permuta': 7,
  'Otra Forma de Venta': 8,
};

/**
 * Formatea una fecha al formato DD-MM-YYYY requerido por la DGII
 */
function formatDateDGII(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Formatea fecha y hora al formato DD-MM-YYYY HH:mm:ss
 */
function formatDateTimeDGII(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * Calcula el IndicadorFacturacion basado en la tasa de impuesto
 * 0 = No facturable, 1 = Gravado tasa I1 (18%), 2 = Gravado tasa I2 (16%), 3 = Gravado tasa I3 (0%), 4 = Exento
 */
function getIndicadorFacturacion(taxRate) {
  const rate = parseFloat(taxRate);
  if (rate === 18) return 1;  // ITBIS 18%
  if (rate === 16) return 2;  // ITBIS 16%
  if (rate > 0 && rate !== 18 && rate !== 16) return 3; // Otra tasa
  return 4; // Exento
}

/**
 * Construye el objeto IECF a partir de una factura del sistema
 * @param {Object} invoice - Invoice del sistema con items cargados
 * @param {Object} company - Company del sistema
 * @param {string} tipoEcf - Tipo de e-CF (E31, E32, etc.)
 * @param {string} eNcf - e-NCF generado (ej: E310000000001)
 * @param {Object} sequence - EcfSequence con fechaVencimiento
 * @returns {Object} Objeto IECF listo para convertir a XML
 */
export function buildEcfFromInvoice(invoice, company, tipoEcf, eNcf, sequence) {
  const tipoCode = ECF_TYPE_CODES[tipoEcf];
  const fechaEmision = formatDateDGII(invoice.date || new Date());
  const fechaVencimiento = sequence?.fechaVencimiento 
    ? formatDateDGII(sequence.fechaVencimiento) 
    : '';

  // Calcular totales por tasa de ITBIS
  const totalesPorTasa = calcularTotalesPorTasa(invoice.items || []);

  // Determinar forma de pago
  const formaPago = PAYMENT_METHOD_MAP[invoice.paymentMethod] || 1;

  // Construir el objeto ECF según la interfaz IECF
  const ecfData = {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: {
          TipoeCF: String(tipoCode),
          eNCF: eNcf,
          FechaVencimientoSecuencia: fechaVencimiento,
          IndicadorMontoGravado: '0',
          TipoIngresos: '01', // Ingresos por operaciones (no financieros)
          TipoPago: invoice.paymentMethod === 'Crédito' ? '2' : '1', // 1=Contado, 2=Crédito
          TablaFormasPago: {
            FormaDePago: {
              FormaPago: String(formaPago),
              MontoPago: String(parseFloat(invoice.total).toFixed(2)),
            },
          },
        },
        Emisor: {
          RNCEmisor: company.rnc || '',
          RazonSocialEmisor: company.name || '',
          NombreComercial: company.name || '',
          DireccionEmisor: company.address || '',
          FechaEmision: fechaEmision,
        },
        Totales: {
          MontoGravadoTotal: String(totalesPorTasa.montoGravadoTotal.toFixed(2)),
          MontoGravadoI1: String(totalesPorTasa.montoGravadoI1.toFixed(2)),
          MontoExento: String(totalesPorTasa.montoExento.toFixed(2)),
          ITBIS1: '18',
          TotalITBIS: String(totalesPorTasa.totalITBIS.toFixed(2)),
          TotalITBIS1: String(totalesPorTasa.totalITBIS1.toFixed(2)),
          MontoTotal: String(parseFloat(invoice.total).toFixed(2)),
        },
      },
      DetallesItems: {
        Item: buildItems(invoice.items || []),
      },
      FechaHoraFirma: formatDateTimeDGII(new Date()),
    },
  };

  // Agregar datos del comprador (obligatorio para E31, opcional para E32)
  if (tipoCode === 31 || (tipoCode === 32 && invoice.customerRnc)) {
    ecfData.ECF.Encabezado.Comprador = {};
    if (invoice.customerRnc) {
      ecfData.ECF.Encabezado.Comprador.RNCComprador = invoice.customerRnc;
    }
    if (invoice.customerName || invoice.customer?.name) {
      ecfData.ECF.Encabezado.Comprador.RazonSocialComprador = 
        invoice.customerName || invoice.customer?.name || '';
    }
  }

  // Si es E32 y monto < 250,000 RD$, solo se envía el resumen (RFCE), no el ECF completo
  // Eso se maneja en ecfService.js

  // Agregar MontoGravadoI2 y TotalITBIS2 si hay items al 16%
  if (totalesPorTasa.montoGravadoI2 > 0) {
    ecfData.ECF.Encabezado.Totales.MontoGravadoI2 = String(totalesPorTasa.montoGravadoI2.toFixed(2));
    ecfData.ECF.Encabezado.Totales.ITBIS2 = '16';
    ecfData.ECF.Encabezado.Totales.TotalITBIS2 = String(totalesPorTasa.totalITBIS2.toFixed(2));
  }

  // Agregar info de emisor adicional si existe
  if (company.phone) {
    ecfData.ECF.Encabezado.Emisor.TablaTelefonoEmisor = {
      TelefonoEmisor: [company.phone],
    };
  }
  if (company.email) {
    ecfData.ECF.Encabezado.Emisor.CorreoEmisor = company.email;
  }

  // Limpiar valores vacíos/nulos
  return removeEmptyValues(ecfData);
}

/**
 * Construye la lista de items del ECF a partir de InvoiceItems
 */
function buildItems(invoiceItems) {
  return invoiceItems.map((item, index) => {
    const indicador = getIndicadorFacturacion(item.taxRate);
    const unitPrice = parseFloat(item.unitPrice);
    const quantity = parseInt(item.quantity);
    const discountPercent = parseFloat(item.discountPercent || 0);
    const subtotalBeforeDiscount = unitPrice * quantity;
    const discountAmount = subtotalBeforeDiscount * (discountPercent / 100);
    const montoItem = subtotalBeforeDiscount - discountAmount;

    const ecfItem = {
      NumeroLinea: String(index + 1),
      IndicadorFacturacion: String(indicador),
      NombreItem: (item.productName || '').substring(0, 80),
      IndicadorBienoServicio: '1', // 1=Bien, 2=Servicio
      CantidadItem: String(quantity),
      UnidadMedida: '1', // 1=Unidad
      PrecioUnitarioItem: String(unitPrice.toFixed(2)),
      MontoItem: String(montoItem.toFixed(2)),
    };

    // Agregar descuento si aplica
    if (discountAmount > 0) {
      ecfItem.DescuentoMonto = String(discountAmount.toFixed(2));
    }

    return ecfItem;
  });
}

/**
 * Calcula los totales desglosados por tasa de ITBIS
 */
function calcularTotalesPorTasa(items) {
  let montoGravadoI1 = 0; // 18%
  let montoGravadoI2 = 0; // 16%
  let montoGravadoI3 = 0; // Otra tasa
  let montoExento = 0;
  let totalITBIS1 = 0;
  let totalITBIS2 = 0;
  let totalITBIS3 = 0;

  for (const item of items) {
    const rate = parseFloat(item.taxRate);
    const unitPrice = parseFloat(item.unitPrice);
    const quantity = parseInt(item.quantity);
    const discountPercent = parseFloat(item.discountPercent || 0);
    const subtotal = unitPrice * quantity;
    const discount = subtotal * (discountPercent / 100);
    const base = subtotal - discount;

    if (rate === 18) {
      montoGravadoI1 += base;
      totalITBIS1 += base * 0.18;
    } else if (rate === 16) {
      montoGravadoI2 += base;
      totalITBIS2 += base * 0.16;
    } else if (rate > 0) {
      montoGravadoI3 += base;
      totalITBIS3 += base * (rate / 100);
    } else {
      montoExento += base;
    }
  }

  return {
    montoGravadoTotal: montoGravadoI1 + montoGravadoI2 + montoGravadoI3,
    montoGravadoI1,
    montoGravadoI2,
    montoGravadoI3,
    montoExento,
    totalITBIS: totalITBIS1 + totalITBIS2 + totalITBIS3,
    totalITBIS1,
    totalITBIS2,
    totalITBIS3,
  };
}

/**
 * Construye un objeto ECF para Nota de Crédito (E34) o Nota de Débito (E33)
 */
export function buildEcfFromNote(note, originalInvoice, company, tipoEcf, eNcf, sequence) {
  const ecfData = buildEcfFromInvoice(
    { ...originalInvoice, total: note.amount, items: originalInvoice.items || [] },
    company, tipoEcf, eNcf, sequence
  );

  // Agregar información de referencia al NCF modificado
  ecfData.ECF.InformacionReferencia = {
    NCFModificado: originalInvoice.ncfNumber || originalInvoice.ecfDocuments?.[0]?.eNcf || '',
    FechaNCFModificado: formatDateDGII(originalInvoice.date),
    CodigoModificacion: tipoEcf === 'E34' ? '1' : '1', // 1=Disminución de ventas
  };

  if (note.reason) {
    ecfData.ECF.InformacionReferencia.RazonModificacion = note.reason;
  }

  return removeEmptyValues(ecfData);
}

/**
 * Convierte el objeto IECF a XML usando Transformer de dgii-ecf
 */
export function ecfToXml(ecfObject) {
  const transformer = new Transformer();
  return transformer.json2xml(ecfObject, true); // true = round decimals to 2 places
}

/**
 * Elimina valores vacíos, null y undefined recursivamente
 */
function removeEmptyValues(obj) {
  if (Array.isArray(obj)) {
    return obj
      .map(item => removeEmptyValues(item))
      .filter(item => item !== null && item !== undefined && item !== '');
  }
  
  if (obj && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined || value === '') continue;
      const cleanedValue = removeEmptyValues(value);
      if (cleanedValue !== null && cleanedValue !== undefined && cleanedValue !== '') {
        if (typeof cleanedValue === 'object' && !Array.isArray(cleanedValue) && Object.keys(cleanedValue).length === 0) continue;
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }
  
  return obj;
}

export default {
  buildEcfFromInvoice,
  buildEcfFromNote,
  ecfToXml,
  ECF_TYPE_CODES,
  PAYMENT_METHOD_MAP,
  formatDateDGII,
  formatDateTimeDGII,
};
