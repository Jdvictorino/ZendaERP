import React, { useMemo } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { Scale, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { computeTrialBalance, ACCOUNT_TYPE_LABELS } from '../../utils/chartOfAccounts.js';

function exportBalanzaCsv(rows, currency) {
  const headers = ['Código', 'Cuenta', 'Tipo', `Debe (${currency})`, `Haber (${currency})`, `Saldo (${currency})`];
  const csvRows = rows.map(r => [
    r.account.code, r.account.name, ACCOUNT_TYPE_LABELS[r.account.type] || '',
    r.totalDebit.toFixed(2), r.totalCredit.toFixed(2), r.balance.toFixed(2),
  ]);
  const csv = [headers, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `balanza-comprobacion-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function BalanzaComprobacion({ entries = [], currency = 'DOP' }) {
  const rows = useMemo(() => computeTrialBalance(entries), [entries]);

  const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  const isBalanced = Math.abs(grandDebit - grandCredit) < 0.01;

  // Group by account type
  const typeOrder = ['activo', 'pasivo', 'capital', 'ingreso', 'gasto', 'costo'];
  const grouped = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const t = r.account.type;
      if (!map[t]) map[t] = [];
      map[t].push(r);
    });
    return typeOrder.filter(t => map[t]).map(t => ({ type: t, items: map[t] }));
  }, [rows]);

  return (
    <Card>
      <CardHeader title="Balanza de Comprobación" icon={<Scale size={18} />} actions={
        <div className="flex items-center gap-3">
          {rows.length > 0 && (
            isBalanced
              ? <span className="flex items-center gap-1.5 text-xs font-semibold text-success-600 bg-success-50 px-3 py-1 rounded-full"><CheckCircle2 size={14} /> Cuadrada</span>
              : <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full"><AlertTriangle size={14} /> Descuadre</span>
          )}
          <button onClick={() => exportBalanzaCsv(rows, currency)} disabled={!rows.length}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 font-medium disabled:opacity-40">
            <Download size={14} /> Exportar
          </button>
        </div>
      } />
      <CardBody className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted uppercase text-xs tracking-wide text-ink-muted">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Cuenta</th>
              <th className="p-3 text-right">Debe</th>
              <th className="p-3 text-right">Haber</th>
              <th className="p-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400">No hay datos en este período.</td></tr>
            )}
            {grouped.map(({ type, items }) => (
              <React.Fragment key={type}>
                <tr className="bg-gray-100">
                  <td colSpan={5} className="p-2 pl-3 text-xs font-bold uppercase tracking-wider text-ink-soft">
                    {ACCOUNT_TYPE_LABELS[type] || type}
                  </td>
                </tr>
                {items.map(r => (
                  <tr key={r.account.code} className="border-b border-gray-50 hover:bg-surface-muted">
                    <td className="p-3 font-mono text-brand-600">{r.account.code}</td>
                    <td className="p-3 font-medium text-ink">{r.account.name}</td>
                    <td className="p-3 text-right">{r.totalDebit > 0 ? formatCurrency(r.totalDebit, currency) : '—'}</td>
                    <td className="p-3 text-right">{r.totalCredit > 0 ? formatCurrency(r.totalCredit, currency) : '—'}</td>
                    <td className={`p-3 text-right font-semibold ${r.balance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(r.balance), currency)} {r.balance < 0 ? '(Cr)' : '(Dr)'}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-brand-50 font-bold text-sm">
              <tr>
                <td colSpan={2} className="p-3 text-right text-ink-soft">Gran Total:</td>
                <td className="p-3 text-right text-brand-700">{formatCurrency(grandDebit, currency)}</td>
                <td className="p-3 text-right text-brand-700">{formatCurrency(grandCredit, currency)}</td>
                <td className="p-3 text-right">
                  {isBalanced
                    ? <span className="text-success-600">✅ 0.00</span>
                    : <span className="text-red-600">⚠️ {formatCurrency(Math.abs(grandDebit - grandCredit), currency)}</span>
                  }
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </CardBody>
    </Card>
  );
}
