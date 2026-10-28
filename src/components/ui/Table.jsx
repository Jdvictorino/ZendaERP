import React from 'react';

/**
 * Table component con diseño consistente
 */
export function Table({ children, className = '' }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}

/**
 * Table header component
 */
export function TableHeader({ children, className = '' }) {
  return (
    <thead className={`bg-surface-muted dark:bg-gray-800 ${className}`}>
      {children}
    </thead>
  );
}

/**
 * Table row component
 */
export function TableRow({ children, className = '', hover = true }) {
  return (
    <tr className={`border-b border-line dark:border-gray-700 ${hover ? 'hover:bg-surface-muted dark:hover:bg-gray-800 transition-colors' : ''} ${className}`}>
      {children}
    </tr>
  );
}

/**
 * Table cell component (th o td)
 */
export function TableCell({ children, as = 'td', className = '', ...props }) {
  const Component = as;
  const baseClass = as === 'th' 
    ? 'px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'
    : 'px-4 py-3 text-sm text-gray-900 dark:text-gray-100';
  
  return (
    <Component className={`${baseClass} ${className}`} {...props}>
      {children}
    </Component>
  );
}
