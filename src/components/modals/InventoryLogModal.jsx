import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton.jsx';
import { products as productsApi } from '../../api/client.js';

const InventoryLogModal = ({ product, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!product?.id) return;
        
        const fetchLogs = async () => {
            try {
                const response = await productsApi.getInventoryLog(product.id);
                setLogs(response || []);
            } catch (e) {
                console.warn('Error fetching inventory log:', e);
                setLogs([]);
            } finally {
                setLoading(false);
            }
        };
        
        fetchLogs();
    }, [product?.id]);

    // Ordenamos los registros por fecha, del más reciente al más antiguo
    const sortedLogs = (logs || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const formatDate = (dateStr) => {
        try {
            return new Date(dateStr).toLocaleString('es-DO');
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <div className="modal-panel p-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 border-b pb-4 gap-2">
                    <div>
                        <h3 className="text-lg font-semibold text-ink">Historial de Inventario</h3>
                        <p className="text-ink-soft">{product.name}</p>
                    </div>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Cambio</th>
                                <th className="p-3">Stock Resultante</th>
                                <th className="p-3">Motivo / Pedido</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} aria-hidden="true">
                                    {Array.from({ length: 5 }).map((__, j) => (
                                        <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                                    ))}
                                </tr>
                            ))}
                            {!loading && sortedLogs.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center p-8 text-ink-muted">
                                        No hay movimientos registrados para este producto.
                                    </td>
                                </tr>
                            )}
                            {sortedLogs.map(log => (
                                <tr key={log.id} className="border-b hover:bg-surface-muted text-sm">
                                    <td className="p-3 text-ink-soft">{formatDate(log.date)}</td>
                                    <td className="p-3">{log.type}</td>
                                    <td className={`p-3 font-bold ${log.change > 0 ? 'text-success-600' : 'text-red-600'}`}>
                                        {log.change > 0 ? `+${log.change}` : log.change}
                                    </td>
                                    <td className="p-3 font-bold">{log.newStock}</td>
                                    <td className="p-3 text-ink-soft">{log.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InventoryLogModal;
