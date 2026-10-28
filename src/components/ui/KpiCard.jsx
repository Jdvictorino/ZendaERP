import React from 'react';

const tones = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400',
  success: 'bg-success-50 text-success-600 dark:bg-success-950/40 dark:text-success-400',
  warning: 'bg-warning-50 text-warning-600 dark:bg-warning-950/40 dark:text-warning-400',
  danger: 'bg-danger-50 text-danger-600 dark:bg-danger-950/40 dark:text-danger-400',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * Tarjeta de indicador única para toda la app: etiqueta, valor y un icono en un recuadro de color.
 * El color va solo en el icono; el valor siempre en tinta neutra para que se lea como dato.
 */
export default function KpiCard({ label, value, icon: Icon, tone = 'brand', hint, trend, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-5 text-left w-full flex flex-col ${onClick ? 'hover:border-brand-300 dark:hover:border-brand-700 transition-colors' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted line-clamp-2">{label}</p>
          {/* Un monto nunca se trunca ni se parte; .kpi-grid garantiza el ancho mínimo */}
          <p className="mt-1 text-2xl font-semibold text-ink tabular-nums whitespace-nowrap">{value}</p>
        </div>
        {Icon && (
          <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${tones[tone] || tones.brand}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <p className={`mt-2 text-xs font-semibold ${trend >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </Tag>
  );
}
