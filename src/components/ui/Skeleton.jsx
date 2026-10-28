import React from 'react';

/** Bloque gris animado. La animación se apaga sola con "reducir movimiento" (index.css). */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-800 ${className}`} />;
}

/**
 * Esqueleto de una vista típica (título, fila de KPIs y tabla) mientras cargan los datos,
 * para que la página no "salte" al llegar el contenido.
 */
export default function PageSkeleton({ kpis = 4, rows = 6, label = 'Cargando…' }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-64 mb-2" />
      <Skeleton className="h-4 w-96 max-w-full mb-6" />
      {kpis > 0 && (
        <div className="kpi-grid mb-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="card p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32 mt-3" />
            </div>
          ))}
        </div>
      )}
      <div className="card p-5 space-y-4">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-5 w-1/5" />
            <Skeleton className="h-5 w-1/4" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
