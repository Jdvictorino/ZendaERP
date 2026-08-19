import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { Sliders, Download, Plus } from 'lucide-react';
import { computeTrialBalance, ACCOUNT_TYPE_LABELS, ACCOUNTS } from '../../utils/chartOfAccounts.js';

export default function BalanceAjustado({ entries = [], currency = 'DOP' }) {
  const [adjustments, setAdjustments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newAdj, setNewAdj] = useState({ accountCode: ACCOUNTS.DEPRECIATION.code, debit: 0, credit: 0, desc: '' });

  const trialBalance = useMemo(() => computeTrialBalance(entries), [entries]);

  // Merge adjustments into balance
  const adjustedRows = useMemo(() => {
    return trialBalance.map(row => {
      const adj = adjustments.filter(a => a.accountCode === row.account.code);
      const adjDebit = adj.reduce((s, a) => s + Number(a.debit || 0), 0);
      const adjCredit = adj.reduce((s, a) => s + Number(a.credit || 0), 0);
      return {
        ...row,
        adjDebit,
        adjCredit,
        adjustedDebit: row.totalDebit + adjDebit,
        adjustedCredit: row.totalCredit + adjCredit,
        adjustedBalance: (row.totalDebit + adjDebit) - (row.totalCredit + adjCredit),
      };
    });
  }, [trialBalance, adjustments]);

  const totals = useMemo(() => ({
    debit: adjustedRows.reduce((s, r) => s + r.totalDebit, 0),
    credit: adjustedRows.reduce((s, r) => s + r.totalCredit, 0),
    adjDebit: adjustedRows.reduce((s, r) => s + r.adjDebit, 0),
    adjCredit: adjustedRows.reduce((s, r) => s + r.adjCredit, 0),
    adjTotalDebit: adjustedRows.reduce((s, r) => s + r.adjustedDebit, 0),
    adjTotalCredit: adjustedRows.reduce((s, r) => s + r.adjustedCredit, 0),
  }), [adjustedRows]);

  const handleAddAdjustment = (e) => {
    e.preventDefault();
    if (!newAdj.accountCode || (Number(newAdj.debit) === 0 && Number(newAdj.credit) === 0)) return;
    setAdjustments(prev => [...prev, { ...newAdj, id: Date.now() }]);
    setNewAdj({ accountCode: ACCOUNTS.DEPRECIATION.code, debit: 0, credit: 0, desc: '' });
    setShowForm(false);
  };

  const exportCsv = () => {
    const headers = ['Código', 'Cuenta', 'Debe', 'Haber', 'Ajuste Debe', 'Ajuste Haber', 'Debe Ajustado', 'Haber Ajustado', 'Saldo'];
    const csv = [headers, ...adjustedRows.map(r => [
      r.account.code, r.account.name,
      r.totalDebit.toFixed(2), r.totalCredit.toFixed(2),
      r.adjDebit.toFixed(2), r.adjCredit.toFixed(2),
      r.adjustedDebit.toFixed(2), r.adjustedCredit.toFixed(2),
      r.adjustedBalance.toFixed(2)
    ])].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `balance-ajustado-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Group by account type
  const typeOrder = ['activo', 'pasivo', 'capital', 'ingreso', 'gasto', 'costo'];
  const grouped = useMemo(() => {
    const map = {};
    adjustedRows.forEach(r => {
      const t = r.account.type;
      if (!map[t]) map[t] = [];
      map[t].push(r);
    });
    return typeOrder.filter(t => map[t]).map(t => ({ type: t, items: map[t] }));
  }, [adjustedRows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Balance Ajustado" icon={<Sliders size={18} />} actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              <Plus size={14} /> Agregar Ajuste
            </button>
            <button onClick={exportCsv} disabled={!adjustedRows.length}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">
              <Download size={14} /> Exportar
            </button>
          </div>
        } />

        {showForm && (
          <div className="border-b border-gray-200 bg-indigo-50 p-4">
            <form onSubmit={handleAddAdjustment} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Cuenta</label>
                <select value={newAdj.accountCode} onChange={e => setNewAdj(p => ({...p, accountCode: e.target.value}))}
                  className="block mt-1 text-sm border-gray-300 rounded-lg px-3 py-1.5">
                  {trialBalance.map(r => (
                    <option key={r.account.code} value={r.account.code}>{r.account.code} — {r.account.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Debe</label>
                <input type="number" min="0" step="0.01" value={newAdj.debit}
                  onChange={e => setNewAdj(p => ({...p, debit: e.target.value}))}
                  className="block mt-1 text-sm border-gray-300 rounded-lg px-3 py-1.5 w-28" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Haber</label>
                <input type="number" min="0" step="0.01" value={newAdj.credit}
                  onChange={e => setNewAdj(p => ({...p, credit: e.target.value}))}
                  className="block mt-1 text-sm border-gray-300 rounded-lg px-3 py-1.5 w-28" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descripción</label>
                <input type="text" value={newAdj.desc} onChange={e => setNewAdj(p => ({...p, desc: e.target.value}))}
                  placeholder="Ej: Depreciación mensual"
                  className="block mt-1 text-sm border-gray-300 rounded-lg px-3 py-1.5 w-48" />
              </div>
              <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Agregar
              </button>
            </form>
            {adjustments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {adjustments.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-xs px-2 py-1 rounded-full">
                    {a.accountCode} · D:{Number(a.debit).toFixed(0)} H:{Number(a.credit).toFixed(0)}
                    <button onClick={() => setAdjustments(prev => prev.filter(x => x.id !== a.id))}
                      className="text-red-400 hover:text-red-600 ml-1">&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <CardBody className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 uppercase text-xs tracking-wide text-gray-500">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Cuenta</th>
                <th className="p-3 text-right">Debe</th>
                <th className="p-3 text-right">Haber</th>
                <th className="p-3 text-right text-indigo-600">Aj. Debe</th>
                <th className="p-3 text-right text-indigo-600">Aj. Haber</th>
                <th className="p-3 text-right bg-indigo-50">Debe Aj.</th>
                <th className="p-3 text-right bg-indigo-50">Haber Aj.</th>
              </tr>
            </thead>
            <tbody>
              {adjustedRows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-gray-400">No hay datos en este período.</td></tr>
              )}
              {grouped.map(({ type, items }) => (
                <React.Fragment key={type}>
                  <tr className="bg-gray-100">
                    <td colSpan={8} className="p-2 pl-3 text-xs font-bold uppercase tracking-wider text-gray-600">
                      {ACCOUNT_TYPE_LABELS[type] || type}
                    </td>
                  </tr>
                  {items.map(r => (
                    <tr key={r.account.code} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3 font-mono text-indigo-600">{r.account.code}</td>
                      <td className="p-3 font-medium text-gray-800">{r.account.name}</td>
                      <td className="p-3 text-right">{r.totalDebit > 0 ? formatCurrency(r.totalDebit, currency) : '—'}</td>
                      <td className="p-3 text-right">{r.totalCredit > 0 ? formatCurrency(r.totalCredit, currency) : '—'}</td>
                      <td className="p-3 text-right text-indigo-600">{r.adjDebit > 0 ? formatCurrency(r.adjDebit, currency) : ''}</td>
                      <td className="p-3 text-right text-indigo-600">{r.adjCredit > 0 ? formatCurrency(r.adjCredit, currency) : ''}</td>
                      <td className="p-3 text-right bg-indigo-50/50 font-semibold">{r.adjustedDebit > 0 ? formatCurrency(r.adjustedDebit, currency) : '—'}</td>
                      <td className="p-3 text-right bg-indigo-50/50 font-semibold">{r.adjustedCredit > 0 ? formatCurrency(r.adjustedCredit, currency) : '—'}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            {adjustedRows.length > 0 && (
              <tfoot className="bg-indigo-50 font-bold text-sm">
                <tr>
                  <td colSpan={2} className="p-3 text-right">Totales:</td>
                  <td className="p-3 text-right">{formatCurrency(totals.debit, currency)}</td>
                  <td className="p-3 text-right">{formatCurrency(totals.credit, currency)}</td>
                  <td className="p-3 text-right text-indigo-700">{formatCurrency(totals.adjDebit, currency)}</td>
                  <td className="p-3 text-right text-indigo-700">{formatCurrency(totals.adjCredit, currency)}</td>
                  <td className="p-3 text-right text-indigo-800">{formatCurrency(totals.adjTotalDebit, currency)}</td>
                  <td className="p-3 text-right text-indigo-800">{formatCurrency(totals.adjTotalCredit, currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
