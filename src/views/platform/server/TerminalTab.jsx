import React, { useEffect, useRef, useState } from 'react';
import { consoleApi } from '../../../api/client.js';
import Button from '../../../components/ui/Button.jsx';

export default function TerminalTab({ sessionToken, onLocked, onLogout }) {
  const host = useRef(null);
  const ws = useRef(null);
  const [state, setState] = useState('Conectando…');
  const [attempt, setAttempt] = useState(0);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let dead = false;
    let cleanup = () => {};
    setClosed(false);
    setState('Conectando…');
    (async () => {
      // xterm solo se descarga al abrir esta pestaña
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css'),
      ]);
      let ticket;
      try {
        ({ ticket } = await consoleApi.ticket(sessionToken));
      } catch (e) {
        if (e.status === 401 && e.data?.code === 'CONSOLE_LOCKED') return onLocked();
        if (!dead) { setState(e.message); setClosed(true); }
        return;
      }
      if (dead) return;
      const t = new Terminal({ cursorBlink: true, fontSize: 14, theme: { background: '#0b0f14' } });
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(host.current);
      fit.fit();
      let socket;
      try {
        socket = new WebSocket(consoleApi.terminalUrl(ticket));
      } catch (e) {
        // Un bloqueo de la política de seguridad (CSP) lanza aquí en lugar de cerrar el socket
        t.dispose();
        if (!dead) { setState(`No se pudo abrir la conexión: ${e.message}`); setClosed(true); }
        return;
      }
      socket.binaryType = 'arraybuffer';
      let reason = 'Sesión cerrada';
      const send = (m) => socket.readyState === 1 && socket.send(JSON.stringify(m));
      socket.onopen = () => { setState('Conectado'); send({ t: 'resize', cols: t.cols, rows: t.rows }); };
      const detach = () => { socket.onmessage = socket.onopen = socket.onclose = socket.onerror = null; };
      let gotReason = false;
      socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') { reason = ev.data; gotReason = true; }
        else t.write(new Uint8Array(ev.data));
      };
      socket.onerror = () => { if (!gotReason) reason = 'No se pudo conectar con el servidor'; };
      socket.onclose = () => { setState(reason); setClosed(true); };
      const d1 = t.onData((d) => send({ t: 'in', d }));
      const ro = new ResizeObserver(() => { fit.fit(); send({ t: 'resize', cols: t.cols, rows: t.rows }); });
      ro.observe(host.current);
      cleanup = () => { ro.disconnect(); detach(); d1.dispose(); socket.close(); t.dispose(); };
      ws.current = { close: () => { detach(); socket.close(); } };
    })().catch((e) => { if (!dead) { setState(`No se pudo abrir la terminal: ${e.message}`); setClosed(true); } });
    return () => { dead = true; cleanup(); };
  }, [sessionToken, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-muted" role="status">{state}</span>
        <div className="flex-1" />
        {closed && <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Reconectar</Button>}
        <Button size="sm" variant="secondary" onClick={() => { ws.current?.close(); consoleApi.lock(); onLogout(); }}>Cerrar sesión</Button>
      </div>
      <div ref={host} className="rounded-lg bg-[#0b0f14] p-2 h-[28rem]" />
      <p className="text-xs text-ink-muted">Para tareas largas usa <code>nohup … &amp;</code></p>
    </div>
  );
}
