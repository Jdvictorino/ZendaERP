import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button.jsx';

/** danger: acción destructiva (botón rojo). Sin danger, el botón usa el color de marca. */
const ConfirmationModal = ({ show, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = true }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[90] p-4">
            <div className="modal-panel p-6 w-full max-w-sm">
                <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${danger ? 'bg-danger-50 text-danger-600 dark:bg-danger-950/40 dark:text-danger-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400'}`}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-ink">{title}</h3>
                        <p className="mt-1 text-sm text-ink-muted">{message}</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="modal-close -mt-1 -mr-1"><X size={18} /></button>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
                    <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText}</Button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
