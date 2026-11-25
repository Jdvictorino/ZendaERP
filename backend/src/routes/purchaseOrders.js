import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { orderTotals, validateOrderLines } from '../services/purchases.js';

const router = Router();
router.use(authenticate);

const bad = (error, status = 400) => Object.assign(new Error(error), { status });

const orderSchema = z.object({
  supplierId: z.string().min(1),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha esperada inválida').refine((v) => !isNaN(new Date(v)), 'Fecha esperada inválida').optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.string().min(1),
    packagingId: z.string().optional().nullable(),
    quantity: z.coerce.number(),
    unitCost: z.coerce.number()
  }))
});

// Valida proveedor y líneas contra la empresa; devuelve líneas normalizadas y totales
async function prepare(tx, companyId, data) {
  const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, companyId, status: 'active' }, select: { id: true } });
  if (!supplier) throw bad('El suplidor no existe o está inactivo.');
  const ids = [...new Set(data.items.map((i) => i.productId))];
  const found = await tx.product.findMany({
    where: { id: { in: ids }, companyId },
    select: {
      id: true, name: true, allowFractions: true, isTaxable: true, taxRate: true, status: true,
      _count: { select: { variants: true } },
      packagings: { select: { id: true, name: true, factor: true, status: true } }
    }
  });
  const productsById = Object.fromEntries(found.map((p) => [p.id, { ...p, hasVariants: p._count.variants > 0 }]));
  const checked = validateOrderLines(data.items, productsById);
  if (checked.error) throw bad(checked.error);
  return { lines: checked.lines, totals: orderTotals(checked.lines) };
}

const detailInclude = {
  supplier: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } }, orderBy: { id: 'asc' } },
  receipts: { orderBy: { receivedAt: 'desc' } },
  expenses: { select: { id: true, ncf: true, invoiceDate: true, montoFacturado: true } }
};

router.get('/', authorize(...rolesFor('purchases-view')), async (req, res, next) => {
  try {
    const { status, supplierId } = req.query;
    const where = { companyId: req.companyId };
    if (status) where.status = String(status);
    if (supplierId) where.supplierId = String(supplierId);
    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) { next(error); }
});

router.get('/:id', authorize(...rolesFor('purchases-view')), async (req, res, next) => {
  try {
    const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: detailInclude });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(order);
  } catch (error) { next(error); }
});

function createOrder(req, data) {
  return prisma.$transaction(async (tx) => {
    const { lines, totals } = await prepare(tx, req.companyId, data);
    const last = await tx.purchaseOrder.findFirst({ where: { companyId: req.companyId }, orderBy: { number: 'desc' }, select: { number: true } });
    const next = (last ? parseInt(last.number.slice(3), 10) : 0) + 1;
    return tx.purchaseOrder.create({
      data: {
        companyId: req.companyId,
        number: `OC-${String(next).padStart(5, '0')}`,
        supplierId: data.supplierId,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes || null,
        createdById: req.user.id,
        ...totals,
        items: { create: lines }
      },
      include: detailInclude
    });
  });
}

router.post('/', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    const data = orderSchema.parse(req.body);
    let order;
    try {
      order = await createOrder(req, data);
    } catch (e) {
      if (e.code !== 'P2002') throw e;
      order = await createOrder(req, data); // otro usuario tomó el mismo número: se reintenta una vez
    }
    res.status(201).json(order);
  } catch (error) { next(error); }
});

router.put('/:id', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    const data = orderSchema.parse(req.body);
    const order = await prisma.$transaction(async (tx) => {
      // Toma la fila solo si sigue en borrador: un envío simultáneo no se cuela
      const claimed = await tx.purchaseOrder.updateMany({ where: { id: req.params.id, companyId: req.companyId, status: 'borrador' }, data: { updatedAt: new Date() } });
      if (!claimed.count) {
        const exists = await tx.purchaseOrder.count({ where: { id: req.params.id, companyId: req.companyId } });
        throw bad(exists ? 'Solo se puede editar una orden en borrador.' : 'Orden no encontrada', exists ? 409 : 404);
      }
      const { lines, totals } = await prepare(tx, req.companyId, data);
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: req.params.id } });
      return tx.purchaseOrder.update({
        where: { id: req.params.id },
        data: {
          supplierId: data.supplierId,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
          notes: data.notes || null,
          ...totals,
          items: { create: lines }
        },
        include: detailInclude
      });
    });
    res.json(order);
  } catch (error) { next(error); }
});

router.post('/:id/send', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    // El estado va en el where: dos envíos a la vez no pasan los dos
    const r = await prisma.purchaseOrder.updateMany({
      where: { id: req.params.id, companyId: req.companyId, status: 'borrador' },
      data: { status: 'enviada', sentAt: new Date() }
    });
    if (!r.count) {
      const exists = await prisma.purchaseOrder.count({ where: { id: req.params.id, companyId: req.companyId } });
      throw bad(exists ? 'Solo se puede enviar una orden en borrador.' : 'Orden no encontrada', exists ? 409 : 404);
    }
    res.json(await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: detailInclude }));
  } catch (error) { next(error); }
});

router.post('/:id/cancel', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    const order = await prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id: req.params.id, companyId: req.companyId, status: { in: ['borrador', 'enviada'] }, receipts: { none: {} } },
        data: { updatedAt: new Date() }
      });
      if (!claimed.count) {
        const cur = await tx.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.companyId }, select: { status: true } });
        if (!cur) throw bad('Orden no encontrada', 404);
        throw bad(cur.status === 'cancelada' ? 'La orden ya está cancelada.' : 'Una orden con mercancía recibida no se puede cancelar.', 409);
      }
      return tx.purchaseOrder.update({ where: { id: req.params.id }, data: { status: 'cancelada' }, include: detailInclude });
    });
    res.json(order);
  } catch (error) { next(error); }
});

export default router;
