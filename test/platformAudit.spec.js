// @vitest-environment node
import { clientIp, audit } from '../backend/src/services/platformAudit.js';

describe('platformAudit', () => {
  it('clientIp prefiere cf-connecting-ip', () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4' }, ip: '9.9.9.9' })).toBe('1.2.3.4');
    expect(clientIp({ headers: {}, ip: '9.9.9.9' })).toBe('9.9.9.9');
  });
  it('audit nunca rechaza', async () => {
    const prisma = { platformAuditLog: { create: async () => { throw new Error('x'); } } };
    await expect(audit(prisma, { req: { headers: {}, ip: '1' }, kind: 'sql', detail: 'd' })).resolves.toBeUndefined();
  });
  it('audit escribe los campos', async () => {
    let data;
    const prisma = { platformAuditLog: { create: async (a) => { data = a.data; } } };
    await audit(prisma, { req: { headers: {}, ip: '1' }, kind: 'sql', detail: 'd', sessionId: 's' });
    expect(data).toEqual({ ip: '1', kind: 'sql', detail: 'd', sessionId: 's' });
  });
});
