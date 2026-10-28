import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Spinner component para estados de carga
 */
export default function Spinner({ 
  size = 'md', // sm, md, lg, xl
  fullScreen = false,
  text = null,
  className = '' 
}) {
  const sizes = {
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48
  };

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 
        size={sizes[size]} 
        className="animate-spin text-brand-600 dark:text-brand-400" 
      />
      {text && (
        <p className="text-sm text-ink-soft dark:text-gray-400">
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
}
