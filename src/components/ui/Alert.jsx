import React from 'react';
import { CheckCircle, AlertCircle, Info, XCircle, X } from 'lucide-react';

/**
 * Alert component para notificaciones y mensajes
 */
export default function Alert({ 
  children, 
  variant = 'info', // success, warning, danger, info
  closeable = false,
  onClose,
  icon: CustomIcon,
  className = '' 
}) {
  const variants = {
    success: {
      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-300',
      icon: CheckCircle
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-300',
      icon: AlertCircle
    },
    danger: {
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-300',
      icon: XCircle
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-300',
      icon: Info
    }
  };

  const config = variants[variant];
  const Icon = CustomIcon || config.icon;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${config.bg} ${config.text} ${className}`}>
      <Icon size={20} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        {children}
      </div>
      {closeable && (
        <button 
          onClick={onClose}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Cerrar alerta"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
