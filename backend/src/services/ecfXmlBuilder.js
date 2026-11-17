/**
 * ecfXmlBuilder.js
 * Mapea Invoice del sistema al formato IECF de dgii-ecf para generar XML válido DGII.
 */
import { Transformer } from 'dgii-ecf';
import { lineAmounts, netUnitPrice, round2 } from './tax.js';

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
  const items = invoiceLines(invoice);
  const tipoCode = ECF_TYPE_CODES[tipoEcf];
  const fechaEmision = formatDateDGII(invoice.date || new Date());
  // Formato e-CF v1.0: la fecha de vencimiento "no corresponde" en la factura de consumo (32) ni en la nota de crédito (34)
  const fechaVencimiento = sequence?.fechaVencimiento && !SIN_VENCIMIENTO.includes(tipoCode)
    ? formatDateDGII(sequence.fechaVencimiento, 'UTC')
    : '';

  // Calcular totales por tasa de ITBIS
  const totalesPorTasa = calcularTotalesPorTasa(items);

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
              MontoPago: totalesPorTasa.montoTotal.toFixed(2),
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
          MontoTotal: totalesPorTasa.montoTotal.toFixed(2),
        },
      },
      DetallesItems: {
        Item: buildItems(items),
      },
      FechaHoraFirma: formatDateTimeDGII(new Date()),
    },
  };

  // Datos del comprador: obligatorios en E31, E44 y E45; en E32 y en las notas E33/E34, cuando la venta tiene RNC
  if ([31, 44, 45].includes(tipoCode) || ([32, 33, 34].includes(tipoCode) && invoice.customerRnc)) {
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
    const quantity = Number(item.quantity);
    const { base } = lineCalc(item);
    // Lo que la base difiere de cantidad x precio es descuento (o recargo, si una nota de débito supera la venta)
    const adjust = round2(quantity * item.unitPrice - base);

    // El XSD exige DescuentoMonto y RecargoMonto entre PrecioUnitarioItem y MontoItem
    return {
      NumeroLinea: String(index + 1),
      IndicadorFacturacion: String(getIndicadorFacturacion(item.taxRate)),
      NombreItem: (item.productName || '').substring(0, 80),
      IndicadorBienoServicio: '1', // 1=Bien, 2=Servicio
      CantidadItem: String(quantity),
      UnidadMedida: '43', // Tabla IV del Formato e-CF: 43 = Unidad (1 es Barril)
      PrecioUnitarioItem: item.unitPrice.toFixed(2),
      ...(adjust > 0 ? { DescuentoMonto: adjust.toFixed(2) } : {}),
      ...(adjust < 0 ? { RecargoMonto: (-adjust).toFixed(2) } : {}),
      MontoItem: base.toFixed(2),
    };
  });
}

/**
 * Lleva todas las líneas a precio sin ITBIS. La base de cada línea es la guardada en `subtotal` (ya con descuento):
 * el discountPercent guardado tiene 2 decimales y recalcular con él puede dar otro centavo.
 * Las facturas con ITBIS incluido (pricesIncludeTax) conservan además lo cobrado por línea (storedGross).
 */
function normalizeItems(items, pricesIncludeTax) {
  return items.map((i) => {
    const item = { ...i, quantity: Number(i.quantity), taxRate: Number(i.taxRate || 0), discountPercent: Number(i.discountPercent || 0), unitPrice: Number(i.unitPrice) };
    if (i.subtotal != null && i.subtotal !== '') item.storedBase = round2(Number(i.subtotal));
    if (!pricesIncludeTax) return item;
    const storedGross = round2(item.quantity * item.unitPrice * (1 - item.discountPercent / 100));
    return { ...item, unitPrice: netUnitPrice(item, true), storedGross };
  });
}

// Base e ITBIS de una línea; fuente única para los ítems y los totales
function lineCalc(item) {
  if (item.storedBase === undefined) return lineAmounts(item);
  const base = item.storedBase;
  if (!(item.taxRate > 0)) return { base, itbis: 0 };
  // Línea con ITBIS incluido: el ITBIS es lo cobrado menos la base, así la línea suma exactamente lo cobrado
  return { base, itbis: item.storedGross !== undefined ? round2(item.storedGross - base) : round2((base * item.taxRate) / 100) };
}

// Líneas que declara el XML de una factura: sin ITBIS y, con cupón, rebajadas al total cobrado
function invoiceLines(invoice) {
  const items = normalizeItems(invoice.items || [], invoice.pricesIncludeTax);
  if (!(Number(invoice.discountAmount) > 0)) return items;
  return scaleToTotal(items.map((i) => ({ ...i, net: lineCalc(i).base })), Number(invoice.total));
}

/**
 * Base e ITBIS que declara el e-CF de una factura con cupón (discountAmount y total ya rebajado).
 * El PUT del cupón los guarda en subtotal/taxAmount para que el 607 y el e-CF digan lo mismo.
 */
export function discountedAmounts(invoice) {
  const t = calcularTotalesPorTasa(invoiceLines(invoice));
  return { subtotal: round2(t.montoGravadoTotal + t.montoExento), taxAmount: t.totalITBIS };
}

/**
 * Reparte `target` (total con ITBIS) entre las líneas en proporción a su monto con ITBIS (`net` = base de la línea).
 * Cada línea conserva su precio unitario sin ITBIS (`unitPrice`); la rebaja queda como descuento de la línea.
 * El centavo que sobra del redondeo va en la línea más grande, así el total queda a un centavo o menos de `target`.
 * Sin líneas con monto, una línea exenta de ajuste. Usado por las notas y por facturas con cupón.
 */
function scaleToTotal(lines, target, reason = 'Ajuste') {
  const rate = (l) => Number(l.taxRate || 0);
  const withTax = lines.reduce((sum, l) => sum + l.net * (1 + rate(l) / 100), 0);
  if (!(withTax > 0) || !(target > 0)) {
    return [{ productName: reason, quantity: 1, taxRate: 0, discountPercent: 0, unitPrice: round2(target) }];
  }
  const factor = target / withTax;
  const out = lines.map((l) => ({ productName: l.productName, quantity: Number(l.quantity), taxRate: rate(l), discountPercent: 0, unitPrice: Number(l.unitPrice), storedBase: round2(l.net * factor) }));
  const gross = (l, base = l.storedBase) => base + round2((base * l.taxRate) / 100);
  const bySize = [...out].sort((a, b) => b.storedBase - a.storedBase);
  const largest = bySize[0];
  for (let i = bySize.length - 1; ; i--) {
    const rest = out.reduce((sum, l) => (l === largest ? sum : sum + gross(l)), 0);
    // Base de la línea más grande que deja el total más cerca de target (con ITBIS no todo total existe al centavo)
    const ideal = Math.max(0, round2((target - rest) / (1 + largest.taxRate / 100)));
    const off = (b) => Math.abs(round2(rest + gross(largest, b) - target));
    largest.storedBase = [ideal, round2(ideal - 0.01), round2(ideal + 0.01)].filter((b) => b >= 0).reduce((a, b) => (off(b) < off(a) ? b : a));
    if (off(largest.storedBase) <= 0.01 || i < 1) break;
    // Nota pequeña sobre muchas líneas: los centavos redondeados de las demás ya pasan target; se quita la más pequeña
    bySize[i].storedBase = 0;
  }
  // Una nota pequeña deja en cero algunas líneas: no se declaran (las de precio cero desde la venta sí)
  const kept = out.filter((l, i) => l.storedBase > 0 || !(lines[i].net > 0));
  return kept.length ? kept : out;
}

/**
 * Calcula los totales desglosados por tasa de ITBIS, redondeando cada línea
 */
function calcularTotalesPorTasa(items) {
  const t = { montoGravadoI1: 0, montoGravadoI2: 0, montoGravadoI3: 0, montoExento: 0, totalITBIS1: 0, totalITBIS2: 0, totalITBIS3: 0 };

  for (const item of items) {
    const rate = item.taxRate;
    const { base, itbis } = lineCalc(item);
    if (rate === 18) { t.montoGravadoI1 += base; t.totalITBIS1 += itbis; }
    else if (rate === 16) { t.montoGravadoI2 += base; t.totalITBIS2 += itbis; }
    else if (rate > 0) { t.montoGravadoI3 += base; t.totalITBIS3 += itbis; }
    else t.montoExento += base;
  }

  for (const k of Object.keys(t)) t[k] = round2(t[k]);
  const montoGravadoTotal = round2(t.montoGravadoI1 + t.montoGravadoI2 + t.montoGravadoI3);
  const totalITBIS = round2(t.totalITBIS1 + t.totalITBIS2 + t.totalITBIS3);
  return { ...t, montoGravadoTotal, totalITBIS, montoTotal: round2(montoGravadoTotal + t.montoExento + totalITBIS) };
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
  const unit = (i) => netUnitPrice({ unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate || 0) }, !!originalInvoice.pricesIncludeTax);
  const amount = parseFloat(note.amount);
  const items = scaleToTotal(source.map((i) => ({ ...i, unitPrice: unit(i), net: unit(i) * (1 - parseFloat(i.discountPercent || 0) / 100) * parseInt(i.quantity) })), amount, note.reason || 'Ajuste');

  // Las líneas ya van sin ITBIS: no se normalizan de nuevo
  const ecfData = buildEcfFromInvoice({ ...originalInvoice, pricesIncludeTax: false, discountAmount: 0, date: noteDate, items }, company, tipoEcf, eNcf, sequence);
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
 * Construye el e-CF que emite la empresa al comprar (Formato e-CF v1.0):
 * - E41 Compras: el vendedor (persona sin RNC/comprobante) va en Comprador; retención por línea obligatoria.
 * - E43 Gastos Menores: sin comprador ni retenciones; todas las líneas exentas.
 * - E47 Pagos al Exterior: líneas exentas; retención de ISR obligatoria.
 * Ninguno lleva TipoIngresos. Las líneas son "Bienes" y "Servicios" según los montos del gasto.
 */
export function buildEcfFromExpense(expense, company, tipoEcf, eNcf, sequence) {
  const tipoCode = ECF_TYPE_CODES[tipoEcf];
  const n = (v) => Number(v || 0);
  const exento = tipoCode !== 41; // nota 50 del formato: 43 y 47 siempre exentos
  const bienes = n(expense.montoBienes);
  const servicios = n(expense.montoServicios);
  const base = bienes + servicios;
  const itbis = exento ? 0 : n(expense.itbisFacturado);
  const gravado = itbis > 0;
  const itbisRetenido = exento ? 0 : n(expense.itbisRetenido);
  const isrRetenido = tipoCode === 43 ? 0 : n(expense.montoRetencionIsr);
  const conRetencion = tipoCode === 41 || tipoCode === 47;
  const nombre = (expense.description || '').substring(0, 80);

  const lineas = [
    { tipo: 1, monto: bienes, nombre: nombre || 'Bienes' },
    { tipo: 2, monto: servicios, nombre: nombre || 'Servicios' },
  ].filter((l) => l.monto > 0);
  const items = lineas.map((l, i) => {
    const item = { NumeroLinea: String(i + 1), IndicadorFacturacion: gravado ? '1' : '4' };
    if (conRetencion) {
      item.Retencion = { IndicadorAgenteRetencionoPercepcion: '1' };
      // El ITBIS retenido se reparte según el peso de cada línea; el ISR retenido va en los servicios
      if (tipoCode === 41) item.Retencion.MontoITBISRetenido = (base > 0 ? (itbisRetenido * l.monto) / base : 0).toFixed(2);
      if (l.tipo === 2 || (tipoCode === 47 && servicios === 0)) item.Retencion.MontoISRRetenido = isrRetenido.toFixed(2);
    }
    return {
      ...item,
      NombreItem: l.nombre,
      IndicadorBienoServicio: String(l.tipo),
      CantidadItem: '1',
      UnidadMedida: '43',
      PrecioUnitarioItem: l.monto.toFixed(2),
      MontoItem: l.monto.toFixed(2),
    };
  });

  const formaPago = String(expense.paymentType || '01').slice(0, 2);
  const totales = gravado
    ? { MontoGravadoTotal: base.toFixed(2), MontoGravadoI1: base.toFixed(2), ITBIS1: '18', TotalITBIS: itbis.toFixed(2), TotalITBIS1: itbis.toFixed(2) }
    : { MontoExento: base.toFixed(2) };
  totales.MontoTotal = (base + itbis).toFixed(2);
  if (tipoCode === 41) totales.TotalITBISRetenido = itbisRetenido.toFixed(2);
  if (conRetencion) totales.TotalISRRetencion = isrRetenido.toFixed(2);

  const idDoc = {
    TipoeCF: String(tipoCode),
    eNCF: eNcf,
    FechaVencimientoSecuencia: sequence?.fechaVencimiento ? formatDateDGII(sequence.fechaVencimiento, 'UTC') : '',
    ...(tipoCode === 41 ? { IndicadorMontoGravado: '0' } : {}),
    TipoPago: formaPago === '04' ? '2' : '1', // 04 en el 606 = compra a crédito
    ...(formaPago === '04' && expense.paymentDate ? { FechaLimitePago: formatDateDGII(expense.paymentDate) } : {}),
  };

  const ecfData = {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: idDoc,
        Emisor: {
          RNCEmisor: company.rnc || '',
          RazonSocialEmisor: company.name || '',
          NombreComercial: company.name || '',
          DireccionEmisor: company.address || '',
          FechaEmision: formatDateDGII(expense.invoiceDate || new Date()),
        },
        // E41: el vendedor informal (cédula); E43 no corresponde; E47 opcional (se omite)
        ...(tipoCode === 41 ? { Comprador: { RNCComprador: String(expense.rncCedula || '').replace(/\D/g, ''), RazonSocialComprador: expense.supplierName || '' } } : {}),
        Totales: totales,
      },
      DetallesItems: { Item: items },
      FechaHoraFirma: formatDateTimeDGII(new Date()),
    },
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
