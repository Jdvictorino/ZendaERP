import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAlert } from './alerts.js';

const router = Router();
router.use(authenticate);

const supplierSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  rnc: z.string().optional().nullable(),
  identificationNumber: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  bankDetails: z.object({
    bankName: z.string().optional(),
    beneficiaryName: z.string().optional(),
    accountNumber: z.string().optional(),
    accountType: z.string().optional(),
    beneficiaryId: z.string().optional()
  }).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active')
});

/**
 * GET /api/suppliers
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { rnc: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json({ data: suppliers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/suppliers/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        products: { select: { id: true, name: true, stock: true } },
        expenses: {
          orderBy: { invoiceDate: 'desc' },
          take: 20
        }
      }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/suppliers
 */
router.post('/', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = supplierSchema.parse(req.body);
    
    const supplier = await prisma.supplier.create({
      data: { ...data, companyId: req.companyId }
    });

    // Crear alerta para admin/manager sobre nuevo proveedor
    try {
      await createAlert(req.companyId, {
        type: 'new_supplier',
        title: 'Nuevo Proveedor Registrado',
        message: `Se registró el proveedor: ${supplier.name}`,
        data: {
          supplierId: supplier.id,
          supplierName: supplier.name
        }
      });
    } catch (alertError) {
      console.error('Error creando alerta de proveedor:', alertError);
    }

    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/suppliers/:id
 */
router.put('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = supplierSchema.partial().parse(req.body);
    
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data
    });

    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/suppliers/:id
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.json({ message: 'Proveedor eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/suppliers/:id/status
 */
router.patch('/:id/status', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

export default router;
