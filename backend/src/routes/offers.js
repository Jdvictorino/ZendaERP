import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const offerSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['percentage', 'fixed']).default('percentage'),
  value: z.union([z.number(), z.string()]).transform(v => Number(v) || 0),
  appliesTo: z.enum(['all', 'category', 'product']).default('all'),
  appliesToIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).optional(), // Frontend usa estos nombres
  categoryIds: z.array(z.string()).optional(),
  minPurchase: z.union([z.number(), z.string()]).optional().transform(v => v ? Number(v) : 0),
  usageLimit: z.union([z.number(), z.string(), z.null()]).optional().transform(v => v && v !== '' ? parseInt(v, 10) : null),
  perUserLimit: z.union([z.number(), z.string(), z.null()]).optional(),
  startAt: z.string().optional().nullable().transform(v => v && v !== '' ? v : null),
  endAt: z.string().optional().nullable().transform(v => v && v !== '' ? v : null),
  active: z.boolean().default(true)
}).passthrough();

// Transforma los IDs según el tipo de aplicación
function getAppliesToIds(data) {
  if (data.appliesTo === 'product' && Array.isArray(data.productIds)) {
    return data.productIds;
  }
  if (data.appliesTo === 'category' && Array.isArray(data.categoryIds)) {
    return data.categoryIds;
  }
  if (Array.isArray(data.appliesToIds)) {
    return data.appliesToIds;
  }
  return [];
}

/**
 * GET /api/offers
 */
router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;
    
    const where = { companyId: req.companyId };
    if (active !== undefined) {
      where.status = active === 'true' ? 'active' : 'inactive';
    }

    const offers = await prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    // Transformar a formato compatible con frontend
    const transformed = offers.map(o => ({
      id: o.id,
      code: o.name, // Usando name como code
      name: o.name,
      description: o.description,
      type: o.discountType === 'percent' ? 'percentage' : (o.discountType || 'fixed'),
      value: Number(o.discountValue || 0),
      appliesTo: o.appliesTo || 'all',
      appliesToIds: o.appliesToIds || [],
      minPurchase: Number(o.minPurchase || 0),
      usageLimit: o.maxUses,
      timesUsed: o.currentUses,
      startAt: o.validFrom?.toISOString(),
      endAt: o.validUntil?.toISOString(),
      active: o.status === 'active',
      createdAt: o.createdAt
    }));

    res.json({ data: transformed });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/offers/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const offer = await prisma.offer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    const transformed = {
      id: offer.id,
      code: offer.name,
      name: offer.name,
      description: offer.description,
      type: offer.discountType === 'percent' ? 'percentage' : (offer.discountType || 'fixed'),
      value: Number(offer.discountValue || 0),
      appliesTo: offer.appliesTo || 'all',
      appliesToIds: offer.appliesToIds || [],
      minPurchase: Number(offer.minPurchase || 0),
      usageLimit: offer.maxUses,
      timesUsed: offer.currentUses,
      startAt: offer.validFrom?.toISOString(),
      endAt: offer.validUntil?.toISOString(),
      active: offer.status === 'active',
      createdAt: offer.createdAt
    };

    res.json(transformed);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/offers
 */
router.post('/', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = offerSchema.parse(req.body);
    const appliesToIds = getAppliesToIds(data);

    const offer = await prisma.offer.create({
      data: {
        companyId: req.companyId,
        name: data.code,
        description: data.description || data.name || '',
        discountType: data.type === 'percentage' ? 'percent' : 'fixed',
        discountValue: data.value,
        minPurchase: data.minPurchase || 0,
        maxUses: data.usageLimit || null,
        currentUses: 0,
        appliesTo: data.appliesTo,
        appliesToIds: appliesToIds,
        validFrom: data.startAt ? new Date(data.startAt) : null,
        validUntil: data.endAt ? new Date(data.endAt) : null,
        status: data.active ? 'active' : 'inactive'
      }
    });

    res.status(201).json({
      id: offer.id,
      code: offer.name,
      name: offer.name,
      type: data.type,
      value: data.value,
      active: data.active
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/offers/:id
 */
router.put('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = offerSchema.partial().parse(req.body);

    const existing = await prisma.offer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    const updateData = {};
    if (data.code !== undefined) updateData.name = data.code;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.discountType = data.type === 'percentage' ? 'percent' : 'fixed';
    if (data.value !== undefined) updateData.discountValue = data.value;
    if (data.minPurchase !== undefined) updateData.minPurchase = data.minPurchase;
    if (data.usageLimit !== undefined) updateData.maxUses = data.usageLimit;
    if (data.appliesTo !== undefined) updateData.appliesTo = data.appliesTo;
    if (data.appliesToIds !== undefined) updateData.appliesToIds = data.appliesToIds;
    if (data.startAt !== undefined) updateData.validFrom = data.startAt ? new Date(data.startAt) : null;
    if (data.endAt !== undefined) updateData.validUntil = data.endAt ? new Date(data.endAt) : null;
    if (data.active !== undefined) updateData.status = data.active ? 'active' : 'inactive';

    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      id: offer.id,
      code: offer.name,
      name: offer.name,
      active: offer.status === 'active'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/offers/:id/toggle
 * Activar/desactivar oferta
 */
router.patch('/:id/toggle', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.offer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: { status: existing.status === 'active' ? 'inactive' : 'active' }
    });

    res.json({ 
      id: offer.id, 
      active: offer.status === 'active' 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/offers/:id
 */
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.offer.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    await prisma.offer.delete({ where: { id: req.params.id } });
    res.json({ message: 'Oferta eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
