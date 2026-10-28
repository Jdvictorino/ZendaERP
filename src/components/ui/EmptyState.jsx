import React from 'react';

/**
 * Estado vacío único: icono, título, explicación y una acción opcional.
 * Dentro de una tabla ancha, el contenido queda fijo en la parte visible (sticky) para móvil.
 */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`sticky left-0 w-[calc(100vw-5rem)] sm:w-auto flex flex-col items-center text-center gap-2 py-10 px-4 ${className}`}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-muted flex items-center justify-center text-gray-400 dark:text-gray-500 mb-1">
          <Icon size={24} />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
