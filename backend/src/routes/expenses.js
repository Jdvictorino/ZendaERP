import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const expenseSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  supplierName: z.string().optional(),
  rncCedula: z.string().optional(),
  ncf: z.string().optional(),
  invoiceDate: z.string().or(z.date()),
  paymentDate: z.string().or(z.date()).optional().nullable(),
  montoFacturado: z.number().min(0),
  itbisFacturado: z.number().min(0).default(0),
  paymentType: z.string().optional(),
  expenseType: z.string().optional(),
  description: z.string().optional()
});

/**
 * GET /api/expenses
 */
router.get('/', async (req, res, next) => {
  try {
    const { supplierId, from, to, page = 1, limit = 50 } = req.query;
    
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
          supplier: { select: { id: true, name: true } }
        },
        orderBy: { invoiceDate: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.expense.count({ where })
    ]);

    res.json({
      data: expenses,
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
router.post('/', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = expenseSchema.parse(req.body);
    
    const expense = await prisma.expense.create({
      data: {
        ...data,
        companyId: req.companyId,
        userId: req.user.id,
        invoiceDate: new Date(data.invoiceDate),
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null
      }
    });

    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/expenses/:id
 */
router.put('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = expenseSchema.partial().parse(req.body);
    
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const updateData = { ...data };
    if (data.invoiceDate) updateData.invoiceDate = new Date(data.invoiceDate);
    if (data.paymentDate) updateData.paymentDate = new Date(data.paymentDate);

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

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0);

    const expenses = await prisma.expense.findMany({
      where: {
        companyId: req.companyId,
        invoiceDate: {
          gte: startDate,
          lte: endDate
        }
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
