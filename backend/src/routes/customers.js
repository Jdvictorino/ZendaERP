import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAlert } from './alerts.js';
import { paymentTermsOf } from '../services/paymentTerms.js';
import { termIdForCreditDays } from '../services/invoiceTerms.js';
import { customerTaxFields, exemptionChangeError, normalizeCustomerId, customerIdError } from '../services/customerTax.js';

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
  paymentTermId: z.string().nullable().optional(),
  remindersOff: z.boolean().optional(), // sin valor no cambia (las apps viejas no lo mandan); la base lo crea en false
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
    ...(data.remindersOff !== undefined && { remindersOff: data.remindersOff }),
  };

  // Mapear identificationNumber a rnc
  // Vacío no borra: las apps viejas mandan identificationNumber '' en cada edición
  const id = normalizeCustomerId(data.identificationNumber) || normalizeCustomerId(data.rnc);
  if (id) dbData.rnc = id;

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

// paymentTermId explícito (o null para quitarlo); si solo llega creditDays (apps viejas) se busca el plazo equivalente
async function applyPaymentTerm(data, parsed, companyId) {
  if (parsed.paymentTermId !== undefined) data.paymentTermId = parsed.paymentTermId || null;
  // la app 1.1.20 manda siempre 'contado' y 0 días: eso no cambia el plazo, solo creditDays > 0 lo mapea
  else if (parsed.creditDays > 0) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    const id = termIdForCreditDays(parsed.creditDays, paymentTermsOf(company?.settings));
    if (id !== undefined) data.paymentTermId = id;
  }
}

/**
 * GET /api/customers
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, category, search, page = 1, limit } = req.query;
    // Sin ?limit se devuelve la lista completa: las pantallas (caja, reportes, 607) necesitan todos los registros
    const take = limit ? parseInt(limit) : undefined;
    
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
        skip: take ? (parseInt(page) - 1) * take : undefined,
        take
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
      data: customers,
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
router.post('/', authorize(...rolesFor('customers')), async (req, res, next) => {
  try {
    const parsed = customerSchema.parse(req.body);
    const tax = customerTaxFields(req.body);
    const denied = exemptionChangeError(tax, null, req.user);
    if (denied) return res.status(403).json({ error: denied });
    const data = { ...transformCustomerData(parsed), ...tax };
    const idError = customerIdError(data.taxpayerType, data.rnc);
    if (idError) return res.status(400).json({ error: idError });
    await applyPaymentTerm(data, parsed, req.companyId);
    
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
router.put('/:id', authorize(...rolesFor('customers')), async (req, res, next) => {
  try {
    const parsed = customerSchema.partial().parse(req.body);
    const data = transformCustomerData(parsed);
    
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Un PUT sin campos de impuesto conserva los guardados
    const b = req.body;
    if (b.taxpayerType || 'exemptionNumber' in b || 'exemptionExpiresAt' in b) {
      const tax = customerTaxFields(b, existing);
      const denied = exemptionChangeError(tax, existing, req.user);
      if (denied) return res.status(403).json({ error: denied });
      Object.assign(data, tax);
    }
    const idError = customerIdError(data.taxpayerType ?? existing.taxpayerType, data.rnc ?? existing.rnc);
    if (idError) return res.status(400).json({ error: idError });

    await applyPaymentTerm(data, parsed, req.companyId);

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
