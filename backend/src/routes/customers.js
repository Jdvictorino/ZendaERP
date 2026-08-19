import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAlert } from './alerts.js';

const router = Router();
router.use(authenticate);

// Schema flexible que acepta los campos del frontend y los transforma
const customerSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  customerCode: z.string().optional(),
  rnc: z.string().optional(),
  identificationNumber: z.string().optional(), // Frontend envía esto, lo mapeamos a rnc
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional(),
  address: z.union([z.string(), z.object({}).passthrough()]).optional(), // Puede ser string u objeto
  category: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  // Campos adicionales del frontend (se ignoran para DB pero no causan error)
  type: z.string().optional(),
  accountType: z.string().optional(),
  defaultDiscount: z.number().optional(),
  creditDays: z.number().optional(),
  notes: z.string().optional(),
  logo: z.string().optional(),
}).passthrough();

// Transforma los datos del frontend al formato de la base de datos
function transformCustomerData(data) {
  const dbData = {
    name: data.name,
    customerCode: data.customerCode,
    email: data.email || null,
    phone: data.phone || null,
    category: data.category || null,
    creditLimit: data.creditLimit || 0,
    status: data.status || 'active',
  };

  // Mapear identificationNumber a rnc
  if (data.identificationNumber) {
    dbData.rnc = data.identificationNumber.replace(/\D/g, '');
  } else if (data.rnc) {
    dbData.rnc = data.rnc;
  }

  // Convertir address objeto a string si es necesario
  if (data.address) {
    if (typeof data.address === 'object') {
      const parts = [data.address.street, data.address.sector, data.address.city, data.address.zipCode, data.address.country];
      dbData.address = parts.filter(Boolean).join(', ');
    } else {
      dbData.address = data.address;
    }
  }

  return dbData;
}

/**
 * GET /api/customers
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, category, search, page = 1, limit = 50 } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { rnc: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
      data: customers,
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
 * GET /api/customers/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        invoices: {
          orderBy: { date: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            total: true,
            status: true,
            date: true
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(customer);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/customers
 */
router.post('/', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const parsed = customerSchema.parse(req.body);
    const data = transformCustomerData(parsed);
    
    // Generar código si no viene
    if (!data.customerCode) {
      data.customerCode = `CLI-${Date.now()}`;
    }
    
    const customer = await prisma.customer.create({
      data: { ...data, companyId: req.companyId }
    });

    // Crear alerta para admin/manager sobre nuevo cliente
    try {
      await createAlert(req.companyId, {
        type: 'new_customer',
        title: 'Nuevo Cliente Registrado',
        message: `Se registró el cliente: ${customer.name}`,
        data: {
          customerId: customer.id,
          customerName: customer.name,
          category: customer.category || null
        }
      });
    } catch (alertError) {
      console.error('Error creando alerta de cliente:', alertError);
    }

    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/customers/:id
 */
router.put('/:id', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const parsed = customerSchema.partial().parse(req.body);
    const data = transformCustomerData(parsed);
    
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data
    });

    res.json(customer);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/customers/:id
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ message: 'Cliente eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/customers/:id/status
 */
router.patch('/:id/status', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json(customer);
  } catch (error) {
    next(error);
  }
});

export default router;
