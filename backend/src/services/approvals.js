import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { requireJwtSecret } from './security.js';

export const APPROVERS = {
  shift_open: ['admin', 'manager', 'supervisor'],
  shift_close_tolerance: ['admin', 'manager', 'supervisor'],
  price_override: ['admin', 'manager'],
};

export const canSelfApprove = (role, action) => !!APPROVERS[action]?.includes(role);

// shortcut: memoria de un solo proceso, pasar a la base si hay más de una instancia
const used = new Map(); // jti -> vencimiento (ms)

const denied = (message) => Object.assign(new Error(message), { status: 403 });

export function issueApproval({ action, companyId, approverId }) {
  return jwt.sign(
    { type: 'approval', action, companyId, approverId },
    requireJwtSecret(process.env),
    { expiresIn: '2m', jwtid: randomUUID() }
  );
}

export function consumeApproval(token, { action, companyId }) {
  let d;
  try { d = jwt.verify(token, requireJwtSecret(process.env)); } catch { throw denied('La autorización no es válida o ya se usó.'); }
  const now = Date.now();
  for (const [jti, exp] of used) if (exp <= now) used.delete(jti);
  if (d.type !== 'approval' || d.action !== action || d.companyId !== companyId || !d.jti || used.has(d.jti)) {
    throw denied('La autorización no es válida o ya se usó.');
  }
  used.set(d.jti, d.exp * 1000);
  return { approverId: d.approverId };
}

export async function requireApproval(req, res, action) {
  const role = req.user.isAdmin ? 'admin' : req.user.role;
  if (canSelfApprove(role, action)) return null;
  const token = req.get?.('X-Approval-Token') ?? req.headers?.['x-approval-token'];
  let error = 'Esta acción necesita el PIN de un gerente o administrador.';
  if (token) {
    try { return consumeApproval(token, { action, companyId: req.companyId ?? req.user.companyId }).approverId; }
    catch (e) { error = e.message; }
  }
  res.status(403).json({ error, code: 'APPROVAL_REQUIRED', action });
  return false;
}
