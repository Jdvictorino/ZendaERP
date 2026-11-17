import { describe, it, expect, vi } from 'vitest';
import { attachTerminal } from '../backend/src/services/terminalSession.js';

const fakeWs = () => {
  const h = {};
  return { h, sent: [], closed: null, on: (e, f) => { h[e] = f; }, send(d) { this.sent.push(d); }, close(c, r) { this.closed = r ?? 'x'; } };
};
const fakeSsh = () => ({ written: [], ended: false, write(d) { this.written.push(d); }, resize() {}, onData(f) { this.data = f; }, onClose(f) { this.closeCb = f; }, end() { this.ended = true; } });
const setup = () => {
  const ws = fakeWs(); const ssh = fakeSsh(); const audit = vi.fn();
  const timers = [];
  const setTimer = (fn, ms) => { const t = { fn, ms, off: false }; timers.push(t); return t; };
  const clearTimer = (t) => { if (t) t.off = true; };
  attachTerminal({ ws, email: 'a@b', ip: '1.1.1.1', connectSsh: async () => ssh, audit, setTimer, clearTimer });
  return { ws, ssh, audit, timers };
};
const kinds = (a) => a.mock.calls.map((c) => c[0].kind);
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('terminalSession', () => {
  it('una segunda sesión cierra la primera', async () => {
    const a = setup(); await tick();
    const b = setup(); await tick();
    expect(a.ws.closed).toBe('Sesión reemplazada por otra pestaña');
    expect(a.ssh.ended).toBe(true);
    b.ws.h.close();
  });
  it('10 min sin entrada cierra por inactividad', async () => {
    const a = setup(); await tick();
    const idle = a.timers.find((t) => t.ms === 600000 && !t.off);
    idle.fn();
    expect(a.ws.closed).toBe('Sesión cerrada por inactividad');
  });
  it('cerrar el WebSocket termina SSH, registra comandos y cierre', async () => {
    const a = setup(); await tick();
    a.ws.h.message(JSON.stringify({ t: 'in', d: 'ls\r' }));
    a.ws.h.close();
    expect(a.ssh.written).toEqual(['ls\r']);
    expect(a.ssh.ended).toBe(true);
    expect(kinds(a.audit)).toEqual(['terminal_open', 'terminal_command', 'terminal_close']);
  });
  it('cerrar SSH cierra el WebSocket', async () => {
    const a = setup(); await tick();
    a.ssh.closeCb();
    expect(a.ws.closed).toBe('Conexión SSH cerrada');
    expect(kinds(a.audit)).toContain('terminal_close');
  });
});
