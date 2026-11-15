import React from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency.js';

// Marco común de las ventanas de caja (abrir turno, cerrar turno, reportes): encabezado fijo,
// cuerpo con scroll y acciones siempre visibles abajo, también en pantallas bajas.
export default function ShiftDialog({ title, subtitle, onClose, footer, width = 'max-w-lg', children }) {
  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[70] p-4">
      <div className={`modal-panel w-full ${width} max-h-[92vh] flex flex-col overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="modal-close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-line bg-surface-muted/60">{footer}</div>
        )}
      </div>
    </div>
  );
}

const BILLS = [2000, 1000, 500, 200, 100, 50];
const COINS = [25, 10, 5, 1];

export const emptyCount = () => Object.fromEntries([...BILLS, ...COINS].map(v => [v, '']));
// Las denominaciones van sin centavos para que quepan junto al campo
const whole = (v, currency) => new Intl.NumberFormat('es-DO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);

export const countTotal = (denoms) => Object.entries(denoms).reduce((s, [v, q]) => s + Number(v) * (parseInt(q, 10) || 0), 0);

// Conteo de efectivo por denominación (billetes y monedas de RD)
export function CashCount({ denoms, setDenoms, currency, label }) {
  const row = (v) => (
    <label key={v} className="flex items-center justify-between gap-2 rounded-lg border border-line pl-3 pr-1.5 py-1.5">
      <span className="text-sm font-medium text-ink-soft tabular-nums">{whole(v, currency)}</span>
      <input
        type="number" min="0" inputMode="numeric" placeholder="0"
        aria-label={`Cantidad de ${whole(v, currency)}`}
        className="input-base w-14 shrink-0 px-2 text-right tabular-nums"
        value={denoms[v]}
        onFocus={e => e.target.select()}
        onChange={e => setDenoms(prev => ({ ...prev, [v]: e.target.value }))}
      />
    </label>
  );
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted mb-2">Billetes</p>
      <div className="grid grid-cols-2 gap-2">{BILLS.map(row)}</div>
      <p className="text-xs font-medium text-ink-muted mt-4 mb-2">Monedas</p>
      <div className="grid grid-cols-2 gap-2">{COINS.map(row)}</div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="text-xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">{formatCurrency(countTotal(denoms), currency)}</span>
      </div>
    </div>
  );
}
