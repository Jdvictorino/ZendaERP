import React, { useState } from 'react';
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900">Recuperar cuenta</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <p className="text-sm text-gray-600 mb-4">Introduce tu correo y recibirás un enlace para restablecer tu contraseña.</p>
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
