import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachTerminal } from '../backend/src/services/terminalSession.js';

const fakeWs = () => {
  const h = {};
  return { h, pings: 0, ping() { this.pings++; }, sent: [], closed: null, on: (e, f) => { h[e] = f; }, send(d) { this.sent.push(d); }, close(c, r) { this.closed = r ?? 'x'; } };
};
const fakeSsh = () => ({ written: [], sizes: [], ended: false, write(d) { this.written.push(d); }, resize(c, r) { this.sizes.push([c, r]); }, onData(f) { this.data = f; }, onClose(f) { this.closeCb = f; }, end() { this.ended = true; } });
const opened = [];
afterEach(() => { opened.forEach((w) => w.h.close?.()); opened.length = 0; });
const setup = (connect) => {
  const ws = fakeWs(); const ssh = fakeSsh(); opened.push(ws); const audit = vi.fn();
  const timers = [];
  const setTimer = (fn, ms) => { const t = { fn, ms, off: false }; timers.push(t); return t; };
  const clearTimer = (t) => { if (t) t.off = true; };
  const tickers = [];
  const setTicker = (fn, ms) => { const t = { fn, ms, off: false }; tickers.push(t); return t; };
  const clearTicker = (t) => { if (t) t.off = true; };
  attachTerminal({ ws, email: 'a@b', ip: '1.1.1.1', connectSsh: connect || (async () => ssh), audit, setTimer, clearTimer, setTicker, clearTicker });
  return { ws, ssh, audit, timers, tickers };
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
  it('la entrada reinicia el temporizador de inactividad', async () => {
    const a = setup(); await tick();
    const first = a.timers.find((t) => t.ms === 600000 && !t.off);
    a.ws.h.message(JSON.stringify({ t: 'in', d: 'x' }));
    expect(first.off).toBe(true);
    expect(a.timers.filter((t) => t.ms === 600000 && !t.off)).toHaveLength(1);
  });
  it('un fallo de connectSsh libera la sesión y registra el cierre', async () => {
    const a = setup(async () => { throw new Error('sin llave'); }); await tick();
    expect(a.ws.closed).toBe('sin llave');
    expect(kinds(a.audit)).toEqual(['terminal_open', 'terminal_close']);
    const b = setup(); await tick();
    expect(b.ws.closed).toBe(null);
  });
  it('un mensaje tras el cierre no escribe en SSH', async () => {
    const a = setup(); await tick();
    a.ws.h.close();
    a.ws.h.message(JSON.stringify({ t: 'in', d: 'x' }));
    expect(a.ssh.written).toEqual([]);
  });
  it('el detail de auditoría es siempre texto y el cierre incluye motivo y segundos', async () => {
    const a = setup(); await tick();
    a.ws.h.message(JSON.stringify({ t: 'in', d: 'ls\r' }));
    a.ws.h.close();
    const details = a.audit.mock.calls.map((c) => c[0].detail);
    expect(details.every((d) => typeof d === 'string')).toBe(true);
    expect(details).toContain('ls');
    const close = details[details.length - 1];
    expect(close).toContain('cerrada');
    expect(close).toContain('s)');
  });
  it('un resize anterior a SSH se aplica al conectar', async () => {
    let go; const ssh = fakeSsh();
    const a = setup(() => new Promise((r) => { go = () => r(ssh); }));
    a.ws.h.message(JSON.stringify({ t: 'resize', cols: 120, rows: 40 }));
    go(); await tick();
    expect(ssh.sizes).toEqual([[120, 40]]);
  });
  it('envía ping cada 30 s sin reiniciar la inactividad y lo detiene al cerrar', async () => {
    const a = setup(); await tick();
    const tk = a.tickers[0];
    expect(tk.ms).toBe(30000);
    const idle = a.timers.find((t) => t.ms === 600000 && !t.off);
    tk.fn();
    expect(a.ws.pings).toBe(1);
    expect(idle.off).toBe(false);
    a.ws.h.close();
    expect(tk.off).toBe(true);
  });
});
