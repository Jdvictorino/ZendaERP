import React from 'react';
import Button from '../ui/Button.jsx';

const ConfirmationModal = ({ show, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", confirmColor = "bg-red-600 hover:bg-red-700" }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <p className="text-gray-600 mb-4">{message}</p>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
                    <Button onClick={onConfirm} className={confirmColor}>{confirmText}</Button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;