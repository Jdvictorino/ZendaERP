import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { DEFAULT_CUSTOMER_CATEGORIES, wholesaleRows } from '../services/categoryPrices.js';
import { sameCategory } from '../services/categoryPricing.js';

const router = express.Router();
const prisma = new PrismaClient();
router.use(authenticate);

// GET /category-prices/summary - cuántos precios tiene cada categoría
router.get('/summary', async (req, res) => {
  try {
    const groups = await prisma.categoryPrice.groupBy({ by: ['category'], where: { companyId: req.companyId }, _count: { _all: true } });
    res.json(Object.fromEntries(groups.map((g) => [g.category, g._count._all])));
  } catch (error) {
    console.error('Error en resumen de precios por categoría:', error);
    res.status(500).json({ error: 'Error al obtener el resumen de precios' });
  }
});

// POST /category-prices/import-wholesale - pasa Product.wholesalePrice a la categoría Mayorista (idempotente)
router.post('/import-wholesale', authorize('admin', 'manager'), async (req, res) => {
  try {
    const companyId = req.companyId;
    const { created, customerCategories } = await prisma.$transaction(async (tx) => {
      // Mismo bloqueo que toda escritura de settings y la emisión de NCF; además serializa el doble clic
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ncf:${companyId}`}))::text`;
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { settings: true } });
      const settings = company?.settings || {};
      const list = settings.customerCategories || DEFAULT_CUSTOMER_CATEGORIES;
      let categories = list;
      let category = list.find((c) => sameCategory(c, 'Mayorista'));
      if (!category) {
        category = 'Mayorista';
        await tx.company.update({ where: { id: companyId }, data: { settings: { ...settings, customerCategories: (categories = [...list, category]) } } });
      }
      const products = await tx.product.findMany({ where: { companyId, status: 'active', wholesalePrice: { gt: 0 } }, select: { id: true, wholesalePrice: true } });
      const existing = await tx.categoryPrice.findMany({ where: { companyId, category }, select: { productId: true, category: true, packagingId: true, minQuantity: true } });
      const rows = wholesaleRows(products, existing, category).map((r) => ({ ...r, companyId }));
      if (rows.length) await tx.categoryPrice.createMany({ data: rows });
      return { created: rows.length, customerCategories: categories };
    });
    res.json({ created, customerCategories });
  } catch (error) {
    console.error('Error al importar precios al por mayor:', error);
    res.status(500).json({ error: 'Error al importar los precios al por mayor' });
  }
});

export default router;
