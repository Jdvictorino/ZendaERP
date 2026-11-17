import { Router } from 'express';
import prisma from '../db.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { generateSecret, verifyTotp, otpauthUri } from '../services/totp.js';
import { audit, clientIp } from '../services/platformAudit.js';
import { signConsoleToken, requireConsole, ticketStore, unlockFailures } from '../services/consoleAuth.js';

const router = Router();
router.use(requirePlatformAdmin);

const getSec = () => prisma.platformSecurity.findUnique({ where: { id: 1 } });
// Cualquier excepción (secreto corrupto) cuenta como código inválido
const check = (secret, code, lastStep) => {
  try { return verifyTotp(secret, String(code || ''), { lastStep }); } catch { return null; }
};

router.get('/totp/status', async (req, res) => {
  const sec = await getSec();
  res.json({ configured: !!sec?.totpConfirmedAt });
});

router.post('/totp/setup', async (req, res) => {
  const sec = await getSec();
  if (sec?.totpConfirmedAt) return res.status(409).json({ error: 'El segundo factor ya está configurado' });
  const secret = generateSecret();
  await prisma.platformSecurity.upsert({
    where: { id: 1 }, create: { id: 1, totpSecret: secret }, update: { totpSecret: secret }
  });
  res.json({ otpauthUri: otpauthUri(secret, req.platformOwner.email) });
});

router.post('/totp/confirm', async (req, res) => {
  const sec = await getSec();
  if (!sec?.totpSecret || sec.totpConfirmedAt) return res.status(409).json({ error: 'Genera primero el código QR' });
  const step = check(sec.totpSecret, req.body?.code, sec.lastTotpStep);
  if (step == null) return res.status(400).json({ error: 'Código incorrecto' });
  await prisma.platformSecurity.update({ where: { id: 1 }, data: { totpConfirmedAt: new Date(), lastTotpStep: step } });
  await audit(prisma, { req, kind: 'totp_setup', detail: 'Segundo factor configurado' });
  res.json({ ok: true });
});

router.post('/unlock', async (req, res) => {
  const ip = clientIp(req);
  const sec = await getSec();
  if (!sec?.totpConfirmedAt) return res.status(409).json({ error: 'Configura primero tu app autenticadora' });
  // si alguna clave ya está en el límite, bloquea antes de revisar el código
  if (unlockFailures.count(ip) >= 5 || unlockFailures.count('global') >= 5) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });

  const step = check(sec.totpSecret, req.body?.code, sec.lastTotpStep);
  let ok = false;
  if (step != null) {
    const { count } = await prisma.platformSecurity.updateMany({
      where: { id: 1, lastTotpStep: { lt: step } }, data: { lastTotpStep: step }
    });
    ok = count === 1;
  }
  if (!ok) {
    unlockFailures.hit(ip); unlockFailures.hit('global');
    await audit(prisma, { req, kind: 'unlock_fail', detail: 'Código incorrecto' });
    return res.status(400).json({ error: 'Código incorrecto' });
  }
  await audit(prisma, { req, kind: 'unlock_ok', detail: 'Consola desbloqueada' });
  res.json({ consoleToken: signConsoleToken(req.platformOwner.email) });
});

router.post('/ticket', requireConsole, (req, res) => {
  res.json({ ticket: ticketStore.issue(req.platformOwner.email) });
});

router.get('/audit', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = req.query.kind ? { kind: String(req.query.kind) } : {};
  const [data, total] = await Promise.all([
    prisma.platformAuditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    prisma.platformAuditLog.count({ where })
  ]);
  res.json({ data, total });
});

export default router;
