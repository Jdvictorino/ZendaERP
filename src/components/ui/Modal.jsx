import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

/**
 * Componente Modal unificado con soporte para accesibilidad y animaciones
 */
export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle,
  children, 
  size = 'md', // sm, md, lg, xl, full
  showClose = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = ''
}) {
  const modalRef = useRef(null);
  
  // Focus trap para accesibilidad
  useFocusTrap(modalRef, isOpen);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { 
        document.body.style.overflow = 'unset'; 
      };
    }
  }, [isOpen]);

  // Cerrar con tecla ESC
  useEffect(() => {
    if (!closeOnEscape || !isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  };

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-md animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={subtitle ? "modal-subtitle" : undefined}
        className={`bg-white dark:bg-gray-900 rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl w-full ${sizes[size]} max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-slideUp border border-white/20 dark:border-gray-800 ${className}`}
      >
        {/* Mobile Handle */}
        <div className="flex justify-center pt-4 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full" />
        </div>

        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between p-6 sm:p-7 border-b border-gray-100/50 dark:border-gray-800/50">
            <div className="flex-1">
              {title && (
                <h2 
                  id="modal-title" 
                  className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p 
                  id="modal-subtitle" 
                  className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  {subtitle}
                </p>
              )}
            </div>
            {showClose && (
              <button 
                onClick={onClose}
                className="ml-4 p-2.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-all active:scale-90"
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 pb-10 sm:pb-7 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Componente para el footer del modal (opcional)
 */
export function ModalFooter({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-end gap-3 px-6 py-5 sm:px-7 sm:py-5 border-t border-gray-100/50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-800/30 pb-safe ${className}`}>
      {children}
    </div>
  );
}
