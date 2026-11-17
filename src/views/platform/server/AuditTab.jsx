import React, { useEffect, useState } from 'react';
import { consoleApi } from '../../../api/client.js';
import Button from '../../../components/ui/Button.jsx';
import { formatDateTime } from '../shared.jsx';

const KINDS = ['', 'totp_setup', 'unlock_ok', 'unlock_fail', 'terminal_open', 'terminal_command', 'terminal_close', 'sql'];

export default function AuditTab({ sessionToken }) {
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    consoleApi.audit(sessionToken, { kind, page }).then(setData).catch((e) => setError(e.message));
  }, [sessionToken, kind, page]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">El registro de comandos es aproximado: el autocompletado, el historial y editores como vim no se registran fielmente.</p>
      <select aria-label="Filtrar por tipo" className="input-base max-w-xs" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
        {KINDS.map((k) => <option key={k} value={k}>{k || 'Todos los tipos'}</option>)}
      </select>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-muted"><th className="p-3">Fecha</th><th className="p-3">IP</th><th className="p-3">Tipo</th><th className="p-3">Detalle</th></tr></thead>
          <tbody>
            {data.data.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="p-3 whitespace-nowrap">{formatDateTime(r.at)}</td>
                <td className="p-3">{r.ip}</td>
                <td className="p-3">{r.kind}</td>
                <td className="p-3 font-mono text-xs break-all">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
        <span>Página {page}</span>
        <Button variant="secondary" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
