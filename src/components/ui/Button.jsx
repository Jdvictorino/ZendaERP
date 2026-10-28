import React from 'react';

const base = 'inline-flex items-center justify-center font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded-lg disabled:opacity-50 disabled:pointer-events-none';

const variants = {
  primary: 'bg-brand-600 hover:bg-brand-700 text-white focus-visible:ring-brand-500 shadow-sm',
  secondary: 'bg-surface hover:bg-surface-muted text-ink border border-line focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 shadow-sm',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus-visible:ring-gray-200 dark:hover:bg-gray-800 dark:text-gray-200 dark:focus-visible:ring-gray-700',
  danger: 'bg-danger-600 hover:bg-danger-700 text-white focus-visible:ring-danger-600 shadow-sm',
};

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  const cls = `${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
