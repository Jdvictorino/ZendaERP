import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from '../backend/node_modules/jsonwebtoken/index.js';
import { createWindowCounter } from '../backend/src/services/mailGuard.js';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.PLATFORM_OWNER_EMAIL = 'owner@zenda.test';
const { signConsoleToken, requireConsole, createTicketStore } = await import('../backend/src/services/consoleAuth.js');

const platformToken = (email = 'owner@zenda.test') =>
  jwt.sign({ scope: 'platform_admin', email }, process.env.JWT_SECRET);
const run = (headers) => new Promise((resolve) => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ res: this, body: b }); return this; } };
  requireConsole({ headers }, res, () => resolve({ res, next: true }));
});

describe('ticket store', () => {
  it('un solo uso y vence a los 31 s', () => {
    let t = 0; const s = createTicketStore(() => t);
    const a = s.issue('o@x.com'); expect(s.redeem(a)).toBe('o@x.com'); expect(s.redeem(a)).toBeNull();
    const b = s.issue('o@x.com'); t = 31000; expect(s.redeem(b)).toBeNull();
  });
});

describe('requireConsole', () => {
  it('sin token de consola -> 401 CONSOLE_LOCKED', async () => {
    const { res, body } = await run({ authorization: `Bearer ${platformToken()}` });
    expect(res.code).toBe(401); expect(body.code).toBe('CONSOLE_LOCKED');
  });
  it('token de otro correo -> 401', async () => {
    const { res } = await run({ authorization: `Bearer ${platformToken()}`, 'x-console-token': signConsoleToken('otro@x.com') });
    expect(res.code).toBe(401);
  });
  it('token válido -> next y cabecera renovada', async () => {
    const { res, next } = await run({ authorization: `Bearer ${platformToken()}`, 'x-console-token': signConsoleToken('owner@zenda.test') });
    expect(next).toBe(true);
    expect(res.h['X-Console-Token']).toBeTruthy();
    expect(res.h['Access-Control-Expose-Headers']).toBe('X-Console-Token');
  });
});

describe('contador de desbloqueo', () => {
  it('bloquea al 6.º intento', () => {
    const c = createWindowCounter(5, 900000);
    for (let i = 0; i < 5; i++) expect(c.hit('ip')).toBe(true);
    expect(c.hit('ip')).toBe(false);
    expect(c.count('ip')).toBe(5);
    expect(c.count('otra')).toBe(0);
  });
});
