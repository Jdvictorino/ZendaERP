import React, { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button.jsx';

const StockModal = ({ product, onClose, onSave }) => {
    const [amount, setAmount] = useState(1);
    const [reason, setReason] = useState('Ajuste manual de stock');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => { 
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;
        setIsLoading(true);
        try {
            await onSave(Number(amount), reason); 
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <div className="modal-panel p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-ink">Ajustar Stock</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <p className="text-ink-soft dark:text-gray-300 mb-2">Producto: <strong>{product.name}</strong></p>
                <p className="text-ink-soft dark:text-gray-300 mb-4">Stock actual: <span className="font-mono font-bold text-brand-600">{product.stock ?? 0}</span></p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-ink-soft dark:text-gray-300 mb-1">Cantidad a Añadir</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                            className="input-base w-full" 
                            required 
                            min="1" 
                        />
                        <p className="text-xs text-ink-muted mt-1">Use números negativos para restar stock</p>
                    </div>
                    <div className="mb-4">
                        <label className="block text-ink-soft dark:text-gray-300 mb-1">Motivo (opcional)</label>
                        <input 
                            type="text" 
                            value={reason} 
                            onChange={e => setReason(e.target.value)} 
                            className="input-base w-full" 
                            placeholder="Ej: Compra de proveedor, Ajuste de inventario..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                        <Button type="submit" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Confirmar'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StockModal;