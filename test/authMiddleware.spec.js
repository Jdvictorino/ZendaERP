import { describe, it, expect, vi } from 'vitest';
import jwt from '../backend/node_modules/jsonwebtoken/index.js';

const findUnique = vi.fn();
vi.mock('../backend/src/db.js', () => ({ default: { user: { findUnique } } }));
process.env.JWT_SECRET = 'x'.repeat(40);
const { authenticate, optionalAuth } = await import('../backend/src/middleware/auth.js');

const reqWith = (payload) => ({ headers: { authorization: `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}` } });
const resMock = () => { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r; };

describe('el token de refresco no autentica', () => {
  it('authenticate responde 401', async () => {
    const res = resMock(); const next = vi.fn();
    await authenticate(reqWith({ userId: 'u', type: 'refresh' }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('optionalAuth sigue sin usuario', async () => {
    const req = reqWith({ userId: 'u', type: 'refresh' }); const next = vi.fn();
    await optionalAuth(req, resMock(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
