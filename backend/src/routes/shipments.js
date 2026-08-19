import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Schema flexible que acepta ambos formatos
const shipmentSchema = z.object({
  // Formato original (con invoiceId)
  invoiceId: z.string().uuid().optional().nullable(),
  // Formato frontend (orderId / orderNumber)
  orderId: z.string().optional().nullable(),
  orderNumber: z.string().optional().nullable(),
  orderDocId: z.string().optional().nullable(),
  // Campos comunes
  trackingNumber: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  courier: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientPhone: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  deliveryNotes: z.string().optional().nullable(),
  estimatedDelivery: z.string().or(z.date()).optional().nullable(),
  assignedDriverId: z.string().optional().nullable(),
  // Campos adicionales del frontend
  items: z.array(z.any()).optional().nullable(),
  toAddress: z.object({
    name: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    phone: z.string().optional()
  }).optional().nullable(),
  postage: z.number().optional().nullable(),
  weightKg: z.number().optional().nullable(),
  dimensions: z.object({
    length: z.number().optional().nullable(),
    width: z.number().optional().nullable(),
    height: z.number().optional().nullable()
  }).optional().nullable(),
  sender: z.any().optional().nullable()
});

/**
 * GET /api/shipments
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            total: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ data: shipments });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shipments/:id
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        invoice: {
          include: {
            items: true,
            customer: true
          }
        }
      }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    res.json(shipment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shipments
 */
router.post('/', authenticate, authorize('admin', 'manager', 'warehouse', 'cashier'), async (req, res, next) => {
  try {
    const data = shipmentSchema.parse(req.body);

    let invoice = null;
    let invoiceId = data.invoiceId || null;

    // Si viene invoiceId, verificar que existe
    if (invoiceId) {
      invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, companyId: req.companyId }
      });
      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' });
      }
      // Verificar que no tenga envío ya
      const existingShipment = await prisma.shipment.findUnique({
        where: { invoiceId }
      });
      if (existingShipment) {
        return res.status(400).json({ error: 'La factura ya tiene un envío asociado' });
      }
    }

    // Extraer dirección del destinatario
    const toAddr = data.toAddress || {};
    const recipientName = data.recipientName || toAddr.name || '';
    const recipientPhone = data.recipientPhone || toAddr.phone || '';
    const deliveryAddress = data.deliveryAddress || 
      [toAddr.street, toAddr.city, toAddr.postalCode].filter(Boolean).join(', ') || '';

    // Generar QR code
    const qrId = invoiceId || data.orderId || Date.now().toString();
    const qrCode = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/delivery/confirm?id=${qrId}`;

    const shipment = await prisma.shipment.create({
      data: {
        companyId: req.companyId,
        invoiceId: invoiceId || null,
        orderNumber: data.orderNumber || data.orderId || null,
        orderId: data.orderId || null,
        items: data.items || null,
        toAddress: data.toAddress || null,
        courier: data.courier || data.carrier || null,
        carrier: data.carrier || data.courier || null,
        postage: data.postage || null,
        weightKg: data.weightKg || null,
        dimensions: data.dimensions || null,
        trackingNumber: data.trackingNumber || null,
        recipientName,
        recipientPhone,
        deliveryAddress,
        deliveryNotes: data.deliveryNotes || null,
        estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : null,
        assignedDriverId: data.assignedDriverId || null,
        qrCode,
        status: 'created'
      }
    });

    // Si hay factura, actualizar con referencia al envío
    if (invoiceId && invoice) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { shipmentId: shipment.id, deliveryType: 'shipping' }
      });
    }

    res.status(201).json(shipment);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    next(error);
  }
});

/**
 * PATCH /api/shipments/:id/status
 */
router.patch('/:id/status', authenticate, authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const updateData = { status };
    
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    const shipment = await prisma.shipment.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json(shipment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shipments/confirm-delivery
 * Confirmar entrega (accesible públicamente con código QR)
 */
router.post('/confirm-delivery', optionalAuth, async (req, res, next) => {
  try {
    const { invoiceId, signature, recipientName } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId requerido' });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { invoiceId }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    if (shipment.status === 'delivered') {
      return res.status(400).json({ error: 'El envío ya fue entregado' });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        deliverySignature: signature,
        recipientName: recipientName || shipment.recipientName
      }
    });

    // Actualizar estado de la factura
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'Completado' }
    });

    res.json({ 
      message: 'Entrega confirmada exitosamente',
      shipment: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/shipments/:id
 */
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    if (shipment.status === 'delivered') {
      return res.status(400).json({ error: 'No se puede eliminar un envío entregado' });
    }

    // Quitar referencia de la factura (solo si existe invoiceId)
    if (shipment.invoiceId) {
      await prisma.invoice.update({
        where: { id: shipment.invoiceId },
        data: { shipmentId: null, deliveryType: null }
      });
    }

    await prisma.shipment.delete({ where: { id: req.params.id } });
    res.json({ message: 'Envío eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/shipments/:id
 * Actualizar un envío
 */
router.put('/:id', authenticate, authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    const allowedFields = [
      'trackingNumber', 'carrier', 'recipientName', 'recipientPhone',
      'deliveryAddress', 'deliveryNotes', 'estimatedDelivery', 'assignedDriverId'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'estimatedDelivery' && req.body[field]) {
          updateData[field] = new Date(req.body[field]);
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    const updated = await prisma.shipment.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        invoice: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            total: true
          }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/shipments/:id/assign
 * Asignar un repartidor al envío
 */
router.patch('/:id/assign', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { driverId } = req.body;
    
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    const updated = await prisma.shipment.update({
      where: { id: req.params.id },
      data: { assignedDriverId: driverId || null }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
