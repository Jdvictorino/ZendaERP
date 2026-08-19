import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const alertSchema = z.object({
  type: z.string(),
  title: z.string(),
  message: z.string().optional(),
  data: z.any().optional(),
  targetRoles: z.array(z.string()).default(['admin', 'manager'])
});

/**
 * GET /api/alerts
 * Obtiene alertas filtradas por el rol del usuario
 */
router.get('/', async (req, res, next) => {
  try {
    const { unreadOnly = 'true', limit = 20 } = req.query;
    const userRole = req.user.role;
    
    // Solo admin y manager reciben alertas
    if (!['admin', 'manager'].includes(userRole)) {
      return res.json({ data: [], unreadCount: 0 });
    }

    const where = {
      companyId: req.companyId,
      targetRoles: { has: userRole }
    };
    
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const [alerts, unreadCount] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit)
      }),
      prisma.alert.count({
        where: {
          companyId: req.companyId,
          targetRoles: { has: userRole },
          isRead: false
        }
      })
    ]);

    res.json({ data: alerts, unreadCount });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts
 * Crea una nueva alerta (uso interno)
 */
router.post('/', async (req, res, next) => {
  try {
    const data = alertSchema.parse(req.body);
    
    const alert = await prisma.alert.create({
      data: {
        ...data,
        companyId: req.companyId
      }
    });

    res.status(201).json(alert);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/alerts/:id/read
 * Marca una alerta como leída
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const alert = await prisma.alert.updateMany({
      where: {
        id: req.params.id,
        companyId: req.companyId
      },
      data: {
        isRead: true,
        readAt: new Date(),
        readByUserId: req.user.id
      }
    });

    if (alert.count === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/alerts/read-all
 * Marca todas las alertas como leídas
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    const userRole = req.user.role;
    
    await prisma.alert.updateMany({
      where: {
        companyId: req.companyId,
        targetRoles: { has: userRole },
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date(),
        readByUserId: req.user.id
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/alerts/:id
 * Elimina una alerta
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.alert.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.companyId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Función helper para crear alertas desde otros módulos
 */
export async function createAlert(companyId, { type, title, message, data, targetRoles = ['admin', 'manager'] }) {
  return prisma.alert.create({
    data: {
      companyId,
      type,
      title,
      message,
      data,
      targetRoles
    }
  });
}

export default router;
