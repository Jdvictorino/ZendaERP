import prisma from '../db.js';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { rolesFor } from '../permissions.js';
import { dueRows, registerWhatsapp, sendReminders, smtpReady } from '../services/reminderSender.js';

const router = Router();
router.use(authenticate, authorize(...rolesFor('finance-accounts-receivable')));

const bodySchema = z.object({
  items: z.array(z.object({ invoiceId: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), stage: z.number().int() })),
});

// req.company es un select parcial (sin teléfono, correo ni moneda): se carga la empresa completa.
const fullCompany = (req) => prisma.company.findUnique({ where: { id: req.companyId } });

router.get('/due', async (req, res, next) => {
  try {
    const company = await fullCompany(req);
    res.json({ rows: await dueRows({ company }), smtpReady: smtpReady(company) });
  } catch (e) { next(e); }
});

router.post('/send', async (req, res, next) => {
  try {
    const { items } = bodySchema.parse(req.body);
    if (items.length > 100) return res.status(400).json({ error: 'Máximo 100 recordatorios por envío.' });
    const company = await fullCompany(req);
    if (!smtpReady(company)) return res.status(400).json({ error: 'Configura el correo de la empresa en Configuración para enviar recordatorios.' });
    res.json(await sendReminders({ company, items, userId: req.user.id }));
  } catch (e) { next(e); }
});

const waSchema = z.object({ invoiceId: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), stage: z.number().int() });

router.post('/whatsapp', async (req, res, next) => {
  try {
    const item = waSchema.parse(req.body);
    res.json(await registerWhatsapp({ company: await fullCompany(req), item, userId: req.user.id }));
  } catch (e) { next(e); }
});

export default router;
