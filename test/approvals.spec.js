import { describe, it, expect, vi } from 'vitest';
import jwt from '../backend/node_modules/jsonwebtoken/index.js';

process.env.JWT_SECRET = 'x'.repeat(40);
const { canSelfApprove, issueApproval, consumeApproval, requireApproval } = await import('../backend/src/services/approvals.js');

const resMock = () => { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r; };
const ctx = { action: 'shift_open', companyId: 'c1' };

describe('canSelfApprove', () => {
  it('según el rol y la acción', () => {
    expect(canSelfApprove('supervisor', 'shift_open')).toBe(true);
    expect(canSelfApprove('supervisor', 'price_override')).toBe(false);
    expect(canSelfApprove('cashier', 'shift_open')).toBe(false);
  });
});

describe('consumeApproval', () => {
  const tok = () => issueApproval({ ...ctx, approverId: 'a1' });
  it('se consume una sola vez', () => {
    const t = tok();
    expect(consumeApproval(t, ctx)).toEqual({ approverId: 'a1' });
    expect(() => consumeApproval(t, ctx)).toThrow();
  });
  it('rechaza otra acción u otra empresa', () => {
    expect(() => consumeApproval(tok(), { ...ctx, action: 'price_override' })).toThrow();
    expect(() => consumeApproval(tok(), { ...ctx, companyId: 'c2' })).toThrow();
  });
  it('rechaza vencidos y basura con status 403', () => {
    const old = jwt.sign({ type: 'approval', ...ctx, approverId: 'a1', jti: 'j' }, process.env.JWT_SECRET, { expiresIn: -1 });
    expect(() => consumeApproval(old, ctx)).toThrow();
    expect(() => consumeApproval('basura', ctx)).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe('requireApproval', () => {
  const cashier = { role: 'cashier', companyId: 'c1' };
  it('cajero sin cabecera: 403', async () => {
    const res = resMock();
    const r = await requireApproval({ user: cashier, companyId: 'c1', headers: {} }, res, 'shift_open');
    expect(r).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Esta acción necesita el PIN de un gerente o administrador.', code: 'APPROVAL_REQUIRED', action: 'shift_open' });
  });
  it('con token válido devuelve el aprobador; el dueño se aprueba solo', async () => {
    const t = issueApproval({ ...ctx, approverId: 'a9' });
    expect(await requireApproval({ user: cashier, companyId: 'c1', headers: { 'x-approval-token': t } }, resMock(), 'shift_open')).toBe('a9');
    expect(await requireApproval({ user: { role: 'cashier', isAdmin: true }, headers: {} }, resMock(), 'price_override')).toBeNull();
  });
});
