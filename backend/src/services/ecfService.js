/**
 * ecfService.js
 * Servicio orquestador para e-CF usando el paquete dgii-ecf.
 * Maneja: autenticación, firma, envío, consulta de estado, generación de e-NCF.
 */
import ECF, { P12Reader, Signature, ENVIRONMENT } from 'dgii-ecf';
import { getCodeSixDigitfromSignature, convertECF32ToRFCE, generateEcfQRCodeURL, generateFcQRCodeURL } from 'dgii-ecf';
import prisma from '../db.js';
import { buildEcfFromInvoice, buildEcfFromNote, ecfToXml } from './ecfXmlBuilder.js';

// Mapeo de ambiente del sistema al enum ENVIRONMENT de dgii-ecf
const ENV_MAP = {
  test: ENVIRONMENT.DEV,        // TesteCF
  certification: ENVIRONMENT.CERT, // CerteCF
  production: ENVIRONMENT.PROD,    // eCF
};

/**
 * Lee el certificado de la empresa y retorna las credenciales
 */
function getCertCredentials(company) {
  if (!company.ecfCertificateB64 || !company.ecfCertificatePass) {
    throw new Error('Certificado digital no configurado. Configure el certificado .p12 en la sección de Facturación Electrónica.');
  }

  const reader = new P12Reader(company.ecfCertificatePass);
  const certs = reader.getKeyFromStringBase64(company.ecfCertificateB64);

  if (!certs.key || !certs.cert) {
    throw new Error('No se pudo leer el certificado digital. Verifique que el archivo y la contraseña sean correctos.');
  }

  return certs;
}

/**
 * Obtiene la instancia ECF autenticada para una empresa
 */
async function getAuthenticatedEcf(company) {
  const certs = getCertCredentials(company);
  const env = ENV_MAP[company.ecfEnvironment] || ENVIRONMENT.DEV;
  const ecf = new ECF(certs, env);
  
  await ecf.authenticate();
  
  return { ecf, certs, env };
}

/**
 * Genera un e-NCF de 13 posiciones: E + 2 dígitos tipo + 10 dígitos secuencial
 * Ejemplo: E310000000001
 */
async function generateENCF(companyId, tipoEcf) {
  const typeCode = tipoEcf.replace('E', ''); // "31", "32", etc.

  // Buscar secuencia activa
  const sequence = await prisma.ecfSequence.findUnique({
    where: { companyId_tipoEcf: { companyId, tipoEcf } },
  });

  if (!sequence) {
    throw new Error(`No hay secuencia configurada para e-CF tipo ${tipoEcf}. Configure las secuencias en Gestión Fiscal.`);
  }

  if (sequence.estado !== 'activa') {
    throw new Error(`La secuencia de ${tipoEcf} está ${sequence.estado}. Active o renueve la secuencia.`);
  }

  // Verificar vencimiento
  if (sequence.fechaVencimiento && new Date(sequence.fechaVencimiento) < new Date()) {
    await prisma.ecfSequence.update({
      where: { id: sequence.id },
      data: { estado: 'vencida' },
    });
    throw new Error(`La secuencia de ${tipoEcf} ha vencido. Renueve la autorización con la DGII.`);
  }

  // Verificar rango
  if (sequence.rangoHasta > 0 && sequence.secuencial > sequence.rangoHasta) {
    await prisma.ecfSequence.update({
      where: { id: sequence.id },
      data: { estado: 'agotada' },
    });
    throw new Error(`La secuencia de ${tipoEcf} se ha agotado. Solicite un nuevo rango a la DGII.`);
  }

  const secuencialStr = String(sequence.secuencial).padStart(10, '0');
  const eNcf = `E${typeCode}${secuencialStr}`;

  // Incrementar secuencial
  await prisma.ecfSequence.update({
    where: { id: sequence.id },
    data: { secuencial: sequence.secuencial + 1 },
  });

  return { eNcf, sequence };
}

/**
 * Emite un e-CF para una factura existente
 * Flujo: Invoice → JSON IECF → XML → Firma → Envío DGII → TrackId
 */
export async function emitEcf(invoiceId, tipoEcf, companyId) {
  // 1. Obtener factura con items y empresa
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, customer: true, company: true },
  });

  if (!invoice) throw new Error('Factura no encontrada');
  if (invoice.companyId !== companyId) throw new Error('Factura no pertenece a esta empresa');
  
  const company = invoice.company;
  if (!company.ecfEnabled) throw new Error('La facturación electrónica no está habilitada');

  // 2. Generar e-NCF
  const { eNcf, sequence } = await generateENCF(companyId, tipoEcf);

  // 3. Construir JSON IECF y convertir a XML
  const ecfObject = buildEcfFromInvoice(invoice, company, tipoEcf, eNcf, sequence);
  const xmlContent = ecfToXml(ecfObject);

  // 4. Firmar el XML
  const certs = getCertCredentials(company);
  const signature = new Signature(certs.key, certs.cert);
  const xmlSigned = signature.signXml(xmlContent, 'ECF');

  // 5. Extraer código de seguridad
  const securityCode = getCodeSixDigitfromSignature(xmlSigned);

  // 6. Crear registro EcfDocument
  const ecfDoc = await prisma.ecfDocument.create({
    data: {
      companyId,
      invoiceId,
      tipoEcf,
      eNcf,
      xmlContent,
      xmlSigned,
      securityCode,
      rncEmisor: company.rnc || '',
      rncComprador: invoice.customerRnc || null,
      nombreComprador: invoice.customerName || invoice.customer?.name || null,
      montoTotal: invoice.total,
      itbisTotal: invoice.taxAmount,
      fechaEmision: invoice.date,
      dgiiStatus: 'pendiente',
    },
  });

  // 7. Enviar a la DGII
  try {
    const { ecf: ecfClient } = await getAuthenticatedEcf(company);
    const fileName = `${company.rnc}${eNcf}.xml`;
    
    let response;
    
    // Para E32 (Factura de Consumo) < 250K DOP, enviar como resumen (RFCE)
    const montoTotal = parseFloat(invoice.total);
    if (tipoEcf === 'E32' && montoTotal < 250000) {
      const rfceData = convertECF32ToRFCE(xmlSigned);
      const rfceSigned = signature.signXml(rfceData.xml, 'RFCE');
      response = await ecfClient.sendSummary(rfceSigned, fileName);
      
      // Para facturas de consumo < 250K aceptadas, el status viene directo
      await prisma.ecfDocument.update({
        where: { id: ecfDoc.id },
        data: {
          dgiiStatus: response?.estado?.toLowerCase() === 'aceptado' ? 'aceptado' : 'enviado',
          dgiiMessage: response?.mensajes?.[0]?.valor || null,
          securityCode: rfceData.securityCode,
          enviadoAt: new Date(),
          ...(response?.estado?.toLowerCase() === 'aceptado' ? { aceptadoAt: new Date() } : {}),
        },
      });
    } else {
      // Enviar ECF completo (E31, E32 >= 250K, E33, E34, etc.)
      response = await ecfClient.sendElectronicDocument(xmlSigned, fileName);
      
      await prisma.ecfDocument.update({
        where: { id: ecfDoc.id },
        data: {
          trackId: response?.trackId || null,
          dgiiStatus: response?.trackId ? 'enviado' : 'pendiente',
          dgiiMessage: response?.mensajes?.[0]?.valor || response?.error || null,
          enviadoAt: new Date(),
        },
      });
    }

    // 8. Actualizar la factura con el e-NCF
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ncfNumber: eNcf,
        ncfType: tipoEcf,
      },
    });

    return {
      success: true,
      ecfDocument: await prisma.ecfDocument.findUnique({ where: { id: ecfDoc.id } }),
      response,
    };
  } catch (error) {
    // Guardar error pero no perder el documento
    await prisma.ecfDocument.update({
      where: { id: ecfDoc.id },
      data: {
        dgiiStatus: 'error',
        dgiiMessage: error.message || 'Error al enviar a la DGII',
      },
    });

    // Aún así actualizar el NCF en la factura (ya fue generado)
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { ncfNumber: eNcf, ncfType: tipoEcf },
    });

    return {
      success: false,
      ecfDocument: await prisma.ecfDocument.findUnique({ where: { id: ecfDoc.id } }),
      error: error.message,
    };
  }
}

/**
 * Consulta el estado de un documento por TrackId
 */
export async function checkTrackIdStatus(ecfDocumentId, companyId) {
  const ecfDoc = await prisma.ecfDocument.findUnique({
    where: { id: ecfDocumentId },
    include: { company: true },
  });

  if (!ecfDoc) throw new Error('Documento e-CF no encontrado');
  if (ecfDoc.companyId !== companyId) throw new Error('Documento no pertenece a esta empresa');
  if (!ecfDoc.trackId) throw new Error('Este documento no tiene TrackId asignado');

  const { ecf: ecfClient } = await getAuthenticatedEcf(ecfDoc.company);
  const response = await ecfClient.statusTrackId(ecfDoc.trackId);

  // Mapear estado de la DGII
  const statusMap = {
    'Aceptado': 'aceptado',
    'Rechazado': 'rechazado',
    'En Proceso': 'en_proceso',
    'Aceptado Condicional': 'aceptado_condicional',
    'No encontrado': 'enviado',
  };

  const newStatus = statusMap[response?.estado] || ecfDoc.dgiiStatus;

  await prisma.ecfDocument.update({
    where: { id: ecfDoc.id },
    data: {
      dgiiStatus: newStatus,
      dgiiMessage: response?.mensajes?.[0]?.valor || null,
      ...(newStatus === 'aceptado' ? { aceptadoAt: new Date() } : {}),
      ...(newStatus === 'rechazado' ? { rechazadoAt: new Date() } : {}),
    },
  });

  return {
    document: await prisma.ecfDocument.findUnique({ where: { id: ecfDoc.id } }),
    dgiiResponse: response,
  };
}

/**
 * Reintenta el envío de un documento fallido
 */
// Una factura cuenta como facturada solo si la DGII recibió su e-CF. Si no llegó o fue rechazado,
// vuelve a quedar pendiente de facturar (el documento queda guardado para reintentar o revisar).
const ECF_RECEIVED = ['enviado', 'en_proceso', 'aceptado', 'aceptado_condicional'];

export async function syncInvoiceWithEcf(ecfDocumentId) {
  const doc = await prisma.ecfDocument.findUnique({ where: { id: ecfDocumentId } });
  if (!doc?.invoiceId) return null;
  const invoice = await prisma.invoice.findUnique({ where: { id: doc.invoiceId } });
  if (!invoice) return null;
  const received = ECF_RECEIVED.includes(doc.dgiiStatus);
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: received
      ? { isBilled: true, billedDate: invoice.billedDate || new Date(), invoiceNumber: invoice.orderNumber, ncfNumber: doc.eNcf, ncfType: doc.tipoEcf }
      : { isBilled: false, billedDate: null, ncfNumber: null, ncfType: null },
    include: { items: true, ecfDocuments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
}

export async function retryEcfSend(ecfDocumentId, companyId) {
  const ecfDoc = await prisma.ecfDocument.findUnique({
    where: { id: ecfDocumentId },
    include: { company: true },
  });

  if (!ecfDoc) throw new Error('Documento e-CF no encontrado');
  if (ecfDoc.companyId !== companyId) throw new Error('Documento no pertenece a esta empresa');
  if (!['error', 'pendiente', 'rechazado'].includes(ecfDoc.dgiiStatus)) {
    throw new Error('Solo se pueden reintentar documentos con error, pendientes o rechazados');
  }
  if (!ecfDoc.xmlSigned) throw new Error('No hay XML firmado disponible para reenviar');

  const company = ecfDoc.company;
  const { ecf: ecfClient } = await getAuthenticatedEcf(company);
  const certs = getCertCredentials(company);
  const signature = new Signature(certs.key, certs.cert);
  const fileName = `${company.rnc}${ecfDoc.eNcf}.xml`;

  try {
    let response;
    const montoTotal = parseFloat(ecfDoc.montoTotal);

    if (ecfDoc.tipoEcf === 'E32' && montoTotal < 250000) {
      const rfceData = convertECF32ToRFCE(ecfDoc.xmlSigned);
      const rfceSigned = signature.signXml(rfceData.xml, 'RFCE');
      response = await ecfClient.sendSummary(rfceSigned, fileName);

      await prisma.ecfDocument.update({
        where: { id: ecfDoc.id },
        data: {
          dgiiStatus: response?.estado?.toLowerCase() === 'aceptado' ? 'aceptado' : 'enviado',
          dgiiMessage: response?.mensajes?.[0]?.valor || null,
          enviadoAt: new Date(),
          ...(response?.estado?.toLowerCase() === 'aceptado' ? { aceptadoAt: new Date() } : {}),
        },
      });
    } else {
      response = await ecfClient.sendElectronicDocument(ecfDoc.xmlSigned, fileName);

      await prisma.ecfDocument.update({
        where: { id: ecfDoc.id },
        data: {
          trackId: response?.trackId || ecfDoc.trackId,
          dgiiStatus: response?.trackId ? 'enviado' : 'pendiente',
          dgiiMessage: response?.mensajes?.[0]?.valor || response?.error || null,
          enviadoAt: new Date(),
        },
      });
    }

    return {
      success: true,
      document: await prisma.ecfDocument.findUnique({ where: { id: ecfDoc.id } }),
      response,
    };
  } catch (error) {
    await prisma.ecfDocument.update({
      where: { id: ecfDoc.id },
      data: {
        dgiiStatus: 'error',
        dgiiMessage: error.message || 'Error al reintentar envío',
      },
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Genera la URL del QR para un documento e-CF
 */
export function getQRCodeUrl(ecfDoc, company, environment) {
  const env = ENV_MAP[environment] || ENVIRONMENT.DEV;

  if (ecfDoc.tipoEcf === 'E32') {
    return generateFcQRCodeURL(
      ecfDoc.rncEmisor,
      ecfDoc.eNcf,
      parseFloat(ecfDoc.montoTotal),
      ecfDoc.securityCode || '',
      env
    );
  }

  return generateEcfQRCodeURL(
    ecfDoc.rncEmisor,
    ecfDoc.rncComprador || '',
    ecfDoc.eNcf,
    String(parseFloat(ecfDoc.montoTotal)),
    ecfDoc.fechaEmision ? new Date(ecfDoc.fechaEmision).toLocaleDateString('es-DO') : '',
    '', // fechaFirma — se obtendría del XML firmado
    ecfDoc.securityCode || '',
    env
  );
}

/**
 * Prueba la conexión con la DGII usando el certificado configurado
 */
export async function testConnection(companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Empresa no encontrada');

  try {
    const certs = getCertCredentials(company);
    const env = ENV_MAP[company.ecfEnvironment] || ENVIRONMENT.DEV;
    const ecf = new ECF(certs, env);
    const tokenData = await ecf.authenticate();

    return {
      success: true,
      environment: company.ecfEnvironment,
      token: tokenData?.token ? '***' + tokenData.token.slice(-10) : null,
      expira: tokenData?.expira,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      environment: company.ecfEnvironment,
    };
  }
}

/**
 * Obtiene información del certificado digital
 */
export function getCertificateInfo(company) {
  if (!company.ecfCertificateB64 || !company.ecfCertificatePass) {
    return null;
  }

  try {
    const reader = new P12Reader(company.ecfCertificatePass);
    const info = reader.getCertificateInfoFromBase64(company.ecfCertificateB64);
    return {
      subject: info.subject,
      issuer: info.issuer,
      validFrom: info.validFrom,
      validTo: info.validTo,
      serialNumber: info.serialNumber,
      isExpired: new Date(info.validTo) < new Date(),
    };
  } catch (error) {
    return { error: error.message };
  }
}

export default {
  emitEcf,
  checkTrackIdStatus,
  syncInvoiceWithEcf,
  retryEcfSend,
  generateENCF,
  getQRCodeUrl,
  testConnection,
  getCertificateInfo,
};
