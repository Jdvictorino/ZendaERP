import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { requireJwtSecret } from './security.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { createWindowCounter } from './mailGuard.js';
import { generateSecret, verifyTotp, otpauthUri } from './totp.js';
import { audit, clientIp } from './platformAudit.js';

export const signConsoleToken = (email) =>
  jwt.sign({ scope: 'platform_console', email }, requireJwtSecret(process.env), { expiresIn: '10m' });

const locked = (res) => res.status(401).json({ error: 'Verificación requerida', code: 'CONSOLE_LOCKED' });

// Exige sesión de plataforma + token de consola del mismo correo; renueva el token (10 min deslizantes).
export function requireConsole(req, res, next) {
  requirePlatformAdmin(req, res, () => {
    try {
      const d = jwt.verify(req.headers['x-console-token'] || '', requireJwtSecret(process.env));
      if (d.scope !== 'platform_console' || (d.email || '').toLowerCase() !== (req.platformOwner.email || '').toLowerCase()) {
        return locked(res);
      }
    } catch {
      return locked(res);
    }
    res.setHeader('X-Console-Token', signConsoleToken(req.platformOwner.email));
    res.setHeader('Access-Control-Expose-Headers', 'X-Console-Token');
    next();
  });
}

// shortcut: en memoria, se pierde al reiniciar (el ticket vive 30 s)
export function createTicketStore(now = Date.now) {
  const tickets = new Map();
  return {
    issue(email) {
      const t = now();
      for (const [k, v] of tickets) if (v.exp <= t) tickets.delete(k);
      const id = crypto.randomBytes(24).toString('hex');
      tickets.set(id, { email, exp: t + 30000 });
      return id;
    },
    redeem(id) {
      const v = tickets.get(id);
      tickets.delete(id);
      return v && v.exp > now() ? v.email : null;
    }
  };
}

export const ticketStore = createTicketStore();
// Fallos de desbloqueo: 5 en 15 min por IP y 5 globales
export const unlockFailures = createWindowCounter(5, 15 * 60 * 1000);

// El código puede llegar como número: se rellena a 6 dígitos solo en ese caso
const codeStr = (c) => (typeof c === 'number' ? String(c).padStart(6, '0') : String(c ?? ''));
// Cualquier excepción (secreto corrupto) cuenta como código inválido
const check = (secret, code, lastStep) => {
  try { return verifyTotp(secret, codeStr(code), { lastStep }); } catch { return null; }
};
const getSec = (prisma) => prisma.platformSecurity.findUnique({ where: { id: 1 } });

export async function setupTotp(prisma, req) {
  try { await prisma.platformSecurity.create({ data: { id: 1 } }); } catch { /* ya existe */ }
  const secret = generateSecret();
  const { count } = await prisma.platformSecurity.updateMany({
    where: { id: 1, totpConfirmedAt: null }, data: { totpSecret: secret }
  });
  if (count !== 1) return { status: 409, body: { error: 'El segundo factor ya está configurado' } };
  await audit(prisma, { req, kind: 'totp_setup', detail: 'QR generado' });
  return { status: 200, body: { otpauthUri: otpauthUri(secret, req.platformOwner.email) } };
}

export async function confirmTotp(prisma, req, code) {
  const sec = await getSec(prisma);
  if (!sec?.totpSecret || sec.totpConfirmedAt) return { status: 409, body: { error: 'Genera primero el código QR' } };
  const step = check(sec.totpSecret, code, sec.lastTotpStep);
  if (step == null) return { status: 400, body: { error: 'Código incorrecto' } };
  const { count } = await prisma.platformSecurity.updateMany({
    where: { id: 1, totpSecret: sec.totpSecret, totpConfirmedAt: null },
    data: { totpConfirmedAt: new Date(), lastTotpStep: step }
  });
  if (count !== 1) return { status: 409, body: { error: 'El código QR cambió: escanéalo de nuevo' } };
  await audit(prisma, { req, kind: 'totp_setup', detail: 'Configurado' });
  return { status: 200, body: { ok: true } };
}

export async function unlockConsole(prisma, req, code, failures = unlockFailures) {
  const ip = clientIp(req);
  const sec = await getSec(prisma);
  if (!sec?.totpConfirmedAt) return { status: 409, body: { error: 'Configura primero tu app autenticadora' } };
  // si alguna clave ya está en el límite, bloquea antes de revisar el código
  if (failures.count(ip) >= 5 || failures.count('global') >= 5) {
    return { status: 429, body: { error: 'Demasiados intentos. Espera 15 minutos.' } };
  }
  const step = check(sec.totpSecret, code, sec.lastTotpStep);
  let ok = false;
  if (step != null) {
    const { count } = await prisma.platformSecurity.updateMany({
      where: { id: 1, lastTotpStep: { lt: step } }, data: { lastTotpStep: step }
    });
    ok = count === 1;
  }
  if (!ok) {
    failures.hit(ip); failures.hit('global');
    await audit(prisma, { req, kind: 'unlock_fail', detail: 'Código incorrecto' });
    return { status: 400, body: { error: 'Código incorrecto' } };
  }
  await audit(prisma, { req, kind: 'unlock_ok', detail: 'Consola desbloqueada' });
  return { status: 200, body: { consoleToken: signConsoleToken(req.platformOwner.email) } };
}
