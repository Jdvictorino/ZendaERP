import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { requireJwtSecret } from './security.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { createWindowCounter } from './mailGuard.js';

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
