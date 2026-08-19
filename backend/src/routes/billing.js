import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/billing/status
 * Devuelve el estado de facturacion del tenant actual.
 */
router.get('/status', async (req, res) => {
  const company = req.company || {};

  res.json({
    companyId: req.companyId,
    status: company.billingStatus || 'active',
    dueDate: company.billingDueDate || null,
    graceUntil: company.billingGraceUntil || null,
    blockedAt: company.billingBlockedAt || null,
    blockedReason: company.billingBlockedReason || null,
    lastPaymentAt: company.lastPaymentAt || null,
  });
});

export default router;
