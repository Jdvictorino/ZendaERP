import { describe, it, expect } from 'vitest';
import { isValidSessionId, MAX_CONNECTIONS } from '../backend/src/routes/scanner.js';
import { createWindowCounter } from '../backend/src/services/mailGuard.js';

describe('escáner', () => {
  it('acepta UUID y rechaza lo demás', () => {
    expect(isValidSessionId('3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b')).toBe(true);
    expect(isValidSessionId('3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B')).toBe(true);
    for (const bad of ['abc', '', '../x', undefined, 5]) expect(isValidSessionId(bad)).toBe(false);
  });
  it('tope de conexiones', () => expect(MAX_CONNECTIONS).toBe(500));
  it('el contador libera claves inactivas', () => {
    let t = 0;
    const c = createWindowCounter(1, 10, () => t);
    for (let i = 0; i < 1100; i++) c.hit('k' + i);
    t = 100;
    expect(c.hit('nuevo')).toBe(true);
    expect(c.hit('k0')).toBe(true);
  });
});

import router from '../backend/src/routes/scanner.js';

const handler = (method, path) =>
  router.stack.find(l => l.route?.path === path && l.route.methods[method]).route.stack[0].handle;
const mockRes = () => {
  const r = { code: 200, body: null, ended: false, setHeader() {}, flushHeaders() {}, write() {}, end() { r.ended = true; } };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const mockReq = (extra) => ({ query: {}, body: {}, on() {}, ...extra });
const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('rutas del escáner', () => {
  it('/events con sessionId inválido responde 400', () => {
    const res = mockRes();
    handler('get', '/events')(mockReq({ query: { sessionId: 'abc' } }), res);
    expect(res.code).toBe(400);
  });

  it('una segunda conexión cierra la primera', () => {
    vi.useFakeTimers();
    const closers = [];
    const mk = () => ({ ...mockReq({ query: { sessionId: ID } }), on: (e, f) => closers.push(f) });
    const a = mockRes(), b = mockRes();
    handler('get', '/events')(mk(), a);
    handler('get', '/events')(mk(), b);
    expect(a.ended).toBe(true);
    expect(b.ended).toBe(false);
    closers[0](); // el cierre de la vieja no debe tumbar a la nueva
    const scan = mockRes();
    handler('post', '/scan')(mockReq({ body: { sessionId: ID, barcode: '1' } }), scan);
    expect(scan.code).toBe(200);
    closers[1]();
    vi.useRealTimers();
  });

  it('la lectura 121 en un minuto responde 429', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    let last;
    for (let i = 0; i < 121; i++) {
      last = mockRes();
      handler('post', '/scan')(mockReq({ body: { sessionId: id, barcode: '1' } }), last);
    }
    expect(last.code).toBe(429);
  });
});
