import jwt from 'jsonwebtoken';
import { requireJwtSecret } from '../services/security.js';

export function requirePlatformAdmin(req, res, next) {
  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || process.env.FIREBASE_MASTER_EMAIL || '').toLowerCase();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!ownerEmail) {
    return res.status(503).json({ error: 'PLATFORM_OWNER_EMAIL no esta configurado' });
  }

  if (!token) {
    return res.status(401).json({ error: 'No autorizado para panel administrativo' });
  }

  try {
    const decoded = jwt.verify(token, requireJwtSecret(process.env));
    if (decoded.scope !== 'platform_admin') {
      return res.status(403).json({ error: 'Token sin permisos de administrador de plataforma' });
    }
    if ((decoded.email || '').toLowerCase() !== ownerEmail) {
      return res.status(403).json({ error: 'Token no corresponde al propietario autorizado' });
    }
    req.platformOwner = { email: decoded.email };
  } catch (error) {
    return res.status(401).json({ error: 'Token de sesión inválido o expirado' });
  }

  next();
}
