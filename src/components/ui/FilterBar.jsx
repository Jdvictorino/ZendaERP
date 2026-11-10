import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Barra de filtros única para las vistas con listados: búsqueda primero, filtros a continuación
 * (cada uno con su etiqueta) y a la derecha el conteo de resultados y "Limpiar" si hay filtros activos.
 */
export default function FilterBar({ children, count, total, noun = 'registros', active = false, onClear, className = '' }) {
  return (
    <section aria-label="Filtros" className={`card p-4 flex flex-wrap items-end gap-3 ${className}`}>
      {children}
      {(count !== undefined || (active && onClear)) && (
        <div className="ml-auto h-10 flex items-center gap-3">
          {active && onClear && (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 focus:outline-none focus-visible:underline">
              <X size={14} /> Limpiar
            </button>
          )}
          {count !== undefined && (
            <p className="text-sm text-ink-muted tabular-nums whitespace-nowrap" aria-live="polite">
              {total !== undefined && total !== count ? `${count} de ${total}` : count} {noun}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Un filtro con su etiqueta. El control (select, input…) va como hijo y recibe el id. */
export function FilterField({ label, children, className = 'w-full sm:w-48' }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-muted mb-1">{label}</label>
      {React.cloneElement(React.Children.only(children), { id })}
    </div>
  );
}

/** Búsqueda de texto: ocupa el espacio libre de la barra. */
export function SearchField({ value, onChange, placeholder, label = 'Buscar', className = 'flex-1 min-w-[14rem]' }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-muted mb-1">{label}</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-base pl-9" />
      </div>
    </div>
  );
}

/** Rango de fechas con etiquetas explícitas "Desde" y "Hasta". */
export function DateRangeField({ from, to, onFromChange, onToChange, fromLabel = 'Desde', toLabel = 'Hasta' }) {
  return (
    <>
      <FilterField label={fromLabel} className="w-[calc(50%-0.375rem)] sm:w-40">
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} className="input-base" />
      </FilterField>
      <FilterField label={toLabel} className="w-[calc(50%-0.375rem)] sm:w-40">
        <input type="date" value={to} min={from || undefined} onChange={(e) => onToChange(e.target.value)} className="input-base" />
      </FilterField>
    </>
  );
}
