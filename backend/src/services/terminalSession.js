import crypto from 'node:crypto';
import fs from 'node:fs';
import { Client } from 'ssh2';
import { createCommandRecorder } from './commandRecorder.js';

const IDLE_MS = 10 * 60 * 1000;
const MAX_MS = 8 * 60 * 60 * 1000;
let active = null; // cierra la sesión vigente: una terminal a la vez

export function attachTerminal({ ws, email, ip, connectSsh, audit, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  active?.close('Sesión reemplazada por otra pestaña');
  const sessionId = crypto.randomUUID();
  const started = now();
  const rec = createCommandRecorder();
  const log = (kind, detail) => audit({ kind, detail, sessionId, email, ip });
  let ssh = null;
  let done = false;
  let idle;

  const close = (reason) => {
    if (done) return;
    done = true;
    if (active === self) active = null;
    clearTimer(idle); clearTimer(maxTimer);
    try { ssh?.end(); } catch { /* ya cerrada */ }
    try { if (reason) ws.send(reason); ws.close(1000, reason); } catch { /* ya cerrado */ }
    log('terminal_close', { reason: reason || 'cerrada', seconds: Math.round((now() - started) / 1000) });
  };
  const self = { close };
  active = self;
  const resetIdle = () => { clearTimer(idle); idle = setTimer(() => close('Sesión cerrada por inactividad'), IDLE_MS); };
  const maxTimer = setTimer(() => close('Sesión cerrada por tiempo máximo'), MAX_MS);
  resetIdle();
  log('terminal_open', {});

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!ssh) return;
    if (m.t === 'in' && typeof m.d === 'string') {
      resetIdle();
      ssh.write(m.d);
      for (const l of rec.input(m.d)) log('terminal_command', { command: l });
    } else if (m.t === 'resize') ssh.resize(Number(m.cols) || 80, Number(m.rows) || 24);
  });
  ws.on('close', () => close(null));

  connectSsh(process.env).then((s) => {
    if (done) { s.end(); return; }
    ssh = s;
    s.onData((d) => { rec.output(d.toString()); ws.send(d, { binary: true }); });
    s.onClose(() => close('Conexión SSH cerrada'));
  }).catch((e) => close(e.message || 'No se pudo conectar por SSH'));
}

const norm = (f) => String(f).replace(/^SHA256:/, '').replace(/=+$/, '');

export function connectSsh(env) {
  return new Promise((resolve, reject) => {
    const keyPath = env.CONSOLE_SSH_KEY_PATH;
    const fp = env.CONSOLE_SSH_HOST_FINGERPRINT;
    if (!keyPath || !fs.existsSync(keyPath)) return reject(new Error('Falta la llave SSH de la consola (CONSOLE_SSH_KEY_PATH)'));
    if (!fp) return reject(new Error('Falta la huella del servidor (CONSOLE_SSH_HOST_FINGERPRINT)'));
    const conn = new Client();
    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
        if (err) { conn.end(); return reject(err); }
        resolve({
          write: (d) => stream.write(d),
          resize: (cols, rows) => stream.setWindow(rows, cols, 0, 0),
          onData: (cb) => stream.on('data', cb),
          onClose: (cb) => stream.on('close', cb),
          end: () => conn.end(),
        });
      });
    });
    conn.on('error', (e) => reject(new Error(`SSH: ${e.message}`)));
    conn.connect({
      host: env.CONSOLE_SSH_HOST || 'host.docker.internal',
      username: env.CONSOLE_SSH_USER || 'zenda',
      privateKey: fs.readFileSync(keyPath),
      hostVerifier: (key) => norm(crypto.createHash('sha256').update(key).digest('base64')) === norm(fp),
      readyTimeout: 15000,
    });
  });
}
