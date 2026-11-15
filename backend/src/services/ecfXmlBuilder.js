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

// El servidor corre en UTC: sin fijar la zona, una venta después de las 8:00 p. m. salía con la fecha del día siguiente
const RD_TZ = 'America/Santo_Domingo';

// Tipos cuya secuencia no vence (Formato e-CF v1.0, campo FechaVencimientoSecuencia: "0 = no corresponde")
const SIN_VENCIMIENTO = [32, 34];

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date));
  return Object.fromEntries(parts.map((x) => [x.type, x.value]));
}

/**
 * Formatea una fecha al formato DD-MM-YYYY requerido por la DGII, en hora de República Dominicana.
 * Para fechas sin hora guardadas como medianoche UTC (p. ej. el vencimiento de una secuencia) usar timeZone 'UTC'.
 */
export function formatDateDGII(date, timeZone = RD_TZ) {
  const p = dateParts(date, timeZone);
  return `${p.day}-${p.month}-${p.year}`;
}

/**
 * Formatea fecha y hora al formato DD-MM-YYYY HH:mm:ss, en hora de República Dominicana
 */
function formatDateTimeDGII(date) {
  const p = dateParts(date, RD_TZ);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
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
  // Formato e-CF v1.0: la fecha de vencimiento "no corresponde" en la factura de consumo (32) ni en la nota de crédito (34)
  const fechaVencimiento = sequence?.fechaVencimiento && !SIN_VENCIMIENTO.includes(tipoCode)
    ? formatDateDGII(sequence.fechaVencimiento, 'UTC')
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

  // Agregar datos del comprador (obligatorio para E31; en E32 y en las notas E33/E34, cuando la venta tiene RNC)
  if (tipoCode === 31 || ([32, 33, 34].includes(tipoCode) && invoice.customerRnc)) {
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
 * Construye un objeto ECF para Nota de Crédito (E34) o Nota de Débito (E33) según el Formato e-CF v1.0:
 * - Las líneas son las de la factura (o las devueltas) llevadas al monto de la nota, así los totales cuadran.
 * - InformacionReferencia es obligatoria: NCF modificado (e-CF o NCF en papel), su fecha y el código de modificación.
 * - IndicadorNotaCredito (solo E34): 1 si pasaron más de 30 días desde la factura (esa nota no rebaja ITBIS).
 * @param {{ lines?: Array, full?: boolean }} options - lines: artículos devueltos; full: la nota anula la factura
 */
export function buildEcfFromNote(note, originalInvoice, company, tipoEcf, eNcf, sequence, { lines, full = false } = {}) {
  const noteDate = new Date(note.createdAt || Date.now());
  const source = lines?.length ? lines : originalInvoice.items || [];
  const net = (i) => parseFloat(i.unitPrice) * (1 - parseFloat(i.discountPercent || 0) / 100);
  const withTax = source.reduce((sum, i) => sum + net(i) * parseInt(i.quantity) * (1 + parseFloat(i.taxRate || 0) / 100), 0);
  const amount = parseFloat(note.amount);
  const factor = withTax > 0 ? amount / withTax : 0;
  const items = factor > 0
    ? source.map((i) => ({ productName: i.productName, quantity: i.quantity, taxRate: i.taxRate, discountPercent: 0, unitPrice: (net(i) * factor).toFixed(2) }))
    : [{ productName: note.reason || 'Ajuste', quantity: 1, taxRate: 0, discountPercent: 0, unitPrice: amount.toFixed(2) }];
  // El MontoTotal sale de los mismos montos redondeados que van en el XML
  const t = calcularTotalesPorTasa(items);
  const total = [t.montoGravadoTotal, t.montoExento, t.totalITBIS].reduce((sum, n) => sum + Number(n.toFixed(2)), 0);

  const ecfData = buildEcfFromInvoice({ ...originalInvoice, date: noteDate, total, items }, company, tipoEcf, eNcf, sequence);
  const { TablaFormasPago, ...idDoc } = ecfData.ECF.Encabezado.IdDoc; // opcional/no corresponde en notas
  if (tipoEcf === 'E34') {
    const originalDate = new Date(originalInvoice.billedDate || originalInvoice.date);
    const { TipoeCF, eNCF, ...rest } = idDoc;
    ecfData.ECF.Encabezado.IdDoc = { TipoeCF, eNCF, IndicadorNotaCredito: noteDate - originalDate > 30 * 86400000 ? '1' : '0', ...rest };
  } else {
    ecfData.ECF.Encabezado.IdDoc = idDoc;
  }

  // El e-CF guarda como fecha la de la venta; un NCF en papel, la de facturación
  const fechaModificado = String(originalInvoice.ncfNumber || '').startsWith('E') ? originalInvoice.date : (originalInvoice.billedDate || originalInvoice.date);
  // El XSD exige este orden: ... DetallesItems, InformacionReferencia, FechaHoraFirma
  const { FechaHoraFirma, ...body } = ecfData.ECF;
  ecfData.ECF = {
    ...body,
    InformacionReferencia: {
      NCFModificado: originalInvoice.ncfNumber || '',
      FechaNCFModificado: formatDateDGII(fechaModificado),
      CodigoModificacion: tipoEcf === 'E34' && full ? '1' : '3', // 1: anula el NCF modificado; 3: corrige montos
      RazonModificacion: (note.reason || '').substring(0, 90),
    },
    FechaHoraFirma,
  };

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
