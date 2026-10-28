import React, { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';

export default function ForgotPasswordModal({ initialEmail = '', onClose, onSend }) {
    const [email, setEmail] = useState(initialEmail);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSend(email);
        } catch (err) {
            toast.error('No se pudo enviar el correo de recuperación.');
        }
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4">
            <div className="modal-panel p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-ink">Recuperar cuenta</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <p className="text-sm text-ink-soft mb-4">Introduce tu correo y recibirás un enlace para restablecer tu contraseña.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" placeholder="Correo electrónico" />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isLoading}>{isLoading ? 'Enviando...' : 'Enviar correo'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
