import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function PeriodSelector({ startDate, endDate, onChange }) {
  const [mode, setMode] = useState('month'); // 'month' | 'custom'

  const currentMonth = useMemo(() => {
    if (!startDate) return { month: new Date().getMonth(), year: new Date().getFullYear() };
    const d = new Date(startDate);
    return { month: d.getMonth(), year: d.getFullYear() };
  }, [startDate]);

  const handleMonthNav = (dir) => {
    let { month, year } = currentMonth;
    month += dir;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    onChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
  };

  const handleCustom = (field, value) => {
    if (field === 'start') onChange(value, endDate);
    else onChange(startDate, value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-surface border border-line rounded-xl px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 text-ink-muted">
        <Calendar size={16} />
        <span className="text-xs font-semibold uppercase tracking-wide">Período</span>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button type="button" onClick={() => setMode('month')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${mode === 'month' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
          Mes
        </button>
        <button type="button" onClick={() => setMode('custom')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${mode === 'custom' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
          Rango
        </button>
      </div>

      {mode === 'month' ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => handleMonthNav(-1)} aria-label="Mes anterior"
            className="p-1 rounded-md hover:bg-surface-muted text-ink-muted">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-ink min-w-[140px] text-center">
            {MONTHS[currentMonth.month]} {currentMonth.year}
          </span>
          <button type="button" onClick={() => handleMonthNav(1)} aria-label="Mes siguiente"
            className="p-1 rounded-md hover:bg-surface-muted text-ink-muted">
            <ChevronRight size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input type="date" value={startDate || ''} onChange={(e) => handleCustom('start', e.target.value)}
            className="text-sm border border-line rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={endDate || ''} onChange={(e) => handleCustom('end', e.target.value)}
            className="text-sm border border-line rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
      )}
    </div>
  );
}
