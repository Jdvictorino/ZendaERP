import React, { useEffect, useRef, useState } from 'react';
import { consoleApi } from '../../../api/client.js';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';

const cell = (v) => (v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Grid({ columns, rows }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-muted">{columns.map((c) => <th key={c} className="p-2 whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {columns.map((c) => <td key={c} className="p-2 font-mono max-w-xs truncate" title={cell(r[c])}>{cell(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DatabaseTab({ sessionToken, onLocked }) {
  const [tables, setTables] = useState([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const [sql, setSql] = useState('');
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const req = useRef(0);

  const fail = (e) => (e.status === 401 && e.data?.code === 'CONSOLE_LOCKED' ? onLocked() : setError(e.message));

  useEffect(() => { consoleApi.tables(sessionToken).then((t) => { setTables(t); setError(''); }).catch(fail); }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!name) return;
    const mine = ++req.current;
    consoleApi.table(sessionToken, name, { search, page })
      .then((v) => { if (mine === req.current) { setView(v); setError(''); } })
      .catch((e) => { if (mine === req.current) fail(e); });
  }, [sessionToken, name, search, page, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(text, confirm = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await consoleApi.query(sessionToken, text, confirm);
      setResult(r);
      setPending(null);
      if (confirm && r.wrote) setReload((n) => n + 1);
    } catch (e) {
      if (e.status === 409 && !confirm) setPending(text);
      else { setPending(null); fail(e); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-[14rem_1fr] gap-4">
      <ul className="card p-2 max-h-96 overflow-y-auto text-sm">
        {tables.map((t) => (
          <li key={t.name}>
            <button type="button" onClick={() => { setName(t.name); setPage(1); setSearch(''); }}
              className={`w-full text-left px-2 py-1 rounded ${t.name === name ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40' : 'hover:bg-surface-muted'}`}>{t.name}</button>
          </li>
        ))}
      </ul>
      <div className="space-y-4 min-w-0">
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        {name && view && (
          <div className="space-y-2">
            <Input aria-label="Buscar en la tabla" placeholder="Buscar en la tabla" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <Grid columns={view.columns} rows={view.rows} />
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span>Página {page} · {view.total} filas</span>
              <Button variant="secondary" size="sm" disabled={page * 50 >= Number(view.total)} onClick={() => setPage(page + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <textarea aria-label="Consulta SQL" className="input-base font-mono h-28" placeholder="SELECT * FROM ..." value={sql} onChange={(e) => setSql(e.target.value)} />
          <Button onClick={() => run(sql)} disabled={busy || !sql.trim()}>Ejecutar</Button>
        </div>
        {result && (
          <div className="space-y-1">
            <p className="text-sm text-ink-muted">{result.rowCount} filas{result.wrote ? ' afectadas' : ''}</p>
            {result.rows?.length > 0 && <Grid columns={Object.keys(result.rows[0])} rows={result.rows} />}
          </div>
        )}
      </div>
      <Modal isOpen={!!pending} onClose={() => setPending(null)} title="Esta consulta modifica datos" size="sm">
        <pre data-testid="pending-sql" className="bg-surface-muted rounded p-3 text-xs font-mono whitespace-pre-wrap break-all mb-4">{pending}</pre>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setPending(null)}>Cancelar</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(pending, true)}>Ejecutar de todos modos</Button>
        </div>
      </Modal>
    </div>
  );
}
