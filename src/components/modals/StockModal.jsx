import React, { useState } from 'react';
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900 dark:text-white">Ajustar Stock</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-2">Producto: <strong>{product.name}</strong></p>
                <p className="text-gray-600 dark:text-gray-300 mb-4">Stock actual: <span className="font-mono font-bold text-indigo-600">{product.stock ?? 0}</span></p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Cantidad a Añadir</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                            className="input-base w-full" 
                            required 
                            min="1" 
                        />
                        <p className="text-xs text-gray-500 mt-1">Use números negativos para restar stock</p>
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Motivo (opcional)</label>
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