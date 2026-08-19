import React from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { BookOpen, Download } from 'lucide-react';

function exportDiarioCsv(entries, currency) {
  if (!entries.length) return;
  const headers = ['Fecha', 'Referencia', 'Cuenta', 'Código', 'Descripción', `Debe (${currency})`, `Haber (${currency})`];
  const rows = entries.map(e => [
    e.date ? new Date(e.date).toLocaleDateString() : '',
    e.ref || '', e.account.name, e.account.code, e.desc || '',
    e.debit.toFixed(2), e.credit.toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diario-general-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function DiarioGeneral({ entries = [], currency = 'DOP' }) {
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <Card>
      <CardHeader title="Diario General" icon={<BookOpen size={18} />} actions={
        <button onClick={() => exportDiarioCsv(entries, currency)} disabled={!entries.length}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">
          <Download size={14} /> Exportar
        </button>
      } />
      <CardBody className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead className="bg-gray-50 uppercase text-xs tracking-wide text-gray-500">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Referencia</th>
              <th className="p-3">Código</th>
              <th className="p-3">Cuenta</th>
              <th className="p-3">Descripción</th>
              <th className="p-3 text-right">Debe</th>
              <th className="p-3 text-right">Haber</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay asientos en este período.</td></tr>
            )}
            {entries.map((e, i) => (
              <tr key={i} className="border-b last:border-transparent hover:bg-gray-50">
                <td className="p-3 whitespace-nowrap text-gray-700">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                <td className="p-3 font-mono text-xs text-gray-500">{e.ref}</td>
                <td className="p-3 font-mono text-xs text-indigo-600">{e.account.code}</td>
                <td className={`p-3 font-medium ${e.credit > 0 && e.debit === 0 ? 'pl-8 text-gray-600' : 'text-gray-800'}`}>
                  {e.account.name}
                </td>
                <td className="p-3 text-gray-600 max-w-[200px] truncate">{e.desc}</td>
                <td className="p-3 text-right font-semibold text-gray-800">
                  {e.debit > 0 ? formatCurrency(e.debit, currency) : ''}
                </td>
                <td className="p-3 text-right font-semibold text-gray-800">
                  {e.credit > 0 ? formatCurrency(e.credit, currency) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="bg-gray-50 font-bold text-sm">
              <tr>
                <td colSpan={5} className="p-3 text-right">Totales:</td>
                <td className="p-3 text-right text-indigo-700">{formatCurrency(totalDebit, currency)}</td>
                <td className="p-3 text-right text-indigo-700">{formatCurrency(totalCredit, currency)}</td>
              </tr>
              <tr>
                <td colSpan={7} className="p-3 text-right">
                  {Math.abs(totalDebit - totalCredit) < 0.01
                    ? <span className="text-emerald-600 font-semibold">✅ Cuadre verificado</span>
                    : <span className="text-red-600 font-semibold">⚠️ Descuadre: {formatCurrency(Math.abs(totalDebit - totalCredit), currency)}</span>
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
