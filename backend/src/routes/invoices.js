import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAlert } from './alerts.js';
import { emitEcf, retryEcfSend, syncInvoiceWithEcf } from '../services/ecfService.js';

const router = Router();
router.use(authenticate);

// Anular/cancelar y modificar facturas ya emitidas queda para gerencia; cajeros y supervisores solo venden y cobran.
const VOID_STATUSES = ['Anulado', 'Cancelado'];
const canManageInvoices = (user) => !!user?.isAdmin || ['admin', 'manager'].includes(user?.role);

const invoiceItemSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional().nullable(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(18),
  customizationNotes: z.string().optional().nullable(),
  customImageUrls: z.array(z.string()).optional().nullable(),
  variantInfo: z.record(z.any()).optional().nullable()
});

const invoiceSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional(),
  customerRnc: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'Debe incluir al menos un producto'),
  paymentMethod: z.string().optional(),
  amountPaid: z.number().min(0).default(0),
  deliveryType: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().default('Pendiente'),
  paymentTermDays: z.number().int().min(0).max(365).optional()
});

/**
 * GET /api/invoices
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, from, to, page = 1, limit = 50 } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, rnc: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, code: true, sku: true } }
            }
          },
          _count: { select: { items: true } }
        },
        orderBy: { date: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.invoice.count({ where })
    ]);

    const mappedInvoices = invoices.map(inv => ({
      ...inv,
      paidAmount: Number(inv.amountPaid || 0),
      paymentStatus: inv.status === 'Pagado' ? 'Pagado' : (Number(inv.amountPaid) > 0 ? 'Pagado Parcialmente' : 'Pendiente')
    }));

    res.json({
      data: mappedInvoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        customer: true,
        user: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true } }
          }
        },
        creditNotes: true,
        debitNotes: true,
        shipment: true
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    invoice.paidAmount = Number(invoice.amountPaid || 0);
    invoice.paymentStatus = invoice.status === 'Pagado' ? 'Pagado' : (Number(invoice.amountPaid) > 0 ? 'Pagado Parcialmente' : 'Pendiente');

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices
 * Crear nuevo pedido/factura
 */
router.post('/', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);
    
    // Calcular totales
    // unitPrice viene del frontend ya con ITBIS incluido (precio final).
    // subtotal = suma de precios base (sin ITBIS)
    // taxAmount = ITBIS extraído de los precios
    // total = unitPrice * quantity (lo que el cliente paga)
    let subtotal = 0;
    let taxAmount = 0;

    const itemsWithTotals = data.items.map(item => {
      const discountFactor = 1 - item.discountPercent / 100;
      const itemTotalWithTax = item.quantity * item.unitPrice * discountFactor;
      // Extraer base e ITBIS desde el precio final inclusivo
      const divisor = item.taxRate > 0 ? (1 + item.taxRate / 100) : 1;
      const itemBase = itemTotalWithTax / divisor;
      const itemTax = itemTotalWithTax - itemBase;
      subtotal += itemBase;
      taxAmount += itemTax;

      return {
        ...item,
        subtotal: itemBase,
        customizationNotes: item.customizationNotes || null,
        customImageUrls: item.customImageUrls || [],
        variantInfo: item.variantInfo || null,
      };
    });

    const total = subtotal + taxAmount; // = sum of (unitPrice * qty) after discounts
    const changeAmount = data.amountPaid > total ? data.amountPaid - total : 0;

    // Generar número de orden
    const lastInvoice = await prisma.invoice.findFirst({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true }
    });
    
    const nextNumber = lastInvoice 
      ? parseInt(lastInvoice.orderNumber.replace(/\D/g, '')) + 1 
      : 1;
    const orderNumber = `ORD-${String(nextNumber).padStart(6, '0')}`;

    // Crear factura con items en transacción
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          companyId: req.companyId,
          userId: req.user.id,
          customerId: data.customerId,
          customerName: data.customerName,
          customerRnc: data.customerRnc,
          orderNumber,
          subtotal,
          taxAmount,
          total,
          paymentMethod: data.paymentMethod,
          // venta a crédito: vence en la fecha de la venta + plazo; de contado no lleva vencimiento propio
          paymentTermDays: data.paymentTermDays || null,
          dueDate: data.paymentTermDays ? new Date(Date.now() + data.paymentTermDays * 24 * 60 * 60 * 1000) : null,
          amountPaid: data.amountPaid,
          changeAmount,
          deliveryType: data.deliveryType,
          notes: data.notes,
          status: data.status,
          items: {
            create: itemsWithTotals
          }
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, code: true, sku: true } }
            }
          },
          customer: { select: { id: true, name: true } }
        }
      });

      // Actualizar stock de productos
      for (const item of data.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } }
          });

          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              userId: req.user.id,
              type: 'venta',
              quantity: item.quantity,
              reason: `Venta - ${orderNumber}`,
              referenceId: newInvoice.id,
              referenceType: 'invoice'
            }
          });
        }
      }

      return newInvoice;
    });

    // Crear alerta para admin/manager sobre nuevo pedido
    try {
      await createAlert(req.companyId, {
        type: 'new_order',
        title: 'Nuevo Pedido',
        message: `Pedido ${invoice.orderNumber} por ${invoice.total.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}`,
        data: {
          invoiceId: invoice.id,
          orderNumber: invoice.orderNumber,
          total: invoice.total,
          customerName: invoice.customerName || invoice.customer?.name || 'Cliente General'
        }
      });
    } catch (alertError) {
      console.error('Error creando alerta:', alertError);
      // No fallar la operación principal si falla la alerta
    }

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/invoices/:id/status
 * Actualizar estado de la factura
 */
router.patch('/:id/status', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { status } = req.body;

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (VOID_STATUSES.includes(status) && !canManageInvoices(req.user)) {
      return res.status(403).json({ error: 'Solo un gerente o administrador puede anular o cancelar facturas.' });
    }

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: { status }
    });

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/invoices/:id
 * Actualizar datos de una factura (cupones, notas, descuentos, items)
 */
router.put('/:id', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Campos que se pueden actualizar
    const allowed = ['discountAmount', 'total', 'appliedCoupon', 'notes', 'status', 'items', 'amountPaid', 'paymentMethod'];
    const updateData = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.paidAmount !== undefined) {
      updateData.amountPaid = req.body.paidAmount;
    }
    if (req.body.paymentStatus !== undefined) {
      updateData.status = req.body.paymentStatus;
    }

    if (!canManageInvoices(req.user)) {
      if (VOID_STATUSES.includes(updateData.status)) {
        return res.status(403).json({ error: 'Solo un gerente o administrador puede anular o cancelar facturas.' });
      }
      const amountFields = ['items', 'total', 'discountAmount', 'appliedCoupon'].filter(f => updateData[f] !== undefined);
      if (invoice.isBilled && amountFields.length) {
        return res.status(403).json({ error: 'Una factura ya emitida no se puede modificar. Pide a un gerente una nota de crédito o débito.' });
      }
    }

    // Si se actualizan los items, actualizarlos en cascada
    if (updateData.items && Array.isArray(updateData.items)) {
      const items = updateData.items;
      delete updateData.items;

      await prisma.$transaction(async (tx) => {
        // Eliminar items actuales
        await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });

        // Recrear items con los datos nuevos
        for (const item of items) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              productId: item.productId || null,
              variantId: item.variantId || null,
              productName: item.productName || item.name || '',
              quantity: parseInt(item.quantity) || 1,
              unitPrice: parseFloat(item.unitPrice ?? item.price) || 0,
              discountPercent: parseFloat(item.discountPercent) || 0,
              taxRate: parseFloat(item.taxRate) || 18,
              subtotal: parseFloat(item.subtotal) || 0,
              customizationNotes: item.customizationNotes || null,
              customImageUrls: Array.isArray(item.customImageUrls) ? item.customImageUrls : [],
              variantInfo: item.variantInfo || null,
            }
          });
        }
      });
    }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: updateData,
      include: { items: true }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/bill
 * Facturar un pedido (asignar NCF)
 */
// Facturar asigna el comprobante automáticamente (NCF o e-CF); el cajero no elige ni edita la secuencia.
router.post('/:id/bill', authorize('admin', 'manager', 'supervisor', 'cashier'), async (req, res, next) => {
  try {
    const { ncfType, customerRnc } = req.body;
    
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (invoice.isBilled) {
      return res.status(400).json({ error: 'La factura ya está facturada' });
    }

    // ── e-CF: Tipos electrónicos (E31, E32, E33, E34, etc.) ──
    if (ncfType && ncfType.startsWith('E')) {
      const company = await prisma.company.findUnique({ where: { id: req.companyId } });
      if (!company.ecfEnabled) {
        return res.status(400).json({ error: 'La facturación electrónica no está habilitada. Active e-CF en Gestión Fiscal.' });
      }

      // Actualizar RNC del comprador si se proporcionó
      if (customerRnc) {
        await prisma.invoice.update({ where: { id: req.params.id }, data: { customerRnc } });
      }

      // Si esta factura ya tiene un e-CF que no llegó a la DGII, se reintenta ese mismo documento
      // en lugar de generar otro (no se gasta un e-NCF nuevo). Un e-CF rechazado sí requiere uno nuevo.
      const unsent = await prisma.ecfDocument.findFirst({
        where: { invoiceId: req.params.id, companyId: req.companyId, dgiiStatus: { in: ['error', 'pendiente'] } },
        orderBy: { createdAt: 'desc' },
      });
      const result = unsent
        ? await retryEcfSend(unsent.id, req.companyId)
        : await emitEcf(req.params.id, ncfType, req.companyId);
      const ecfDocumentId = unsent?.id || result.ecfDocument?.id;
      const ecfResult = { ...result, ecfDocument: result.ecfDocument || result.document };

      // La factura solo queda facturada si la DGII recibió el e-CF
      const updatedInvoice = ecfDocumentId ? await syncInvoiceWithEcf(ecfDocumentId) : null;
      if (!result.success || !updatedInvoice?.isBilled) {
        return res.status(502).json({
          error: `La DGII no recibió el e-CF${ecfResult.ecfDocument?.eNcf ? ' ' + ecfResult.ecfDocument.eNcf : ''}: ${result.error || ecfResult.ecfDocument?.dgiiMessage || 'sin respuesta'}. La venta queda pendiente de facturar y se puede reintentar.`,
          ecfResult,
        });
      }

      return res.json({ ...updatedInvoice, ecfResult });
    }

    // ── NCF Tradicional (B01, B02, NoFiscal) ──
    const company = await prisma.company.findUnique({
      where: { id: req.companyId }
    });

    if (ncfType === 'B01' && !company.ncfB01Prefix) {
      return res.status(400).json({ error: 'Configuración incompleta: Falta el prefijo NCF para Crédito Fiscal (B01).' });
    }
    if (ncfType === 'B02' && !company.ncfB02Prefix) {
      return res.status(400).json({ error: 'Configuración incompleta: Falta el prefijo NCF para Consumo (B02).' });
    }

    let ncfNumber = 'NoFiscal';
    let updateCompany = {};

    if (ncfType === 'B01' && company.ncfB01Prefix) {
      ncfNumber = `${company.ncfB01Prefix}${String(company.ncfB01SequenceNext).padStart(8, '0')}`;
      updateCompany = { ncfB01SequenceNext: company.ncfB01SequenceNext + 1 };
    } else if (ncfType === 'B02' && company.ncfB02Prefix) {
      ncfNumber = `${company.ncfB02Prefix}${String(company.ncfB02SequenceNext).padStart(8, '0')}`;
      updateCompany = { ncfB02SequenceNext: company.ncfB02SequenceNext + 1 };
    }

    const [updatedInvoice] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: req.params.id },
        data: {
          isBilled: true,
          billedDate: new Date(),
          invoiceNumber: invoice.orderNumber,
          ncfNumber,
          ncfType: ncfType || 'NoFiscal',
          customerRnc
        }
      }),
      ...(Object.keys(updateCompany).length > 0 
        ? [prisma.company.update({ where: { id: req.companyId }, data: updateCompany })]
        : [])
    ]);

    res.json(updatedInvoice);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/cancel
 * Anular factura
 */
router.post('/:id/cancel', authorize('admin'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Restaurar stock
    await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });

          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              userId: req.user.id,
              type: 'entrada',
              quantity: item.quantity,
              reason: `Anulación de factura - ${invoice.orderNumber}: ${reason || 'Sin motivo'}`,
              referenceId: invoice.id,
              referenceType: 'invoice_cancel'
            }
          });
        }
      }

      await tx.invoice.update({
        where: { id: req.params.id },
        data: { status: 'Anulado' }
      });
    });

    res.json({ message: 'Factura anulada' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/credit-note
 * Crear nota de crédito para una factura
 */
router.post('/:id/credit-note', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { amount, reason, ncfNumber } = req.body;
    
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Crear nota de crédito y reintegrar stock
    const creditNote = await prisma.$transaction(async (tx) => {
      // Crear la nota de crédito
      const note = await tx.creditNote.create({
        data: {
          companyId: req.companyId,
          invoiceId: invoice.id,
          amount: parseFloat(amount),
          reason,
          ncfNumber
        }
      });

      // Reintegrar stock
      for (const item of invoice.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });

          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              userId: req.user.id,
              type: 'entrada',
              quantity: item.quantity,
              reason: `Nota de Crédito - ${note.id}`,
              referenceId: note.id,
              referenceType: 'credit_note'
            }
          });
        }
      }

      // Actualizar factura
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'Anulado' }
      });

      return note;
    });

    res.status(201).json(creditNote);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/debit-note
 * Crear nota de débito para una factura
 */
router.post('/:id/debit-note', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { amount, reason, ncfNumber } = req.body;
    
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const debitNote = await prisma.debitNote.create({
      data: {
        companyId: req.companyId,
        invoiceId: invoice.id,
        amount: parseFloat(amount),
        reason,
        ncfNumber
      }
    });

    // Actualizar total de la factura 
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { 
        total: { increment: parseFloat(amount) }
      }
    });

    res.status(201).json(debitNote);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/invoices/:id
 * Eliminar un pedido/factura (solo si está en estado Pendiente o Anulado)
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Solo permitir eliminar pedidos pendientes o anulados
    if (!['Pendiente', 'Anulado'].includes(invoice.status)) {
      return res.status(400).json({ 
        error: 'Solo se pueden eliminar pedidos en estado Pendiente o Anulado' 
      });
    }

    // Eliminar en transacción (items + factura)
    await prisma.$transaction(async (tx) => {
      // Primero eliminar los items
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: invoice.id }
      });

      // Luego eliminar la factura
      await tx.invoice.delete({
        where: { id: invoice.id }
      });
    });

    res.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (error) {
    next(error);
  }
});

export default router;
