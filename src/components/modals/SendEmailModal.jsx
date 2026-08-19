import React, { useState } from 'react';
import { Mail, X, FileText, Send, Loader2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import api from '../../api/client.js';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';

const SendEmailModal = ({ isOpen, onClose, defaultEmail = '', docName = 'Documento', filename = 'documento.pdf', base64Attachment = '' }) => {
    const [email, setEmail] = useState(defaultEmail || '');
    const [subject, setSubject] = useState(`[Zenda ERP] ${docName}`);
    const [message, setMessage] = useState(`Estimado cliente,\n\nAdjunto a este correo encontrará su ${docName.toLowerCase()} correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSend = async (e) => {
        e.preventDefault();

        if (!email || !email.trim()) {
            toast.error('Por favor introduce el correo electrónico del cliente.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            toast.error('Por favor introduce un correo electrónico válido.');
            return;
        }

        setLoading(true);

        const formattedHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
                <h2 style="color: #4f46e5; margin-bottom: 20px;">Zenda ERP - Envío de Documento</h2>
                <div style="white-space: pre-wrap; font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 30px;">
                    ${message.replace(/\n/g, '<br/>')}
                </div>
                <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 0; font-weight: bold; font-size: 14px; color: #1e293b;">📎 Archivo Adjunto:</p>
                    <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">${filename}</p>
                </div>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;"/>
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    Este es un correo automático enviado por Zenda ERP. No respondas directamente a este mensaje.
                </p>
            </div>
        `;

        try {
            const promise = api.email.send({
                to: email.trim(),
                subject: subject.trim(),
                html: formattedHtml,
                text: `${message}\n\n[Adjunto: ${filename}]`,
                filename,
                base64Attachment
            });

            await toast.promise(promise, {
                loading: 'Enviando correo transaccional...',
                success: '¡Correo enviado con éxito!',
                error: 'No se pudo enviar el correo electrónico.'
            });

            playSuccessSound();
            setLoading(false);
            onClose();
        } catch (err) {
            console.error('Error al enviar email:', err);
            playErrorSound();
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-card w-full max-w-lg overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                        <Mail size={22} />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Enviar Documento por Email</h3>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        disabled={loading}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSend} className="p-6 space-y-4">
                    {/* Tarjeta Adjunto */}
                    <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 p-3 rounded-xl">
                        <div className="p-2 bg-indigo-500 rounded-lg text-white">
                            <FileText size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold uppercase tracking-wider">Documento a enviar</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{filename}</p>
                        </div>
                    </div>

                    {/* Email de Destino */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Correo del Destinatario <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="correo@cliente.com"
                            className="input-base w-full focus:ring-2 focus:ring-indigo-500"
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Asunto */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Asunto
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="input-base w-full"
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Mensaje */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Mensaje
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            className="input-base w-full"
                            disabled={loading}
                        />
                    </div>

                    {/* Acciones */}
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Button 
                            type="button" 
                            variant="secondary" 
                            onClick={onClose} 
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="mr-2 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <Send size={18} className="mr-2" />
                                    Enviar Correo
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SendEmailModal;
