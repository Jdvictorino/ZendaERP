import React from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';

/**
 * Reemplazo de window.confirm con el modal de la app. Devuelve Promise<boolean>.
 * Uso: if (!(await confirmDialog('¿Eliminar cupón?'))) return;
 */
export function confirmDialog(message, { title = 'Confirmar acción', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = true } = {}) {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (value) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(
      <ConfirmationModal
        show
        title={title}
        message={message}
        confirmText={confirmText}
        cancelText={cancelText}
        danger={danger}
        onClose={() => done(false)}
        onConfirm={() => done(true)}
      />
    );
  });
}
