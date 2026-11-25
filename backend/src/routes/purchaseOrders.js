import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { nextStatus, orderTotals, planInvoice, planReceipt, purchaseSuggestions, validateOrderLines } from '../services/purchases.js';

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

router.get('/suggestions', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    const rows = await prisma.product.findMany({
      where: { companyId: req.companyId, status: 'active', minStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, supplierId: true, minStock: true, maxStock: true, stock: true, costPrice: true, status: true, _count: { select: { variants: true } } }
    });
    const products = rows.map(({ _count, ...p }) => ({ ...p, hasVariants: _count.variants > 0 }));
    const items = await prisma.purchaseOrderItem.findMany({
      where: { productId: { in: products.map((p) => p.id) }, purchaseOrder: { companyId: req.companyId } },
      select: { productId: true, quantity: true, receivedQuantity: true, packagingId: true, packagingName: true, packagingFactor: true, purchaseOrder: { select: { status: true } } },
      orderBy: [{ purchaseOrder: { createdAt: 'desc' } }, { id: 'desc' }]
    });
    // Empaque vigente: se usa su factor y nombre actuales; si ya no existe o está inactivo, unidad base
    const pks = await prisma.productPackaging.findMany({
      where: { companyId: req.companyId, id: { in: [...new Set(items.map((i) => i.packagingId).filter(Boolean))] }, status: 'active' },
      select: { id: true, name: true, factor: true }
    });
    const pkById = Object.fromEntries(pks.map((k) => [k.id, k]));
    const pendingByProduct = {}, lastPackagingByProduct = {};
    for (const i of items) { // vienen de la orden más reciente a la más antigua
      if (i.purchaseOrder.status !== 'cancelada' && !(i.productId in lastPackagingByProduct)) {
        const k = pkById[i.packagingId];
        lastPackagingByProduct[i.productId] = k ? { packagingId: k.id, packagingName: k.name, packagingFactor: Number(k.factor) } : null;
      }
      if (['borrador', 'enviada', 'parcial'].includes(i.purchaseOrder.status)) {
        pendingByProduct[i.productId] = (pendingByProduct[i.productId] || 0) + (Number(i.quantity) - Number(i.receivedQuantity)) * Number(i.packagingFactor);
      }
    }
    const result = purchaseSuggestions({ products, pendingByProduct, lastPackagingByProduct });
    const info = Object.fromEntries(products.map((p) => [p.id, { productName: p.name, unit: p.unit }]));
    for (const list of [...Object.values(result.bySupplier), result.noSupplier]) for (const l of list) Object.assign(l, info[l.productId]);
    const sup = await prisma.supplier.findMany({ where: { companyId: req.companyId, id: { in: Object.keys(result.bySupplier) } }, select: { id: true, name: true } });
    res.json({ ...result, suppliers: Object.fromEntries(sup.map((x) => [x.id, x.name])) });
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

const receiveSchema = z.object({
  lines: z.array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number() })).refine((l) => new Set(l.map((x) => x.itemId)).size === l.length, 'Una línea está repetida.'),
  notes: z.string().optional().nullable()
});

router.post('/:id/receive', authorize(...rolesFor('purchases')), async (req, res, next) => {
  try {
    const data = receiveSchema.parse(req.body);
    const order = await prisma.$transaction(async (tx) => {
      // Bloquea la orden: recepciones y cancelaciones simultáneas se serializan
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} FOR UPDATE`;
      const cur = await tx.purchaseOrder.findFirst({
        where: { id: req.params.id, companyId: req.companyId },
        include: { items: { include: { product: { select: { id: true, name: true, allowFractions: true } } } } }
      });
      if (!cur) throw bad('Orden no encontrada', 404);
      if (!['enviada', 'parcial'].includes(cur.status)) throw bad('Solo se puede recibir una orden enviada o parcial.', 409);

      const items = cur.items.map((i) => ({
        id: i.id, productId: i.productId, productName: i.product.name, quantity: Number(i.quantity),
        receivedQuantity: Number(i.receivedQuantity), invoicedQuantity: Number(i.invoicedQuantity),
        unitCost: Number(i.unitCost), taxRate: Number(i.taxRate), packagingId: i.packagingId,
        packagingFactor: i.packagingFactor == null ? 1 : Number(i.packagingFactor)
      }));
      const productsById = Object.fromEntries(cur.items.map((i) => [i.productId, i.product]));
      const plan = planReceipt(items, data.lines, productsById);
      if (plan.error) throw bad(plan.error);

      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: cur.id, userId: req.user.id, notes: data.notes || null,
          items: plan.changes.map((c) => ({ itemId: c.itemId, quantity: c.quantity }))
        }
      });
      for (const c of plan.changes) {
        const exists = await tx.product.count({ where: { id: c.productId, companyId: req.companyId } });
        if (!exists) throw bad('Uno de los productos de la orden ya no existe.', 409);
        const added = new Prisma.Decimal(c.baseQuantity);
        // Incremento atómico: no pisa una venta que confirme a la vez
        const { stock } = await tx.product.update({ where: { id: c.productId }, data: { stock: { increment: added }, ...(c.costPrice > 0 && { costPrice: c.costPrice }) }, select: { stock: true } });
        const newStock = new Prisma.Decimal(stock);
        const previous = newStock.minus(added);
        await tx.inventoryLog.create({
          data: {
            productId: c.productId, userId: req.user.id, type: 'entrada', quantity: added,
            previousStock: previous, newStock, reason: `Recepción de compra ${cur.number}`,
            referenceType: 'purchase_receipt', referenceId: receipt.id
          }
        });
        await tx.purchaseOrderItem.update({ where: { id: c.itemId }, data: { receivedQuantity: c.newReceived } });
      }
      const received = new Map(plan.changes.map((c) => [c.itemId, c.newReceived]));
      const status = nextStatus(items.map((i) => ({ quantity: i.quantity, receivedQuantity: received.get(i.id) ?? i.receivedQuantity })));
      return tx.purchaseOrder.update({ where: { id: cur.id }, data: { status }, include: detailInclude });
    });
    res.json(order);
  } catch (error) { next(error); }
});

const invoiceSchema = z.object({
  lines: z.array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number() })).refine((l) => new Set(l.map((x) => x.itemId)).size === l.length, 'Una línea está repetida.'),
  ncf: z.string().trim().min(1, 'El NCF es obligatorio'),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de factura inválida').refine((v) => !isNaN(new Date(v)), 'Fecha de factura inválida'),
  paymentType: z.enum(['01', '02', '03', '04', '05', '06', '07']).default('04')
});

router.post('/:id/invoice', authorize(...rolesFor('finance-expenses')), async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);
    const expense = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} FOR UPDATE`;
      const cur = await tx.purchaseOrder.findFirst({
        where: { id: req.params.id, companyId: req.companyId },
        include: { supplier: true, items: { include: { product: { select: { name: true } } } } }
      });
      if (!cur) throw bad('Orden no encontrada', 404);
      if (['cancelada', 'borrador'].includes(cur.status)) throw bad('No se puede facturar una orden cancelada o en borrador.', 409);
      const items = cur.items.map((i) => ({
        id: i.id, productId: i.productId, productName: i.product.name, quantity: Number(i.quantity),
        receivedQuantity: Number(i.receivedQuantity), invoicedQuantity: Number(i.invoicedQuantity),
        unitCost: Number(i.unitCost), taxRate: Number(i.taxRate), packagingId: i.packagingId,
        packagingFactor: i.packagingFactor == null ? 1 : Number(i.packagingFactor)
      }));
      if (['informal', 'exterior'].includes(cur.supplier.supplierType)) throw bad('Las compras a un proveedor informal o del exterior se registran desde Gastos (B11/B17).');
      if (!cur.supplier.rnc && !cur.supplier.identificationNumber) throw bad('El suplidor no tiene RNC o cédula: agrégalo en Proveedores antes de registrar la factura.');
      const plan = planInvoice(items, data.lines);
      if (plan.error) throw bad(plan.error);
      const created = await tx.expense.create({
        data: {
          companyId: req.companyId, userId: req.user.id, supplierId: cur.supplierId,
          supplierName: cur.supplier.name, rncCedula: cur.supplier.identificationNumber || cur.supplier.rnc,
          ncf: data.ncf, invoiceDate: new Date(data.invoiceDate),
          montoBienes: plan.montoBienes, montoServicios: 0, itbisFacturado: plan.itbisFacturado, montoFacturado: plan.montoBienes,
          expenseType: '09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA', paymentType: data.paymentType,
          description: `Factura de la orden de compra ${cur.number}`, purchaseOrderId: cur.id,
          invoiceLines: plan.updates.map((u) => ({ itemId: u.itemId, quantity: data.lines.find((l) => l.itemId === u.itemId).quantity }))
        }
      });
      for (const u of plan.updates) await tx.purchaseOrderItem.update({ where: { id: u.itemId }, data: { invoicedQuantity: u.newInvoiced } });
      return created;
    });
    res.status(201).json(expense);
  } catch (error) { next(error); }
});

export default router;
