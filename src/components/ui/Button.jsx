import React from 'react';

const base = 'inline-flex items-center justify-center font-bold tracking-tight transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 rounded-2xl disabled:opacity-50 disabled:pointer-events-none active:scale-95';

const variants = {
  primary: 'bg-brand-500 hover:bg-brand-600 text-white focus:ring-brand-500 shadow-lg shadow-brand-500/25',
  secondary: 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 focus:ring-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-100 dark:border-gray-700 dark:focus:ring-gray-600 shadow-sm',
  ghost: 'bg-transparent hover:bg-gray-100/50 text-gray-700 focus:ring-gray-200 dark:hover:bg-gray-800/40 dark:text-gray-200 dark:focus:ring-gray-700',
  danger: 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-600 shadow-lg shadow-red-500/25',
};

const sizes = {
  sm: 'h-9 px-4 text-xs',
  md: 'h-11 px-6 text-sm',
  lg: 'h-14 px-8 text-base',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  const cls = `${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
