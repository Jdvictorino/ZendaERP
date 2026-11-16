import { assertSameCompany } from '../services/ownership.js';
import { appendPayments } from '../services/payments.js';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAlert } from './alerts.js';
import { ECF_RECEIVED, emitEcf, emitNoteEcf, retryEcfSend, syncInvoiceWithEcf } from '../services/ecfService.js';
import { httpError, issueChannel, reserveEncf, takeNcf } from '../services/ncfService.js';
import { requireApproval } from '../services/approvals.js';
import { priceInvoiceLines } from '../services/invoiceAmounts.js';
import { isTaxExempt, todayRD } from '../services/tax.js';
import { allowedDiscountPercent, checkLinePrice, couponCap, creditExceeded } from '../services/pricing.js';

export { takeNcf };

const router = Router();
router.use(authenticate);

// El e-CF de la factura que recibió la DGII: su id basta para pedir el QR al imprimir (GET /ecf/documents/:id)
const LAST_RECEIVED_ECF = { where: { dgiiStatus: { in: ECF_RECEIVED } }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } };

// Anular/cancelar y modificar facturas ya emitidas queda para gerencia; cajeros y supervisores solo venden y cobran.
const VOID_STATUSES = ['Anulado', 'Cancelado'];
const canManageInvoices = (user) => !!user?.isAdmin || ['admin', 'manager'].includes(user?.role);

// Descuenta la existencia del producto, o de la variante si la línea es de una variante. Nunca la deja en negativo
// (la condición stock >= cantidad va en el mismo UPDATE, así vale también con dos ventas a la vez).
export async function takeStock(tx, companyId, { productId, variantId, quantity }) {
  const { count } = variantId
    ? await tx.productVariant.updateMany({ where: { id: variantId, productId, product: { companyId }, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
    : await tx.product.updateMany({ where: { id: productId, companyId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
  if (count > 0) return;
  const found = variantId
    ? await tx.productVariant.findFirst({ where: { id: variantId, productId, product: { companyId } }, select: { name: true, stock: true, product: { select: { name: true } } } })
    : await tx.product.findFirst({ where: { id: productId, companyId }, select: { name: true, stock: true } });
  if (!found) throw httpError(409, 'Uno de los productos del pedido no existe.');
  const name = variantId ? `${found.product.name} (${found.name})` : found.name;
  throw httpError(409, `Stock insuficiente para "${name}". Disponible: ${found.stock}, pedido: ${quantity}.`);
}

// Comprobante de una nota: el mismo tipo de la factura que modifica. Una factura electrónica se modifica con e-CF
// (E34/E33); una en papel (B01/B02) con B04/B03, o con e-CF si la empresa ya emite electrónicos y no tiene esa
// secuencia en papel (el Formato e-CF permite que un e-CF modifique un NCF en papel). Sin comprobante fiscal: null.
export function noteVoucher(invoice, company, paperCode) {
  const type = invoice.ncfType || '';
  if (type.startsWith('E')) return 'ecf';
  if (!['B01', 'B02'].includes(type)) return null;
  return issueChannel(company, paperCode);
}

// Devuelve a inventario las líneas de una factura (anulación, nota de crédito total, pedido eliminado)
export async function restoreStock(tx, invoice, userId, reason, referenceType, referenceId = invoice.id) {
  for (const item of invoice.items) {
    if (!item.productId) continue;
    if (item.variantId) await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
    else await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    await tx.inventoryLog.create({ data: { productId: item.productId, userId, type: 'entrada', quantity: item.quantity, reason, referenceId, referenceType } });
  }
}

// Cuánto de cada línea devolvieron ya las notas de crédito: { itemId: cantidad }
const returnedByNotes = (creditNotes = []) => {
  const done = {};
  creditNotes.forEach((n) => (Array.isArray(n.items) ? n.items : []).forEach((r) => { done[r.itemId] = (done[r.itemId] || 0) + r.quantity; }));
  return done;
};

// Líneas con lo que aún no volvió a inventario (al anular, las notas parciales ya devolvieron su parte)
export function unreturnedLines(items, creditNotes) {
  const done = returnedByNotes(creditNotes);
  return items.map((i) => ({ ...i, quantity: i.quantity - (done[i.id] || 0) })).filter((i) => i.quantity > 0);
}

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
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  pricesExcludeTax: z.boolean().optional()
});

/**
 * GET /api/invoices
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, from, to, page = 1, limit } = req.query;
    // Sin ?limit se devuelve la lista completa: las pantallas (caja, reportes, 607) necesitan todos los registros
    const take = limit ? parseInt(limit) : undefined;
    
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
          ecfDocuments: LAST_RECEIVED_ECF,
          _count: { select: { items: true } }
        },
        orderBy: { date: 'desc' },
        skip: take ? (parseInt(page) - 1) * take : undefined,
        take
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
        limit: take ?? total,
        total,
        pages: take ? Math.ceil(total / take) : 1
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
        ecfDocuments: LAST_RECEIVED_ECF,
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
router.post('/', authorize(...rolesFor('orders')), async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);
    await assertSameCompany(prisma, req.companyId, data);

    // El servidor valida precio, ITBIS y descuento de cada línea contra el catálogo de la empresa
    const [company, customer] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.companyId }, select: { settings: true } }),
      data.customerId ? prisma.customer.findFirst({ where: { id: data.customerId, companyId: req.companyId } }) : null
    ]);
    const maxDiscount = allowedDiscountPercent(company?.settings?.pricing, customer);
    const productIds = [...new Set(data.items.map((i) => i.productId).filter(Boolean))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, companyId: req.companyId }, include: { variants: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    let needsApproval = false;
    for (const item of data.items) {
      const product = item.productId ? byId.get(item.productId) : null;
      if (item.productId && !product) return res.status(400).json({ error: 'Uno de los productos del pedido no existe.' });
      const variant = item.variantId ? product?.variants.find((v) => v.id === item.variantId) : null;
      const check = checkLinePrice(item, product, variant, maxDiscount);
      if (check.error) return res.status(400).json({ error: check.error });
      item.taxRate = check.taxRate;
      needsApproval ||= check.needsApproval;
    }

    // Apps nuevas mandan precios sin ITBIS; las 1.1.x no mandan la marca y siguen con ITBIS incluido
    const pricesExcludeTax = data.pricesExcludeTax === true;
    const exempt = pricesExcludeTax && isTaxExempt(customer, todayRD());
    const { items: itemsWithTotals, subtotal, taxAmount, total } = priceInvoiceLines(data.items, { pricesExcludeTax, exempt });
    const changeAmount = data.amountPaid > total ? data.amountPaid - total : 0;

    // Venta a crédito: no puede pasar el límite del cliente (límite 0 = sin límite)
    if (customer && /cr[eé]dito/i.test(data.paymentMethod || '')) {
      const open = await prisma.invoice.aggregate({
        where: { companyId: req.companyId, customerId: customer.id, status: { notIn: VOID_STATUSES } },
        _sum: { total: true, amountPaid: true }
      });
      const pendingBalance = Number(open._sum.total || 0) - Number(open._sum.amountPaid || 0);
      if (creditExceeded({ creditLimit: customer.creditLimit, pendingBalance, newTotal: total })) {
        return res.status(400).json({ error: 'La venta pasa el límite de crédito del cliente' });
      }
    }

    // El permiso se gasta al final: una venta rechazada por crédito no consume el PIN
    if (needsApproval && (await requireApproval(req, res, 'price_override')) === false) return;

    // Crear factura con items en transacción
    const invoice = await prisma.$transaction(async (tx) => {
      // Bloqueo por empresa hasta el fin de la transacción: dos pedidos a la vez no reciben el mismo número
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${req.companyId}))::text`;
      const lastInvoice = await tx.invoice.findFirst({
        where: { companyId: req.companyId },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true }
      });
      const nextNumber = lastInvoice ? parseInt(lastInvoice.orderNumber.replace(/\D/g, '')) + 1 : 1;
      const orderNumber = `ORD-${String(nextNumber).padStart(6, '0')}`;

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
          pricesIncludeTax: !pricesExcludeTax,
          exemptionNumber: exempt ? customer.exemptionNumber : null,
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
            create: itemsWithTotals.map((i) => ({
              ...i,
              customizationNotes: i.customizationNotes || null,
              customImageUrls: i.customImageUrls || [],
              variantInfo: i.variantInfo || null
            }))
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

      // Actualizar stock de productos (o de la variante)
      for (const item of data.items) {
        if (item.productId) {
          await takeStock(tx, req.companyId, item);

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
router.patch('/:id/status', authorize(...rolesFor('orders', 'invoices')), async (req, res, next) => {
  try {
    const { status } = req.body;

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (VOID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Para anular usa la opción Anular: así se devuelve el inventario.' });
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
router.put('/:id', authorize(...rolesFor('orders', 'invoices')), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: { select: { id: true } } }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const body = req.body;
    const manager = canManageInvoices(req.user);
    const updateData = {};
    const grossTotal = Number(invoice.subtotal) + Number(invoice.taxAmount); // total antes de descuentos (precios con ITBIS)

    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
    if (body.paymentGateway !== undefined) updateData.paymentGateway = body.paymentGateway;

    // Descuento (cupón): el total lo calcula el servidor; en una factura ya emitida solo lo cambia gerencia
    if (body.discountAmount !== undefined) {
      if (invoice.isBilled && !manager) {
        return res.status(403).json({ error: 'Una factura ya emitida no se puede modificar. Pide a un gerente una nota de crédito o débito.' });
      }
      const discount = Number(body.discountAmount) || 0;
      if (discount < 0 || discount > grossTotal + 0.01) {
        return res.status(400).json({ error: 'El descuento no puede ser mayor que el total.' });
      }
      // Sobre el tope sin PIN solo pasa un cupón vigente de la empresa que cubra el monto
      const [company, customer, offer] = await Promise.all([
        prisma.company.findUnique({ where: { id: req.companyId }, select: { settings: true } }),
        invoice.customerId ? prisma.customer.findFirst({ where: { id: invoice.customerId, companyId: req.companyId } }) : null,
        body.appliedCoupon?.id ? prisma.offer.findFirst({ where: { id: String(body.appliedCoupon.id), companyId: req.companyId } }) : null
      ]);
      const cap = Math.max(grossTotal * allowedDiscountPercent(company?.settings?.pricing, customer) / 100, couponCap(offer, grossTotal));
      if (discount > cap + 0.01 && (await requireApproval(req, res, 'price_override')) === false) return;
      updateData.discountAmount = discount;
      updateData.total = grossTotal - discount;
    }
    const total = updateData.total ?? Number(invoice.total);

    // Cobro: el monto se valida contra el total y el estado de pago sale de los montos, no de la pantalla
    const paid = body.amountPaid ?? body.paidAmount;
    if (paid !== undefined) {
      const amount = Number(paid);
      if (!(amount >= 0) || amount > total + 0.01) {
        return res.status(400).json({ error: 'El monto pagado no puede ser mayor que el total de la factura.' });
      }
      if (!manager && amount < Number(invoice.amountPaid) - 0.01) {
        return res.status(403).json({ error: 'Solo un gerente o administrador puede reducir lo pagado de una factura.' });
      }
      updateData.amountPaid = amount;
      if (!VOID_STATUSES.includes(invoice.status)) {
        updateData.status = amount >= total - 0.01 ? 'Pagado' : amount > 0 ? 'Pagado Parcialmente' : 'Pendiente';
      }
    }
    const status = body.status ?? body.paymentStatus;
    if (status !== undefined && updateData.status === undefined) {
      if (VOID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Para anular usa la opción Anular: así se devuelve el inventario.' });
      }
      if (status === 'Pagado' && Number(invoice.amountPaid) < total - 0.01) {
        return res.status(400).json({ error: 'Registra el pago antes de marcar la factura como pagada.' });
      }
      updateData.status = status;
    }

    // Desglose de cobros (efectivo, tarjeta, transferencia) que usa el cierre de caja: solo se agregan, no se reescriben
    const previous = Array.isArray(invoice.payments) ? invoice.payments : [];
    const added = body.paymentBreakdown ? [body.paymentBreakdown] : Array.isArray(body.payments) ? body.payments.slice(previous.length) : [];
    if (added.length) {
      // Cada cobro queda en el turno abierto de quien cobra: con varias cajas abiertas, cada cierre suma solo lo suyo
      const openShift = await prisma.cashShift.findFirst({
        where: { companyId: req.companyId, userId: req.user.id, status: 'open' },
        orderBy: { openedAt: 'desc' },
        select: { id: true }
      });
      updateData.payments = appendPayments(previous, added.map((p) => ({ ...p, shiftId: openShift?.id || null })));
    }

    // De las líneas solo se editan las notas de personalización: cantidades y precios no cambian tras crear el pedido
    // (moverían el stock y el ITBIS ya calculados)
    const ownItems = new Set(invoice.items.map((i) => i.id));
    const noteUpdates = Array.isArray(body.items)
      ? body.items.filter((i) => i?.id && ownItems.has(i.id)).map((i) => prisma.invoiceItem.update({ where: { id: i.id }, data: { customizationNotes: i.customizationNotes || null } }))
      : [];

    const results = await prisma.$transaction([
      ...noteUpdates,
      prisma.invoice.update({ where: { id: invoice.id }, data: updateData, include: { items: true } })
    ]);

    res.json(results[results.length - 1]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/bill
 * Facturar un pedido (asignar NCF)
 */
// Facturar asigna el comprobante automáticamente (NCF o e-CF); el cajero no elige ni edita la secuencia.
router.post('/:id/bill', authorize(...rolesFor('orders')), async (req, res, next) => {
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
    if (ncfType && !['B01', 'B02', 'NoFiscal'].includes(ncfType)) {
      return res.status(400).json({ error: 'Tipo de comprobante no válido.' });
    }
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Se reserva la factura primero: dos clics o dos cajas a la vez no la facturan (ni gastan NCF) dos veces
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, companyId: req.companyId, isBilled: false },
        data: { isBilled: true, billedDate: new Date() }
      });
      if (claimed.count === 0) throw httpError(400, 'La factura ya está facturada');

      const ncf = ncfType === 'B01' || ncfType === 'B02' ? await takeNcf(tx, req.companyId, ncfType) : { number: 'NoFiscal', expiresAt: null };
      return tx.invoice.update({
        where: { id: invoice.id },
        data: { invoiceNumber: invoice.orderNumber, ncfNumber: ncf.number, ncfExpiresAt: ncf.expiresAt ? new Date(ncf.expiresAt) : null, ncfType: ncfType || 'NoFiscal', customerRnc }
      });
    });

    res.json(updatedInvoice);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/cancel
 * Anular factura (gerencia): devuelve el inventario una sola vez
 */
router.post('/:id/cancel', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true, creditNotes: { select: { items: true } } }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    await prisma.$transaction(async (tx) => {
      // Solo la primera anulación devuelve el inventario (dos clics no lo duplican)
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, companyId: req.companyId, status: { notIn: VOID_STATUSES } },
        data: { status: 'Anulado' }
      });
      if (count === 0) throw httpError(400, 'La factura ya está anulada.');
      await restoreStock(tx, { ...invoice, items: unreturnedLines(invoice.items, invoice.creditNotes) }, req.user.id, `Anulación de factura - ${invoice.orderNumber}: ${reason || 'Sin motivo'}`, 'invoice_cancel');
    });

    res.json({ message: 'Factura anulada' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/credit-note
 * Nota de crédito. Devuelve a inventario los artículos indicados (items: [{ itemId, quantity }]);
 * la que completa el total anula la factura y devuelve todo lo que quedaba.
 */
router.post('/:id/credit-note', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { amount, reason, items: returnItems } = req.body;
    const value = parseFloat(amount);
    if (!(value > 0)) {
      return res.status(400).json({ error: 'El monto de la nota de crédito debe ser mayor que 0.' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true, creditNotes: { select: { amount: true, items: true } } }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (VOID_STATUSES.includes(invoice.status)) {
      return res.status(400).json({ error: 'La factura ya está anulada.' });
    }

    const total = Number(invoice.total);
    const credited = invoice.creditNotes.reduce((sum, n) => sum + Number(n.amount), 0) + value;
    if (credited > total + 0.01) {
      return res.status(400).json({ error: `La nota excede lo que queda por acreditar (RD$${(total - credited + value).toFixed(2)}).` });
    }

    // Cuánto de cada línea devolvieron ya las notas anteriores; no se devuelve más de lo vendido
    const before = returnedByNotes(invoice.creditNotes);
    const returned = { ...before };
    let lines = [];
    for (const r of Array.isArray(returnItems) ? returnItems : []) {
      const item = invoice.items.find((i) => i.id === r.itemId);
      const quantity = parseInt(r.quantity, 10);
      if (!item || !(quantity > 0)) return res.status(400).json({ error: 'Uno de los artículos a devolver no es de esta factura.' });
      const left = item.quantity - (returned[item.id] || 0);
      if (quantity > left) return res.status(400).json({ error: `De "${item.productName}" solo quedan ${left} por devolver.` });
      returned[item.id] = (returned[item.id] || 0) + quantity;
      lines.push({ ...item, quantity });
    }
    const full = credited >= total - 0.01;
    if (full) {
      // La nota que completa el total devuelve todo lo que no se había devuelto
      lines = unreturnedLines(invoice.items, invoice.creditNotes);
    }

    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const voucher = noteVoucher(invoice, company, 'B04');
    const reserved = voucher === 'ecf' ? await reserveEncf(company, 'E34') : null;

    const creditNote = await prisma.$transaction(async (tx) => {
      const ncfNumber = voucher === 'paper' ? (await takeNcf(tx, req.companyId, 'B04')).number : reserved?.eNcf ?? null;
      const note = await tx.creditNote.create({
        data: { companyId: req.companyId, invoiceId: invoice.id, amount: value, reason, ncfNumber, items: lines.map((l) => ({ itemId: l.id, quantity: l.quantity })) }
      });
      if (full) await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'Anulado' } });
      if (lines.length) await restoreStock(tx, { ...invoice, items: lines }, req.user.id, `Nota de Crédito - ${note.ncfNumber || note.id}`, 'credit_note', note.id);
      return note;
    });

    // e-CF de la nota (E34): si la DGII no lo recibe, queda en Facturación Electrónica para reintentar
    const ecfResult = reserved
      ? await emitNoteEcf({ kind: 'credit', note: creditNote, invoice, ...reserved, lines, full }).catch((error) => ({ success: false, error: error.message }))
      : undefined;
    res.status(201).json({ ...creditNote, ecfResult });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/debit-note
 * Nota de débito: suma al total con el ITBIS en la misma proporción que la factura (para que el 607 cuadre)
 */
router.post('/:id/debit-note', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const value = parseFloat(amount);
    if (!(value > 0)) {
      return res.status(400).json({ error: 'El monto de la nota de débito debe ser mayor que 0.' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const taxShare = Number(invoice.total) > 0 ? Number(invoice.taxAmount) / Number(invoice.total) : 0;
    const tax = value * taxShare;
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const voucher = noteVoucher(invoice, company, 'B03');
    const reserved = voucher === 'ecf' ? await reserveEncf(company, 'E33') : null;

    const debitNote = await prisma.$transaction(async (tx) => {
      const ncfNumber = voucher === 'paper' ? (await takeNcf(tx, req.companyId, 'B03')).number : reserved?.eNcf ?? null;
      const note = await tx.debitNote.create({
        data: { companyId: req.companyId, invoiceId: invoice.id, amount: value, reason, ncfNumber }
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { total: { increment: value }, taxAmount: { increment: tax }, subtotal: { increment: value - tax } }
      });
      return note;
    });

    // e-CF de la nota (E33): si la DGII no lo recibe, queda en Facturación Electrónica para reintentar
    const ecfResult = reserved
      ? await emitNoteEcf({ kind: 'debit', note: debitNote, invoice, ...reserved }).catch((error) => ({ success: false, error: error.message }))
      : undefined;
    res.status(201).json({ ...debitNote, ecfResult });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/invoices/:id
 * Eliminar un pedido sin facturar (Pendiente o Anulado). Un pedido pendiente devuelve su inventario.
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
    if (invoice.isBilled) {
      return res.status(400).json({ error: 'Una factura emitida no se elimina: anúlala o haz una nota de crédito.' });
    }
    if (!['Pendiente', 'Anulado'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Solo se pueden eliminar pedidos en estado Pendiente o Anulado' });
    }

    await prisma.$transaction(async (tx) => {
      // Un pedido anulado ya devolvió su inventario al anularse
      if (invoice.status === 'Pendiente') {
        await restoreStock(tx, invoice, req.user.id, `Pedido eliminado - ${invoice.orderNumber}`, 'invoice_delete');
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    });

    res.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (error) {
    next(error);
  }
});

export default router;
