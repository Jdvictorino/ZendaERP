/**
 * ecf.js — Rutas API para Facturación Electrónica (e-CF) DGII
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import prisma from '../db.js';
import ecfService from '../services/ecfService.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Configurar e-CF (certificado, secuencias, ambiente) y emitir/reintentar a mano es tarea de gerencia.
// La emisión normal ocurre al facturar (POST /api/invoices/:id/bill), disponible también para cajeros.
const manageEcf = authorize('admin', 'manager');

// =============================================
// CONFIGURACIÓN e-CF
// =============================================

/** GET /api/ecf/config — Obtener configuración e-CF de la empresa */
router.get('/config', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true,
        ecfEnabled: true,
        ecfEnvironment: true,
        ecfCertificateB64: true, // solo chequeamos si existe
        rnc: true,
        name: true,
      },
    });

    const certInfo = company.ecfCertificateB64
      ? ecfService.getCertificateInfo({ ...company, ecfCertificatePass: '***' })
      : null;

    res.json({
      ecfEnabled: company.ecfEnabled,
      ecfEnvironment: company.ecfEnvironment,
      hasCertificate: !!company.ecfCertificateB64,
      certificateInfo: certInfo,
      rnc: company.rnc,
      companyName: company.name,
    });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/ecf/config — Actualizar configuración e-CF */
router.put('/config', manageEcf, async (req, res, next) => {
  try {
    const { ecfEnabled, ecfEnvironment } = req.body;
    const updateData = {};

    if (typeof ecfEnabled === 'boolean') updateData.ecfEnabled = ecfEnabled;
    if (ecfEnvironment && ['test', 'certification', 'production'].includes(ecfEnvironment)) {
      updateData.ecfEnvironment = ecfEnvironment;
    }

    const company = await prisma.company.update({
      where: { id: req.companyId },
      data: updateData,
      select: { ecfEnabled: true, ecfEnvironment: true },
    });

    res.json(company);
  } catch (error) {
    next(error);
  }
});

/** POST /api/ecf/upload-certificate — Subir certificado .p12 */
router.post('/upload-certificate', manageEcf, async (req, res, next) => {
  try {
    const { certificateBase64, password } = req.body;

    if (!certificateBase64 || !password) {
      return res.status(400).json({ error: 'Se requiere el certificado y la contraseña' });
    }

    // Validar que el certificado es legible
    try {
      const { P12Reader } = await import('dgii-ecf');
      const reader = new P12Reader(password);
      const certs = reader.getKeyFromStringBase64(certificateBase64);
      if (!certs.key || !certs.cert) {
        return res.status(400).json({ error: 'No se pudo extraer las credenciales del certificado' });
      }

      // Obtener info del certificado
      const info = reader.getCertificateInfoFromBase64(certificateBase64);
      
      // Verificar expiración
      if (new Date(info.validTo) < new Date()) {
        return res.status(400).json({ 
          error: 'El certificado está vencido',
          validTo: info.validTo,
        });
      }
    } catch (certError) {
      return res.status(400).json({ 
        error: 'Certificado inválido o contraseña incorrecta',
        detail: certError.message,
      });
    }

    // Guardar en BD
    await prisma.company.update({
      where: { id: req.companyId },
      data: {
        ecfCertificateB64: certificateBase64,
        ecfCertificatePass: password, // TODO: Encriptar antes de guardar
      },
    });

    // Retornar info del certificado
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const certInfo = ecfService.getCertificateInfo(company);

    res.json({
      success: true,
      message: 'Certificado configurado exitosamente',
      certificateInfo: certInfo,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /api/ecf/test-connection — Probar conexión con DGII */
router.post('/test-connection', manageEcf, async (req, res, next) => {
  try {
    const result = await ecfService.testConnection(req.companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// =============================================
// SECUENCIAS e-NCF
// =============================================

/** GET /api/ecf/sequences — Listar secuencias */
router.get('/sequences', async (req, res, next) => {
  try {
    const sequences = await prisma.ecfSequence.findMany({
      where: { companyId: req.companyId },
      orderBy: { tipoEcf: 'asc' },
    });
    res.json(sequences);
  } catch (error) {
    next(error);
  }
});

/** POST /api/ecf/sequences — Crear secuencia */
router.post('/sequences', manageEcf, async (req, res, next) => {
  try {
    const { tipoEcf, nombre, rangoDesde, rangoHasta, fechaVencimiento } = req.body;

    if (!tipoEcf || !nombre) {
      return res.status(400).json({ error: 'Tipo e-CF y nombre son requeridos' });
    }

    const sequence = await prisma.ecfSequence.create({
      data: {
        companyId: req.companyId,
        tipoEcf,
        nombre,
        rangoDesde: rangoDesde || 1,
        rangoHasta: rangoHasta || 0,
        secuencial: rangoDesde || 1,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        estado: 'activa',
      },
    });

    res.status(201).json(sequence);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: `Ya existe una secuencia para el tipo ${req.body.tipoEcf}` });
    }
    next(error);
  }
});

/** PUT /api/ecf/sequences/:id — Actualizar secuencia */
router.put('/sequences/:id', manageEcf, async (req, res, next) => {
  try {
    const { nombre, rangoDesde, rangoHasta, secuencial, fechaVencimiento, estado } = req.body;

    const existing = await prisma.ecfSequence.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!existing) return res.status(404).json({ error: 'Secuencia no encontrada' });

    const updateData = {};
    if (nombre) updateData.nombre = nombre;
    if (rangoDesde !== undefined) updateData.rangoDesde = rangoDesde;
    if (rangoHasta !== undefined) updateData.rangoHasta = rangoHasta;
    if (secuencial !== undefined) updateData.secuencial = secuencial;
    if (fechaVencimiento !== undefined) updateData.fechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : null;
    if (estado) updateData.estado = estado;

    const sequence = await prisma.ecfSequence.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(sequence);
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/ecf/sequences/:id — Eliminar secuencia */
router.delete('/sequences/:id', manageEcf, async (req, res, next) => {
  try {
    const existing = await prisma.ecfSequence.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!existing) return res.status(404).json({ error: 'Secuencia no encontrada' });

    await prisma.ecfSequence.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// =============================================
// DOCUMENTOS e-CF
// =============================================

/** GET /api/ecf/documents — Listar documentos e-CF */
router.get('/documents', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, tipoEcf, desde, hasta } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { companyId: req.companyId };
    if (status) where.dgiiStatus = status;
    if (tipoEcf) where.tipoEcf = tipoEcf;
    if (desde || hasta) {
      where.fechaEmision = {};
      if (desde) where.fechaEmision.gte = new Date(desde);
      if (hasta) where.fechaEmision.lte = new Date(hasta);
    }

    const [documents, total] = await Promise.all([
      prisma.ecfDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        select: {
          id: true, tipoEcf: true, eNcf: true, trackId: true,
          dgiiStatus: true, dgiiMessage: true, securityCode: true,
          rncEmisor: true, rncComprador: true, nombreComprador: true,
          montoTotal: true, itbisTotal: true, fechaEmision: true,
          enviadoAt: true, aceptadoAt: true, rechazadoAt: true,
          createdAt: true, invoiceId: true,
        },
      }),
      prisma.ecfDocument.count({ where }),
    ]);

    res.json({ documents, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    next(error);
  }
});

/** GET /api/ecf/documents/:id — Detalle de un documento e-CF */
router.get('/documents/:id', async (req, res, next) => {
  try {
    const document = await prisma.ecfDocument.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { invoice: { select: { id: true, orderNumber: true, invoiceNumber: true } } },
    });

    if (!document) return res.status(404).json({ error: 'Documento no encontrado' });

    // Generar URL del QR
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const qrCodeUrl = ecfService.getQRCodeUrl(document, company, company.ecfEnvironment);

    res.json({ ...document, qrCodeUrl });
  } catch (error) {
    next(error);
  }
});

// =============================================
// OPERACIONES e-CF
// =============================================

/** POST /api/ecf/emit — Emitir e-CF para una factura */
router.post('/emit', manageEcf, async (req, res, next) => {
  try {
    const { invoiceId, tipoEcf } = req.body;

    if (!invoiceId || !tipoEcf) {
      return res.status(400).json({ error: 'Se requiere invoiceId y tipoEcf' });
    }

    const result = await ecfService.emitEcf(invoiceId, tipoEcf, req.companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** GET /api/ecf/status/:id — Consultar estado DGII de un documento */
router.get('/status/:id', async (req, res, next) => {
  try {
    const result = await ecfService.checkTrackIdStatus(req.params.id, req.companyId);
    await ecfService.syncInvoiceWithEcf(req.params.id); // si la DGII lo rechazó, la factura deja de contar como facturada
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** POST /api/ecf/retry/:id — Reintentar envío de un documento */
router.post('/retry/:id', manageEcf, async (req, res, next) => {
  try {
    const result = await ecfService.retryEcfSend(req.params.id, req.companyId);
    await ecfService.syncInvoiceWithEcf(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// =============================================
// DASHBOARD e-CF
// =============================================

/** GET /api/ecf/dashboard — Estadísticas del dashboard */
router.get('/dashboard', async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const [
      totalDocuments,
      pendientes,
      enviados,
      aceptados,
      rechazados,
      errores,
      sequences,
      last30Days,
    ] = await Promise.all([
      prisma.ecfDocument.count({ where: { companyId } }),
      prisma.ecfDocument.count({ where: { companyId, dgiiStatus: 'pendiente' } }),
      prisma.ecfDocument.count({ where: { companyId, dgiiStatus: 'enviado' } }),
      prisma.ecfDocument.count({ where: { companyId, dgiiStatus: 'aceptado' } }),
      prisma.ecfDocument.count({ where: { companyId, dgiiStatus: 'rechazado' } }),
      prisma.ecfDocument.count({ where: { companyId, dgiiStatus: 'error' } }),
      prisma.ecfSequence.findMany({
        where: { companyId },
        select: { tipoEcf: true, nombre: true, secuencial: true, rangoHasta: true, estado: true },
      }),
      prisma.ecfDocument.findMany({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { dgiiStatus: true, montoTotal: true, tipoEcf: true, createdAt: true },
      }),
    ]);

    // Calcular montos totales
    const montoAceptado = last30Days
      .filter(d => d.dgiiStatus === 'aceptado')
      .reduce((sum, d) => sum + parseFloat(d.montoTotal), 0);

    res.json({
      totals: { totalDocuments, pendientes, enviados, aceptados, rechazados, errores },
      sequences,
      last30Days: {
        count: last30Days.length,
        montoAceptado,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
