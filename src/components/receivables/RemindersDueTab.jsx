import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { collectionReminders } from '../../api/client.js';
import { stageLabel } from '../../utils/collectionReminders.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Button from '../ui/Button.jsx';
import Card, { CardBody } from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';

const BATCH = 20; // lotes en serie: un servidor de correo lento no pasa el tiempo de espera del proxy
const keyOf = (r) => `${r.invoiceId}|${r.dueDate}|${r.stage}`;
const ddmmyyyy = (s) => String(s).slice(0, 10).split('-').reverse().join('/');

export default function RemindersDueTab({ currency }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await collectionReminders.due());
      setSelected(new Set());
    } catch (e) {
      toast.error(e.message || 'No se pudieron cargar los recordatorios');
      setData((d) => d || { rows: [], smtpReady: true });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const smtpReady = data ? data.smtpReady : true;
  const sendable = rows.filter((r) => r.emailStatus === 'ok');
  const money = (n) => formatCurrency(Number(n) || 0, currency);

  const send = async (list) => {
    if (!list.length || sending) return;
    setSending(true);
    const total = { sent: 0, failed: 0, skipped: 0 };
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        const items = list.slice(i, i + BATCH).map(({ invoiceId, dueDate, stage }) => ({ invoiceId, dueDate, stage }));
        for (const x of await collectionReminders.send(items)) total[x.status] = (total[x.status] || 0) + 1;
      }
    } catch (e) {
      toast.error(e.message || 'No se pudo enviar');
    }
    const msg = `Enviados ${total.sent}, fallaron ${total.failed}${total.skipped ? `, omitidos ${total.skipped}` : ''}`;
    if (total.sent + total.failed + total.skipped) (total.failed ? toast.error : toast.success)(msg);
    setSending(false);
    await load();
  };

  const toggle = (k) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOn = sendable.length > 0 && sendable.every((r) => selected.has(keyOf(r)));
  const chosen = sendable.filter((r) => selected.has(keyOf(r)));

  if (!data) return <p className="text-sm text-ink-muted">Cargando…</p>;

  return (
    <div className="space-y-4">
      {!smtpReady && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Configura el correo de la empresa en Configuración para enviar recordatorios
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{rows.length} {rows.length === 1 ? 'factura' : 'facturas'} por recordar hoy</p>
        <Button size="sm" disabled={!smtpReady || sending || !chosen.length} onClick={() => send(chosen)}>
          Enviar seleccionados{chosen.length ? ` (${chosen.length})` : ''}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nada por recordar hoy" />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-gray-800 text-ink-soft uppercase tracking-wide text-xs">
                <tr>
                  <th className="p-3 w-8">
                    <input type="checkbox" aria-label="Seleccionar todas" checked={allOn} disabled={!smtpReady || !sendable.length}
                      onChange={() => setSelected(allOn ? new Set() : new Set(sendable.map(keyOf)))} />
                  </th>
                  <th className="p-3">Cliente</th><th className="p-3">Factura</th><th className="p-3">Vence</th>
                  <th className="p-3">Etapa</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Saldo</th>
                  <th className="p-3">Último envío</th><th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ok = r.emailStatus === 'ok';
                  return (
                    <tr key={keyOf(r)} className="border-t border-line">
                      <td className="p-3">
                        {ok && <input type="checkbox" aria-label={`Seleccionar ${r.invoiceNumber}`} disabled={!smtpReady} checked={selected.has(keyOf(r))} onChange={() => toggle(keyOf(r))} />}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-ink">{r.customerName}</div>
                        <div className="text-xs text-ink-muted">
                          {r.emailStatus === 'missing' ? 'Sin correo' : r.emailStatus === 'invalid' ? `Correo inválido: ${r.email}` : r.email}
                        </div>
                      </td>
                      <td className="p-3">{r.invoiceNumber}</td>
                      <td className="p-3 whitespace-nowrap">{ddmmyyyy(r.dueDate)}</td>
                      <td className="p-3">{stageLabel(r.stage)}</td>
                      <td className="p-3 text-right tabular-nums">{money(r.amount)}</td>
                      <td className="p-3 text-right tabular-nums">{money(r.balance)}</td>
                      <td className="p-3 text-xs">
                        {r.failed ? <span className="text-red-600">Falló: {r.failed.error || 'error desconocido'}</span>
                          : r.lastSentAt ? ddmmyyyy(r.lastSentAt) : <span className="text-ink-muted">Nunca</span>}
                      </td>
                      <td className="p-3 text-right">
                        {ok && <Button size="sm" disabled={!smtpReady || sending} onClick={() => send([r])}>{r.failed ? 'Reintentar' : 'Enviar'}</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
