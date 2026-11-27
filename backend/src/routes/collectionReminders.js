import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { rolesFor } from '../permissions.js';
import { dueRows, sendReminders, smtpReady } from '../services/reminderSender.js';

const router = Router();
router.use(authenticate, authorize(...rolesFor('finance-accounts-receivable')));

const bodySchema = z.object({
  items: z.array(z.object({ invoiceId: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), stage: z.number().int() })),
});

router.get('/due', async (req, res, next) => {
  try {
    res.json({ rows: await dueRows({ company: req.company }), smtpReady: smtpReady(req.company) });
  } catch (e) { next(e); }
});

router.post('/send', async (req, res, next) => {
  try {
    const { items } = bodySchema.parse(req.body);
    if (items.length > 100) return res.status(400).json({ error: 'Máximo 100 recordatorios por envío.' });
    if (!smtpReady(req.company)) return res.status(400).json({ error: 'Configura el correo de la empresa en Configuración para enviar recordatorios.' });
    res.json(await sendReminders({ company: req.company, items, userId: req.user.id }));
  } catch (e) { next(e); }
});

export default router;
