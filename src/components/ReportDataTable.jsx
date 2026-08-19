import React from 'react';

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

const ReportDataTable = ({ title, headers, data, fileName }) => {
    const handleExportCsv = () => {
        try {
            const csv = toCSVContent(headers, data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName || (title || 'reporte').replace(/\s+/g,'_')}_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('CSV export error', e);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-[2.5rem] shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 mt-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h3 className="font-bold text-2xl text-gray-900 dark:text-gray-100 tracking-tight">{title}</h3>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
                        {data?.length || 0} registros encontrados
                    </p>
                </div>
                {data?.length > 0 && (
                    <button 
                        className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-brand-500/20 active:scale-95 flex items-center gap-2" 
                        onClick={handleExportCsv}
                    >
                        Exportar Datos
                    </button>
                )}
            </div>
            <div className="overflow-x-auto -mx-6 sm:mx-0 custom-scrollbar">
                <div className="inline-block min-w-full align-middle">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                {headers.map(h => (
                                    <th key={h} className="px-5 py-4 text-left text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em]">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {data.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group">
                                    {headers.map(h => (
                                        <td key={h} className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {row[h]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={headers.length} className="px-5 py-16 text-center">
                                        <div className="flex flex-col items-center">
                                            <p className="text-sm font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest italic">
                                                Sin datos disponibles
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReportDataTable;