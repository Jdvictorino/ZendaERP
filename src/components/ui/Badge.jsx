import React from 'react';

const tones = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300',
  success: 'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-300',
  warning: 'bg-warning-50 text-warning-800 dark:bg-warning-950/40 dark:text-warning-300',
  danger: 'bg-danger-50 text-danger-700 dark:bg-danger-950/40 dark:text-danger-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};
// nombres anteriores del componente
tones.default = tones.neutral;

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

/** Clases de un badge, para usarlas también en <span> que no son <Badge>. */
export const badgeClass = (tone = 'neutral', size = 'md') =>
  `inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset ring-black/5 dark:ring-white/10 ${tones[tone] || tones.neutral} ${sizes[size] || sizes.md}`;

/**
 * Badge para estados y categorías. variant: neutral | brand | success | warning | danger | info
 */
export default function Badge({ children, variant = 'neutral', size = 'md', className = '' }) {
  return <span className={`${badgeClass(variant, size)} ${className}`}>{children}</span>;
}
