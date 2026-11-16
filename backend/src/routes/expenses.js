import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { emitExpenseEcf } from '../services/ecfService.js';
import { httpError, issueChannel, reserveEncf, takeNcf } from '../services/ncfService.js';

const router = Router();
router.use(authenticate);

// Montos del formato 606; el formulario los envía como texto
const money = z.coerce.number().min(0).default(0);
const expenseSchema = z.object({
  supplierId: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
  supplierName: z.string().optional(),
  rncCedula: z.string().optional(),
  ncf: z.string().optional(),
  ncfModificado: z.string().nullable().optional(),
  invoiceDate: z.string().or(z.date()),
  paymentDate: z.string().or(z.date()).optional().nullable(),
  montoBienes: money,
  montoServicios: money,
  itbisFacturado: money,
  itbisRetenido: money,
  retencionIsrTipo: z.string().nullable().optional(),
  montoRetencionIsr: money,
  propina: money,
  paymentType: z.string().optional(),
  expenseType: z.string().optional(),
  description: z.string().nullable().optional(),
  // Pago al exterior (formato 609)
  foreignPayment: z.object({
    idType: z.enum(['Persona Física', 'Persona Jurídica']).optional(),
    taxId: z.string().optional(),
    country: z.string().regex(/^[A-Z]{2}$/, 'País en código ISO de 2 letras').optional(),
    serviceType: z.string().optional(),
    serviceDetail: z.string().optional(),
    relatedParty: z.boolean().optional(),
    documentNumber: z.string().optional(),
    rentaPresunta: z.coerce.number().min(0).optional(),
  }).nullable().optional()
});

// Comprobantes que emite la empresa al comprar: en papel (B) o su equivalente electrónico (E)
const VOUCHERS = { B11: 'E41', B13: 'E43', B17: 'E47' };

// Lo que cada comprobante exige antes de emitirlo (y que la DGII validaría)
export function voucherProblem(code, e) {
  const base = e.montoBienes + e.montoServicios;
  if (!(base > 0)) return 'Indica el monto en bienes o en servicios.';
  if (code === 'B11') {
    const id = String(e.rncCedula || '').replace(/\D/g, '');
    if (![9, 11].includes(id.length)) return 'El Comprobante de Compras (B11) lleva la cédula del vendedor (11 dígitos).';
    if (!e.supplierName?.trim()) return 'Indica el nombre del vendedor.';
    if (e.itbisFacturado > 0 && Math.abs(e.itbisFacturado - base * 0.18) > 1) return 'El ITBIS de un comprobante de compras es el 18 % de bienes y servicios.';
    if (e.montoRetencionIsr > 0 && !(e.montoServicios > 0)) return 'La retención de ISR aplica a servicios: indica el monto en servicios.';
  }
  if (code === 'B17') {
    if (!e.supplierName?.trim()) return 'Indica el nombre del proveedor del exterior.';
    const f = e.foreignPayment || {};
    if (!f.country || !f.taxId?.trim() || !f.serviceType || !f.serviceDetail) return 'Completa los datos del pago al exterior (país, ID tributaria y servicio): los pide el formato 609.';
  }
  return null;
}

// Una vez emitido el comprobante, estos datos ya están en la DGII: no se cambian
const LOCKED_FIELDS = ['rncCedula', 'supplierName', 'invoiceDate', 'montoBienes', 'montoServicios', 'itbisFacturado', 'itbisRetenido', 'montoRetencionIsr', 'propina'];
const sameValue = (field, saved, sent) => {
  if (sent === undefined) return true;
  if (field === 'invoiceDate') return new Date(saved).toISOString().slice(0, 10) === new Date(sent).toISOString().slice(0, 10);
  if (typeof sent === 'number') return Math.abs(Number(saved) - sent) < 0.005;
  return (saved || '') === (sent || '');
};

/**
 * GET /api/expenses
 */
router.get('/', async (req, res, next) => {
  try {
    const { supplierId, from, to, page = 1, limit } = req.query;
    // Sin ?limit se devuelve la lista completa: las pantallas (caja, reportes, 607) necesitan todos los registros
    const take = limit ? parseInt(limit) : undefined;

    const where = { companyId: req.companyId };
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) where.invoiceDate.lte = new Date(to);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          // e-CF emitido por el gasto (E41/E43/E47): su id basta para imprimir el QR
          ecfDocuments: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } }
        },
        orderBy: { invoiceDate: 'desc' },
        skip: take ? (parseInt(page) - 1) * take : undefined,
        take
      }),
      prisma.expense.count({ where })
    ]);

    res.json({
      data: expenses,
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
 * GET /api/expenses/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { supplier: true }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/expenses
 */
router.post('/', authorize(...rolesFor('finance-expenses')), async (req, res, next) => {
  try {
    const data = expenseSchema.parse(req.body);
    const { issueVoucher } = req.body;
    const record = {
      ...data,
      montoFacturado: data.montoBienes + data.montoServicios, // "Total Monto Facturado" del 606
      companyId: req.companyId,
      userId: req.user.id,
      invoiceDate: new Date(data.invoiceDate),
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : null
    };

    if (!issueVoucher) {
      return res.status(201).json(await prisma.expense.create({ data: record }));
    }

    // La empresa emite el comprobante: B11/B13/B17 en papel, o E41/E43/E47 si ya emite electrónicos
    const tipoEcf = VOUCHERS[issueVoucher];
    if (!tipoEcf) throw httpError(400, 'Tipo de comprobante no válido.');
    const problem = voucherProblem(issueVoucher, record);
    if (problem) throw httpError(400, problem);
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const reserved = issueChannel(company, issueVoucher) === 'ecf' ? await reserveEncf(company, tipoEcf) : null;

    const expense = await prisma.$transaction(async (tx) => {
      const ncf = reserved
        ? { number: reserved.eNcf, expiresAt: reserved.sequence.fechaVencimiento ? new Date(reserved.sequence.fechaVencimiento).toISOString().slice(0, 10) : null }
        : await takeNcf(tx, req.companyId, issueVoucher);
      return tx.expense.create({
        data: { ...record, ncf: ncf.number, ncfExpiresAt: ncf.expiresAt ? new Date(ncf.expiresAt) : null, issuedVoucher: reserved ? tipoEcf : issueVoucher }
      });
    });

    // Si la DGII no recibe el e-CF, queda en Facturación Electrónica para reintentar
    const ecfResult = reserved
      ? await emitExpenseEcf({ expense, tipoEcf, ...reserved }).catch((error) => ({ success: false, error: error.message }))
      : undefined;
    res.status(201).json({ ...expense, ecfResult });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/expenses/:id
 */
router.put('/:id', authorize(...rolesFor('finance-expenses')), async (req, res, next) => {
  try {
    const data = expenseSchema.partial().parse(req.body);

    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    if (existing.issuedVoucher) {
      if (LOCKED_FIELDS.some((f) => !sameValue(f, existing[f], data[f]))) {
        throw httpError(400, `Este gasto emitió el comprobante ${existing.ncf}: sus montos, fecha y vendedor ya no se pueden cambiar.`);
      }
      delete data.ncf;
    }

    const updateData = { ...data };
    if (data.invoiceDate) updateData.invoiceDate = new Date(data.invoiceDate);
    if (data.paymentDate) updateData.paymentDate = new Date(data.paymentDate);
    if (data.montoBienes !== undefined || data.montoServicios !== undefined) {
      updateData.montoFacturado = (data.montoBienes ?? Number(existing.montoBienes)) + (data.montoServicios ?? Number(existing.montoServicios));
    }

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/expenses/:id
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    if (existing.issuedVoucher) {
      throw httpError(400, `Este gasto emitió el comprobante ${existing.ncf} y no se puede eliminar: el número ya está usado ante la DGII.`);
    }

    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ message: 'Gasto eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expenses/report/606
 * Reporte 606 para DGII
 */
router.get('/report/606', async (req, res, next) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'year y month son requeridos' });
    }

    // Las fechas se guardan a medianoche UTC; el mes va hasta el 1.º del siguiente (sin cortar el último día)
    const startDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
    const endDate = new Date(Date.UTC(parseInt(year), parseInt(month), 1));

    const expenses = await prisma.expense.findMany({
      where: {
        companyId: req.companyId,
        invoiceDate: { gte: startDate, lt: endDate },
        // Los pagos al exterior (B17/E47) van en el 609, no en el 606
        OR: [{ issuedVoucher: null }, { issuedVoucher: { notIn: ['B17', 'E47'] } }]
      },
      orderBy: { invoiceDate: 'asc' }
    });

    const totals = expenses.reduce((acc, exp) => ({
      montoTotal: acc.montoTotal + Number(exp.montoFacturado),
      itbisTotal: acc.itbisTotal + Number(exp.itbisFacturado)
    }), { montoTotal: 0, itbisTotal: 0 });

    res.json({
      period: { year, month },
      expenses,
      totals,
      count: expenses.length
    });
  } catch (error) {
    next(error);
  }
});

export default router;
