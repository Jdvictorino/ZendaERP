import React, { useEffect, useRef, useState } from 'react';
import { consoleApi } from '../../../api/client.js';
import Button from '../../../components/ui/Button.jsx';

export default function TerminalTab({ sessionToken, onLocked }) {
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
      const socket = new WebSocket(consoleApi.terminalUrl(ticket));
      socket.binaryType = 'arraybuffer';
      ws.current = socket;
      let reason = 'Sesión cerrada';
      const send = (m) => socket.readyState === 1 && socket.send(JSON.stringify(m));
      socket.onopen = () => { setState('Conectado'); send({ t: 'resize', cols: t.cols, rows: t.rows }); };
      socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') reason = ev.data;
        else t.write(new Uint8Array(ev.data));
      };
      socket.onclose = () => { setState(reason); setClosed(true); };
      const d1 = t.onData((d) => send({ t: 'in', d }));
      const onResize = () => { fit.fit(); send({ t: 'resize', cols: t.cols, rows: t.rows }); };
      window.addEventListener('resize', onResize);
      cleanup = () => { window.removeEventListener('resize', onResize); d1.dispose(); socket.close(); t.dispose(); };
    })();
    return () => { dead = true; cleanup(); };
  }, [sessionToken, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-muted" role="status">{state}</span>
        <div className="flex-1" />
        {closed && <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Reconectar</Button>}
        <Button size="sm" variant="secondary" onClick={() => { ws.current?.close(); consoleApi.lock(); onLocked(); }}>Cerrar sesión</Button>
      </div>
      <div ref={host} className="rounded-lg bg-[#0b0f14] p-2 h-[28rem]" />
      <p className="text-xs text-ink-muted">Para tareas largas usa <code>nohup … &amp;</code></p>
    </div>
  );
}
