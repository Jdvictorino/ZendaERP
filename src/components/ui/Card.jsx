import React from 'react';

export default function Card({ className = '', children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon, className = '' }) {
  return (
    <div className={`flex items-start justify-between p-6 border-b border-line/50 ${className}`}>
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 text-brand-500">{icon}</span>}
        <div>
        {title && <h3 className="text-lg font-bold text-ink tracking-tight">{title}</h3>}
        {subtitle && <p className="mt-0.5 text-sm font-medium text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function CardFooter({ className = '', children }) {
  return <div className={`p-6 border-t border-line/50 ${className}`}>{children}</div>;
}

