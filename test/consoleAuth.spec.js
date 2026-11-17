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

const { setupTotp, confirmTotp, unlockConsole } = await import('../backend/src/services/consoleAuth.js');
const { totpAt } = await import('../backend/src/services/totp.js');

function fakePrisma() {
  let row = null; const logs = [];
  const match = (r, w) => Object.entries(w).every(([k, v]) =>
    v && typeof v === 'object' && 'lt' in v ? r[k] < v.lt : r[k] === v);
  return {
    logs, row: () => row,
    platformSecurity: {
      findUnique: async () => row && { ...row },
      create: async ({ data }) => { if (row) throw new Error('unique'); row = { totpSecret: null, totpConfirmedAt: null, lastTotpStep: -1, ...data }; },
      updateMany: async ({ where, data }) => (row && match(row, where) ? (Object.assign(row, data), { count: 1 }) : { count: 0 })
    },
    platformAuditLog: { create: async ({ data }) => { logs.push(data); } }
  };
}
const req = { headers: {}, ip: '1.1.1.1', platformOwner: { email: 'owner@zenda.test' } };
const nowCode = (secret, off = 0) => totpAt(secret, Math.floor(Date.now() / 30000) + off);
const secretOf = (db) => db.row().totpSecret;

describe('flujos TOTP', () => {
  it('confirm tras un setup que cambió el secreto -> 409 y no queda confirmado', async () => {
    const db = fakePrisma();
    await setupTotp(db, req);
    const stale = secretOf(db);
    const realUpdate = db.platformSecurity.updateMany;
    // simula el setup concurrente justo después de que confirm leyó el secreto
    db.platformSecurity.updateMany = async (a) => {
      db.platformSecurity.updateMany = realUpdate;
      await setupTotp(db, req);
      return realUpdate(a);
    };
    const r = await confirmTotp(db, req, nowCode(stale));
    expect(r.status).toBe(409);
    expect(db.row().totpConfirmedAt).toBeNull();
    expect(db.row().totpSecret).not.toBe(stale);
  });
  it('setup tras confirmar -> 409 y audita QR generado en setups previos', async () => {
    const db = fakePrisma();
    await setupTotp(db, req);
    expect(db.logs[0]).toMatchObject({ kind: 'totp_setup', detail: 'QR generado' });
    expect((await confirmTotp(db, req, nowCode(secretOf(db)))).status).toBe(200);
    expect((await setupTotp(db, req)).status).toBe(409);
  });
  it('mismo código dos veces en /unlock -> el segundo falla', async () => {
    const db = fakePrisma();
    await setupTotp(db, req);
    const s = secretOf(db);
    await confirmTotp(db, req, nowCode(s));
    const c = createWindowCounter(5, 900000);
    // el paso usado al confirmar ya está quemado; usa el siguiente
    const code = nowCode(s, 1);
    expect((await unlockConsole(db, req, code, c)).status).toBe(200);
    expect((await unlockConsole(db, req, code, c)).status).toBe(400);
  });
  it('429 antes de revisar el código tras 5 fallos', async () => {
    const db = fakePrisma();
    await setupTotp(db, req);
    const s = secretOf(db);
    await confirmTotp(db, req, nowCode(s));
    const c = createWindowCounter(5, 900000);
    for (let i = 0; i < 5; i++) expect((await unlockConsole(db, req, '000000', c)).status).toBe(400);
    expect((await unlockConsole(db, req, nowCode(s, 1), c)).status).toBe(429);
  });
  it('código numérico se rellena a 6 dígitos', async () => {
    const db = fakePrisma();
    await setupTotp(db, req);
    const s = secretOf(db);
    const code = nowCode(s);
    expect((await confirmTotp(db, req, Number(code))).status).toBe(200);
  });
});
