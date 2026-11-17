import React from 'react';
import { Download } from 'lucide-react';
import Button from './ui/Button.jsx';

function toCSVContent(headers, data) {
    const escape = (val) => {
        const s = String(val ?? '');
        // Escapar comillas dobles y envolver si contiene coma/nueva línea
        const needsQuotes = /[",\n]/.test(s);
        const escaped = s.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
    };
    const lines = [];
    lines.push(headers.map(escape).join(','));
    (data || []).forEach(row => {
        const line = headers.map(h => escape(row[h]));
        lines.push(line.join(','));
    });
    // BOM para Excel en Windows
    return '\uFEFF' + lines.join('\n');
}

const ReportDataTable = ({ title, headers, data = [], fileName, numeric = [], className = 'mt-10' }) => {
    const handleExportCsv = () => {
        try {
            const csv = toCSVContent(headers, data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName || (title || 'reporte').replace(/\s+/g, '_')}_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('CSV export error', e);
        }
    };
    const align = (h) => (numeric.includes(h) ? 'text-right tabular-nums' : 'text-left');

    return (
        <div className={`card ${className}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
                <div>
                    <h3 className="text-base font-semibold text-ink">{title}</h3>
                    <p className="text-sm text-ink-muted">{data.length} {data.length === 1 ? 'registro' : 'registros'}</p>
                </div>
                {data.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={handleExportCsv}><Download size={14} className="mr-1.5" /> Exportar CSV</Button>
                )}
            </div>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-full text-sm">
                    <thead className="bg-surface-muted dark:bg-gray-800/60">
                        <tr>
                            {headers.map(h => (
                                <th key={h} scope="col" className={`px-5 py-2.5 text-xs font-semibold text-ink-muted whitespace-nowrap ${align(h)}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {data.map((row, index) => (
                            <tr key={index} className="hover:bg-surface-muted dark:hover:bg-gray-800/40 transition-colors">
                                {headers.map((h, i) => (
                                    <td key={h} className={`px-5 py-3 whitespace-nowrap ${i === 0 ? 'text-ink font-medium' : 'text-ink-soft'} ${align(h)}`}>{row[h]}</td>
                                ))}
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={headers.length} className="px-5 py-12 text-center text-sm text-ink-muted">
                                    No hay registros en el período y filtros elegidos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ReportDataTable;
