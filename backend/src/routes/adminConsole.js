import { Router } from 'express';
import prisma from '../db.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { requireConsole, ticketStore, setupTotp, confirmTotp, unlockConsole } from '../services/consoleAuth.js';

const router = Router();
router.use(requirePlatformAdmin);

const flow = (fn) => async (req, res, next) => {
  try {
    const r = await fn(req);
    res.status(r.status).json(r.body);
  } catch (e) { next(e); }
};

router.get('/totp/status', flow(async () => {
  const sec = await prisma.platformSecurity.findUnique({ where: { id: 1 } });
  return { status: 200, body: { configured: !!sec?.totpConfirmedAt } };
}));
router.post('/totp/setup', flow((req) => setupTotp(prisma, req)));
router.post('/totp/confirm', flow((req) => confirmTotp(prisma, req, req.body?.code)));
router.post('/unlock', flow((req) => unlockConsole(prisma, req, req.body?.code)));

router.post('/ticket', requireConsole, (req, res) => {
  res.json({ ticket: ticketStore.issue(req.platformOwner.email) });
});

router.get('/audit', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const where = req.query.kind ? { kind: String(req.query.kind) } : {};
    const [data, total] = await Promise.all([
      prisma.platformAuditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * 50, take: 50 }),
      prisma.platformAuditLog.count({ where })
    ]);
    res.json({ data, total });
  } catch (e) { next(e); }
});

export default router;
