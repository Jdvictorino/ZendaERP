import React from 'react';
import { FileText, FileSignature, DollarSign } from 'lucide-react';
import Button from '../ui/Button.jsx';

const PostOrderActionsModal = ({ onClose, onQuote, onBill, onBillAndPay, orderNumber }) => {
    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <div className="modal-panel p-6 w-full max-w-lg">
                <div className="text-center">
                    <h3 className="text-2xl font-bold text-success-600">¡Pedido Creado con Éxito!</h3>
                    <p className="text-ink-soft mt-2">El pedido <span className="font-mono bg-gray-100 px-1 rounded">{orderNumber}</span> ha sido guardado.</p>
                    <p className="text-ink mt-4 font-semibold">¿Cuál es el siguiente paso?</p>
                </div>
                
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Botón Cotizar */}
                    <button onClick={onQuote} className="flex flex-col items-center justify-center p-4 border rounded-lg text-ink-soft hover:bg-surface-muted hover:border-gray-400 transition-all">
                        <FileText size={32} className="mb-2" />
                        <span className="font-semibold">Solo Cotizar</span>
                        <span className="text-xs text-ink-muted text-center mt-1">Imprimir o ver el resumen del pedido.</span>
                    </button>

                    {/* Botón Facturar */}
                    <button onClick={onBill} className="flex flex-col items-center justify-center p-4 border rounded-lg text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-all">
                        <FileSignature size={32} className="mb-2" />
                        <span className="font-semibold">Facturar</span>
                        <span className="text-xs text-ink-muted text-center mt-1">Emitir comprobante fiscal y descargar PDF.</span>
                    </button>

                    {/* Botón Facturar y Pagar */}
                    <button onClick={onBillAndPay} className="flex flex-col items-center justify-center p-4 border rounded-lg text-success-700 hover:bg-success-50 hover:border-success-400 transition-all">
                        <DollarSign size={32} className="mb-2" />
                        <span className="font-semibold">Facturar y Pagar</span>
                        <span className="text-xs text-ink-muted text-center mt-1">Emitir factura y registrar el pago ahora.</span>
                    </button>
                </div>
                <div className="mt-6 text-center">
                    <Button variant="ghost" onClick={onClose} className="text-sm text-ink-soft hover:underline">Omitir por ahora</Button>
                </div>
            </div>
        </div>
    );
};

export default PostOrderActionsModal;
