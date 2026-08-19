import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const categorySchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active')
});

/**
 * GET /api/categories
 */
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;

    const categories = await prisma.productCategory.findMany({
      where,
      include: {
        _count: { select: { products: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/categories
 */
router.post('/', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    
    const category = await prisma.productCategory.create({
      data: { ...data, companyId: req.companyId }
    });

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/categories/:id
 */
router.put('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    
    const existing = await prisma.productCategory.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const category = await prisma.productCategory.update({
      where: { id: req.params.id },
      data
    });

    res.json(category);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/categories/:id
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.productCategory.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Verificar si tiene productos
    const productCount = await prisma.product.count({
      where: { categoryId: req.params.id }
    });

    if (productCount > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar. La categoría tiene ${productCount} productos asociados.` 
      });
    }

    await prisma.productCategory.delete({ where: { id: req.params.id } });
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
