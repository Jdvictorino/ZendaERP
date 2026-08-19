import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { Layers, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { groupByAccount, ACCOUNT_TYPE_LABELS } from '../../utils/chartOfAccounts.js';

function exportMayorCsv(groups, currency) {
  const headers = ['Código', 'Cuenta', 'Tipo', `Debe Total (${currency})`, `Haber Total (${currency})`, `Saldo (${currency})`];
  const rows = groups.map(g => [
    g.account.code, g.account.name, ACCOUNT_TYPE_LABELS[g.account.type] || g.account.type,
    g.totalDebit.toFixed(2), g.totalCredit.toFixed(2), (g.totalDebit - g.totalCredit).toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mayor-general-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function MayorGeneral({ entries = [], currency = 'DOP' }) {
  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => groupByAccount(entries), [entries]);

  // Group by account type for visual sections
  const sections = useMemo(() => {
    const map = {};
    groups.forEach(g => {
      const t = g.account.type;
      if (!map[t]) map[t] = [];
      map[t].push(g);
    });
    return Object.entries(map).sort(([a], [b]) => {
      const order = ['activo', 'pasivo', 'capital', 'ingreso', 'gasto', 'costo'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [groups]);

  const toggle = (code) => setExpanded(p => ({ ...p, [code]: !p[code] }));

  return (
    <Card>
      <CardHeader title="Mayor General" icon={<Layers size={18} />} actions={
        <button onClick={() => exportMayorCsv(groups, currency)} disabled={!groups.length}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">
          <Download size={14} /> Exportar
        </button>
      } />
      <CardBody>
        {groups.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay movimientos en este período.</p>
        )}

        {sections.map(([type, accountGroups]) => (
          <div key={type} className="mb-6">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2 border-b border-gray-200 pb-1">
              {ACCOUNT_TYPE_LABELS[type] || type}
            </h3>

            {accountGroups.map(g => {
              const balance = g.totalDebit - g.totalCredit;
              const isOpen = expanded[g.account.code];
              
              return (
                <div key={g.account.code} className="border border-gray-100 rounded-lg mb-2 overflow-hidden">
                  <button type="button" onClick={() => toggle(g.account.code)}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 px-4 py-3 text-left transition-colors">
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{g.account.code}</span>
                      <span className="font-semibold text-gray-800">{g.account.name}</span>
                      <span className="text-xs text-gray-400">({g.entries.length} mov.)</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-500">D: <span className="font-semibold text-gray-800">{formatCurrency(g.totalDebit, currency)}</span></span>
                      <span className="text-gray-500">H: <span className="font-semibold text-gray-800">{formatCurrency(g.totalCredit, currency)}</span></span>
                      <span className={`font-bold ${balance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        Saldo: {formatCurrency(Math.abs(balance), currency)} {balance < 0 ? '(Cr)' : '(Dr)'}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white text-xs text-gray-400 uppercase">
                          <tr>
                            <th className="p-2 pl-12 text-left">Fecha</th>
                            <th className="p-2 text-left">Referencia</th>
                            <th className="p-2 text-left">Descripción</th>
                            <th className="p-2 text-right">Debe</th>
                            <th className="p-2 text-right">Haber</th>
                            <th className="p-2 text-right">Saldo Acum.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.entries.map((e, i) => {
                            const runBal = g.entries.slice(0, i + 1).reduce((s, x) => s + x.debit - x.credit, 0);
                            return (
                              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="p-2 pl-12 whitespace-nowrap text-gray-600">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                                <td className="p-2 font-mono text-xs text-gray-500">{e.ref}</td>
                                <td className="p-2 text-gray-600 max-w-[200px] truncate">{e.desc}</td>
                                <td className="p-2 text-right">{e.debit > 0 ? formatCurrency(e.debit, currency) : ''}</td>
                                <td className="p-2 text-right">{e.credit > 0 ? formatCurrency(e.credit, currency) : ''}</td>
                                <td className={`p-2 text-right font-medium ${runBal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  {formatCurrency(Math.abs(runBal), currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
