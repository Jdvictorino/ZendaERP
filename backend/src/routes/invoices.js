import { assertSameCompany } from '../services/ownership.js';
import { appendPayments } from '../services/payments.js';
import { invoiceBalance } from '../services/withholdings.js';
import { paymentTermsOf } from '../services/paymentTerms.js';
import { planInvoiceTerms } from '../services/invoiceTerms.js';
import { planInvoicePayment } from '../services/invoicePayment.js';
import { planEarlyPayment } from '../services/earlyPayment.js';
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
import { discountedAmounts } from '../services/ecfXmlBuilder.js';
import { isTaxExempt, todayRD, voucherError } from '../services/tax.js';
import { baseQuantity, quantityError, roundQty, formatQty, unitOf } from '../services/units.js';
import { allowedDiscountPercent, categoryDiscount, anyLineFromCategory, checkLinePrice, couponCap, creditExceeded } from '../services/pricing.js';

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
export async function takeStock(tx, companyId, { productId, variantId, quantity: sold, packagingFactor = 1 }) {
  const quantity = baseQuantity({ quantity: sold, factor: packagingFactor });
  const { count } = variantId
    ? await tx.productVariant.updateMany({ where: { id: variantId, productId, product: { companyId }, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
    : await tx.product.updateMany({ where: { id: productId, companyId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
  if (count > 0) return;
  const found = variantId
    ? await tx.productVariant.findFirst({ where: { id: variantId, productId, product: { companyId } }, select: { name: true, stock: true, product: { select: { name: true, unit: true } } } })
    : await tx.product.findFirst({ where: { id: productId, companyId }, select: { name: true, stock: true, unit: true } });
  if (!found) throw httpError(409, 'Uno de los productos del pedido no existe.');
  const name = variantId ? `${found.product.name} (${found.name})` : found.name;
  throw httpError(409, `Stock insuficiente para "${name}". Disponible: ${formatQty(found.stock, unitOf(variantId ? found.product.unit : found.unit).abbr)}, pedido: ${formatQty(quantity, unitOf(variantId ? found.product.unit : found.unit).abbr)} (en la unidad base del producto).`);
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
    const quantity = baseQuantity({ quantity: item.quantity, factor: item.packagingFactor ?? 1 });
    if (item.variantId) await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: quantity } } });
    else await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: quantity } } });
    await tx.inventoryLog.create({ data: { productId: item.productId, userId, type: 'entrada', quantity, reason, referenceId, referenceType } });
  }
}

// Cuánto de cada línea devolvieron ya las notas de crédito: { itemId: cantidad }
const returnedByNotes = (creditNotes = []) => {
  const done = {};
  creditNotes.forEach((n) => (Array.isArray(n.items) ? n.items : []).forEach((r) => { done[r.itemId] = roundQty((done[r.itemId] || 0) + r.quantity); }));
  return done;
};

// Líneas con lo que aún no volvió a inventario (al anular, las notas parciales ya devolvieron su parte)
export function unreturnedLines(items, creditNotes) {
  const done = returnedByNotes(creditNotes);
  return items.map((i) => ({ ...i, quantity: roundQty(i.quantity - (done[i.id] || 0)) })).filter((i) => i.quantity > 0);
}

// Valida cada línea contra el catálogo y la completa (empaque, ITBIS). Muta las líneas; devuelve { error } o { needsApproval }.
export function validateInvoiceLines(items, productsById, maxDiscount, ctx = {}) {
  let needsApproval = false;
  for (const item of items) {
    const product = item.productId ? productsById.get(item.productId) : null;
    if (item.productId && !product) return { error: 'Uno de los productos del pedido no existe.' };
    const variant = item.variantId ? product?.variants.find((v) => v.id === item.variantId) : null;
    if (item.packagingId && !product) return { error: 'El empaque no pertenece al producto.' };
    const packaging = item.packagingId ? product.packagings.find((k) => k.id === item.packagingId) : null;
    if (item.packagingId && !packaging) return { error: 'El empaque no pertenece al producto.' };
    const qtyError = quantityError({ quantity: item.quantity, allowFractions: !!product?.allowFractions, hasPackaging: !!packaging });
    if (qtyError) return { error: qtyError };
    item.packagingId = packaging?.id ?? null;
    item.packagingName = packaging?.name ?? null;
    item.packagingFactor = packaging ? Number(packaging.factor) : 1;
    const check = checkLinePrice(item, product, variant, maxDiscount, packaging, ctx);
    if (check.error) return { error: check.error };
    item.taxRate = check.taxRate;
    needsApproval ||= check.needsApproval;
  }
  return { needsApproval };
}

const invoiceItemSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional().nullable(),
  productName: z.string(),
  quantity: z.number().positive(),
  packagingId: z.string().uuid().optional().nullable(),
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
  paymentTermId: z.string().nullable().optional(),
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
              product: { select: { id: true, name: true, code: true, sku: true, unit: true, allowFractions: true } }
            }
          },
          ecfDocuments: LAST_RECEIVED_ECF,
          _count: { select: { items: true, creditNotes: true } }
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
 * GET /api/invoices/credit-notes?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Notas de crédito de la empresa (por fecha de la nota) con la factura que modifican, para el 607 y la contabilidad.
 */
router.get('/credit-notes', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { companyId: req.companyId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00-04:00`); // hora de RD
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999-04:00`);
    }
    const notes = await prisma.creditNote.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: {
          select: {
            id: true, ncfNumber: true, ncfType: true, billedDate: true, date: true, customerRnc: true, customerName: true,
            total: true, taxAmount: true, pricesIncludeTax: true, status: true,
            items: { include: { packaging: true, product: { select: { allowFractions: true, unit: true } } } }
          }
        }
      }
    });
    res.json(notes);
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
            product: { select: { id: true, name: true, code: true, sku: true, unit: true, allowFractions: true } }
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
    const pricing = company?.settings?.pricing;
    const category = customer?.category?.trim() || null;
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: req.companyId },
      include: { variants: true, packagings: { where: { status: 'active' } }, ...(category && { categoryPrices: { where: { category: { equals: category, mode: 'insensitive' } } } }) }
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ctx = { category, categoryDiscountPercent: categoryDiscount(category || 'Sin categoría', pricing?.categoryDiscounts), maxDiscountNoCategory: allowedDiscountPercent(pricing, customer, { withCategory: false }) };
    const checked = validateInvoiceLines(data.items, byId, maxDiscount, ctx);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const { needsApproval } = checked;

    // Apps nuevas mandan precios sin ITBIS; las 1.1.x no mandan la marca y siguen con ITBIS incluido
    const pricesExcludeTax = data.pricesExcludeTax === true;
    const exempt = pricesExcludeTax && isTaxExempt(customer, todayRD());
    const { items: itemsWithTotals, subtotal, taxAmount, total } = priceInvoiceLines(data.items, { pricesExcludeTax, exempt });
    const changeAmount = data.amountPaid > total ? data.amountPaid - total : 0;

    const terms = planInvoiceTerms(data, paymentTermsOf(company?.settings), todayRD(), total);
    if (terms.error) return res.status(400).json({ error: terms.error });

    // Venta a crédito: no puede pasar el límite del cliente (límite 0 = sin límite)
    if (customer && /cr[eé]dito/i.test(data.paymentMethod || '')) {
      const open = await prisma.invoice.aggregate({
        where: { companyId: req.companyId, customerId: customer.id, status: { notIn: VOID_STATUSES } },
        _sum: { total: true, amountPaid: true, itbisRetenido: true, retencionRenta: true, creditedAmount: true }
      });
      const pendingBalance = Number(open._sum.total || 0) - Number(open._sum.amountPaid || 0) - Number(open._sum.itbisRetenido || 0) - Number(open._sum.retencionRenta || 0) - Number(open._sum.creditedAmount || 0);
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
          ...(terms.paymentTerm && { paymentTerm: terms.paymentTerm }),
          paymentTermDays: terms.paymentTermDays,
          dueDate: terms.dueDate,
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
              product: { select: { id: true, name: true, code: true, sku: true, unit: true, allowFractions: true } }
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
              quantity: baseQuantity({ quantity: item.quantity, factor: item.packagingFactor }),
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

// Desglose de cobros (efectivo, tarjeta, transferencia) que usa el cierre de caja: solo se agregan, no se reescriben.
// Cada cobro queda en el turno abierto de quien cobra: con varias cajas abiertas, cada cierre suma solo lo suyo.
async function paymentsUpdate(req, invoice, body) {
  const previous = Array.isArray(invoice.payments) ? invoice.payments : [];
  const added = body.paymentBreakdown ? [body.paymentBreakdown] : Array.isArray(body.payments) ? body.payments.slice(previous.length) : [];
  if (!added.length) return undefined;
  const openShift = await prisma.cashShift.findFirst({
    where: { companyId: req.companyId, userId: req.user.id, status: 'open' },
    orderBy: { openedAt: 'desc' },
    select: { id: true }
  });
  return appendPayments(previous, added.map((p) => ({ ...p, shiftId: openShift?.id || null })));
}

// Nota de crédito: comprobante (B04 en papel o E34 electrónico) y registro dentro de la transacción de la ruta.
async function reserveNoteVoucher(invoice, company) {
  const voucher = noteVoucher(invoice, company, 'B04');
  return { voucher, reserved: voucher === 'ecf' ? await reserveEncf(company, 'E34') : null };
}

async function createCreditNote(tx, { companyId, userId, invoice, voucher, reserved, value, reason, lines, full, kind = 'normal', invoiceData = {} }) {
  const ncfNumber = voucher === 'paper' ? (await takeNcf(tx, companyId, 'B04')).number : reserved?.eNcf ?? null;
  const note = await tx.creditNote.create({
    data: { companyId, invoiceId: invoice.id, amount: value, reason, ncfNumber, kind, items: lines.map((l) => ({ itemId: l.id, quantity: l.quantity })) }
  });
  if (full) await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'Anulado' } });
  else await tx.invoice.update({ where: { id: invoice.id }, data: { creditedAmount: { increment: value }, ...invoiceData } });
  if (lines.length) await restoreStock(tx, { ...invoice, items: lines }, userId, `Nota de Crédito - ${note.ncfNumber || note.id}`, 'credit_note', note.id);
  return note;
}

// e-CF de la nota (E34) después del commit: si la DGII no lo recibe, queda en Facturación Electrónica para reintentar
const sendCreditNoteEcf = (reserved, args) => reserved
  ? emitNoteEcf({ kind: 'credit', ...args, ...reserved }).catch((error) => ({ success: false, error: error.message }))
  : undefined;

/**
 * PUT /api/invoices/:id
 * Actualizar datos de una factura (cupones, notas, descuentos, items)
 */
router.put('/:id', authorize(...rolesFor('orders', 'invoices')), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const body = req.body;
    const manager = canManageInvoices(req.user);
    const updateData = {};
    // Total antes del cupón (con ITBIS). No sale de subtotal + taxAmount: con cupón esos ya van rebajados
    const grossTotal = Number(invoice.total) + Number(invoice.discountAmount || 0);

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
      // Con líneas a precio de categoría, el % de la categoría no se suma sobre el total
      const category = customer?.category?.trim() || null;
      const categoryPrices = category && invoice.items.length
        ? await prisma.categoryPrice.findMany({ where: { companyId: req.companyId, productId: { in: invoice.items.map((i) => i.productId).filter(Boolean) }, category: { equals: category, mode: 'insensitive' } } })
        : [];
      const withCategory = !anyLineFromCategory(invoice.items, category, categoryPrices);
      const cap = Math.max(grossTotal * allowedDiscountPercent(company?.settings?.pricing, customer, { withCategory }) / 100, couponCap(offer, grossTotal));
      if (discount > cap + 0.01 && (await requireApproval(req, res, 'price_override')) === false) return;
      updateData.discountAmount = discount;
      updateData.total = grossTotal - discount;
      // Base e ITBIS rebajados con el mismo reparto que declara el e-CF, así el 607 y el e-CF dicen lo mismo
      Object.assign(updateData, discountedAmounts({ ...invoice, ...updateData }));
    }
    const total = updateData.total ?? Number(invoice.total);

    // Cobro: el monto se valida contra el total y el estado de pago sale de los montos, no de la pantalla
    const plan = planInvoicePayment(
      { ...invoice, total, taxAmount: updateData.taxAmount ?? invoice.taxAmount, voided: VOID_STATUSES.includes(invoice.status) },
      body,
      { manager }
    );
    if (plan.error) return res.status(plan.httpStatus).json({ error: plan.error });
    Object.assign(updateData, plan.data);
    const status = body.status ?? body.paymentStatus;
    if (status !== undefined && updateData.status === undefined) {
      if (VOID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Para anular usa la opción Anular: así se devuelve el inventario.' });
      }
      if (status === 'Pagado' && invoiceBalance({ ...invoice, total }) > 0.01) {
        return res.status(400).json({ error: 'Registra el pago antes de marcar la factura como pagada.' });
      }
      updateData.status = status;
    }

    const payments = await paymentsUpdate(req, invoice, body);
    if (payments) updateData.payments = payments;

    // De las líneas solo se editan las notas de personalización: cantidades y precios no cambian tras crear el pedido
    // (moverían el stock y el ITBIS ya calculados)
    const ownItems = new Set(invoice.items.map((i) => i.id));
    const noteUpdates = Array.isArray(body.items)
      ? body.items.filter((i) => i?.id && ownItems.has(i.id)).map((i) => prisma.invoiceItem.update({ where: { id: i.id }, data: { customizationNotes: i.customizationNotes || null } }))
      : [];

    const results = await prisma.$transaction([
      ...noteUpdates,
      prisma.invoice.update({ where: { id: invoice.id }, data: updateData, include: { items: { include: { product: { select: { id: true, name: true, code: true, sku: true, unit: true, allowFractions: true } } } } } })
    ]);

    res.json(results[results.length - 1]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/:id/early-payment
 * Cobro con descuento por pronto pago: nota de crédito (sin devolver artículos) + cobro en una transacción.
 * Mismo cuerpo que el cobro de PUT /:id; si el cobro no salda la factura con el descuento, no se crea nada.
 */
router.post('/:id/early-payment', authorize(...rolesFor('orders', 'invoices')), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: { include: { packaging: true, product: { select: { allowFractions: true, unit: true } } } }, creditNotes: { select: { kind: true, amount: true, items: true } } }
    });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const plan = planEarlyPayment(invoice, req.body, { today: todayRD(), manager: canManageInvoices(req.user) });
    if (plan.error) return res.status(plan.status).json({ error: plan.error });
    const data = { ...plan.paymentData };
    const payments = await paymentsUpdate(req, invoice, req.body);
    if (payments) data.payments = payments;

    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const { voucher, reserved } = await reserveNoteVoucher(invoice, company);
    const { note, updated } = await prisma.$transaction(async (tx) => {
      // Bloqueo optimista: con dos cobros a la vez solo uno pasa. shortcut: el perdedor deja gastado su e-NCF reservado (igual que /credit-note si falla su transacción)
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, companyId: req.companyId, amountPaid: 0, creditedAmount: invoice.creditedAmount, status: { notIn: VOID_STATUSES } },
        data: { creditedAmount: invoice.creditedAmount }
      });
      if (count === 0) throw httpError(409, 'La factura cambió; vuelve a cargarla.');
      const note = await createCreditNote(tx, { companyId: req.companyId, userId: req.user.id, invoice, voucher, reserved, value: plan.discount, reason: 'Descuento por pronto pago', lines: [], full: false, kind: 'pronto_pago', invoiceData: data });
      return { note, updated: await tx.invoice.findUnique({ where: { id: invoice.id }, include: { items: { include: { product: { select: { id: true, name: true, code: true, sku: true, unit: true, allowFractions: true } } } } } }) };
    });

    const ecfResult = await sendCreditNoteEcf(reserved, { note, invoice, lines: [], full: false });
    res.status(201).json({ invoice: updated, creditNote: note, ecfResult });
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

    // Comprobante según la venta: exenta -> E44/B14; gobierno -> E45/B15. Sin tipo en una venta exenta cuenta como NoFiscal
    const customer = invoice.customerId
      ? await prisma.customer.findFirst({ where: { id: invoice.customerId, companyId: req.companyId }, select: { taxpayerType: true } })
      : null;
    const exemptApplied = !!invoice.exemptionNumber;
    const voucherCheck = ncfType || (exemptApplied ? 'NoFiscal' : null);
    if (voucherCheck) {
      const voucherProblem = voucherError(voucherCheck, { exemptApplied, taxpayerType: customer?.taxpayerType });
      if (voucherProblem) return res.status(400).json({ error: voucherProblem });
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

    // ── NCF Tradicional (B01, B02, B14, B15, NoFiscal) ──
    if (ncfType && !['B01', 'B02', 'B14', 'B15', 'NoFiscal'].includes(ncfType)) {
      return res.status(400).json({ error: 'Tipo de comprobante no válido.' });
    }
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Se reserva la factura primero: dos clics o dos cajas a la vez no la facturan (ni gastan NCF) dos veces
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, companyId: req.companyId, isBilled: false },
        data: { isBilled: true, billedDate: new Date() }
      });
      if (claimed.count === 0) throw httpError(400, 'La factura ya está facturada');

      const ncf = ['B01', 'B02', 'B14', 'B15'].includes(ncfType) ? await takeNcf(tx, req.companyId, ncfType) : { number: 'NoFiscal', expiresAt: null };
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
      include: { items: { include: { packaging: true, product: { select: { allowFractions: true, unit: true } } } }, creditNotes: { select: { amount: true, items: true } } }
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
      const quantity = Number(r.quantity);
      if (!item || !(quantity > 0)) return res.status(400).json({ error: 'Uno de los artículos a devolver no es de esta factura.' });
      const qtyError = quantityError({ quantity, allowFractions: !!item.product?.allowFractions, hasPackaging: !!item.packagingId });
      if (qtyError) return res.status(400).json({ error: qtyError });
      const left = roundQty(item.quantity - (returned[item.id] || 0));
      if (quantity > left) return res.status(400).json({ error: `De "${item.productName}" solo quedan ${left} por devolver.` });
      returned[item.id] = roundQty((returned[item.id] || 0) + quantity);
      lines.push({ ...item, quantity });
    }
    const full = credited >= total - 0.01;
    if (full) {
      // La nota que completa el total devuelve todo lo que no se había devuelto
      lines = unreturnedLines(invoice.items, invoice.creditNotes);
    }

    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const { voucher, reserved } = await reserveNoteVoucher(invoice, company);

    const creditNote = await prisma.$transaction((tx) => createCreditNote(tx, { companyId: req.companyId, userId: req.user.id, invoice, voucher, reserved, value, reason, lines, full }));

    const ecfResult = await sendCreditNoteEcf(reserved, { note: creditNote, invoice, lines, full });
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
      include: { items: { include: { packaging: true, product: { select: { unit: true } } } } }
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

// Lo que aún no volvió al inventario: un anulado ya lo devolvió todo; si no, lo que no devolvieron sus notas de crédito
export const stockToRestoreOnDelete = (invoice) =>
  invoice.status === 'Anulado' ? [] : unreturnedLines(invoice.items, invoice.creditNotes || []);

/**
 * DELETE /api/invoices/:id
 * Gerente: solo pedidos sin facturar (Pendiente o Anulado). Administrador: cualquier factura sin e-CF,
 * con sus notas de crédito/débito; devuelve al inventario lo que no se había devuelto.
 * shortcut: herramienta temporal de ajustes pedida por el dueño; quitarla cuando él lo indique.
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { items: true, creditNotes: { select: { items: true } }, _count: { select: { ecfDocuments: true } } }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (invoice._count.ecfDocuments > 0) {
      return res.status(400).json({ error: 'Esta factura tiene e-CF enviado a la DGII y no se puede eliminar: anúlala con una nota de crédito.' });
    }
    if (req.user.role !== 'admin' && invoice.isBilled) {
      return res.status(400).json({ error: 'Una factura emitida no se elimina: anúlala o haz una nota de crédito.' });
    }
    if (req.user.role !== 'admin' && !['Pendiente', 'Anulado'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Solo se pueden eliminar pedidos en estado Pendiente o Anulado' });
    }

    await prisma.$transaction(async (tx) => {
      await restoreStock(tx, { ...invoice, items: stockToRestoreOnDelete(invoice) }, req.user.id, `Factura eliminada - ${invoice.orderNumber}`, 'invoice_delete');
      await tx.creditNote.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.debitNote.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.shipment.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    });

    res.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (error) {
    next(error);
  }
});

export default router;
