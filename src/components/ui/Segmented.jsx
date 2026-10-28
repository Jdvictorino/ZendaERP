import React from 'react';

/**
 * Selector de una opción entre pocas (2-4), en lugar de radios nativos.
 * options: [{ value, label }]
 */
export default function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex w-full rounded-lg bg-gray-100 dark:bg-gray-800 p-1 ${className}`}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 h-8 px-3 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
