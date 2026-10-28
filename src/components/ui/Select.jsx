import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Select component estilizado y consistente
 */
export default function Select({ 
  label, 
  error, 
  className = '', 
  ...props 
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-ink-soft dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select 
          className="input-base appearance-none pr-10" 
          {...props}
        >
          {props.children}
        </select>
        <ChevronDown 
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" 
          size={18} 
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
