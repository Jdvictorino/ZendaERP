import { useEffect } from 'react';

/**
 * Hook para atrapar el focus dentro de un contenedor (usado en modales)
 * @param {React.RefObject} ref - Referencia al contenedor
 * @param {boolean} isActive - Si el trap está activo
 */
export function useFocusTrap(ref, isActive) {
  useEffect(() => {
    if (!isActive || !ref.current) return;
    
    const focusableElements = ref.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    // Focus inicial en el primer elemento
    if (firstElement) {
      firstElement.focus();
    }
    
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };
    
    const container = ref.current;
    container.addEventListener('keydown', handleTab);
    
    return () => {
      if (container) {
        container.removeEventListener('keydown', handleTab);
      }
    };
  }, [ref, isActive]);
}
