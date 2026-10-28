import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, PlusCircle, Trash2 } from 'lucide-react';
import { shifts, invoices as invoicesApi } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';

const CierreCajaModal = ({ currentUserProfile, companyProfile, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [systemReport, setSystemReport] = useState({
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalEgresos: 0,
        facturasProcesadas: [],
        egresosProcesados: [],
    });
    const [manualCashCount, setManualCashCount] = useState(0);
    const [lastMinuteExpenses, setLastMinuteExpenses] = useState([]);
    const currency = companyProfile?.currency || 'DOP';

    useEffect(() => {
        let cancelled = false;
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Cargar facturas pagadas del día (o desde último cierre)
                let facturasProcesadas = [];
                let totalEfectivo = 0;
                let totalTarjeta = 0;

                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const result = await invoicesApi.list({ from: today.toISOString(), status: 'Pagado' });
                    const invoiceList = result.data || [];
                    
                    invoiceList.forEach(inv => {
                        facturasProcesadas.push(inv.id);
                        if (inv.paymentMethod === 'efectivo') {
                            totalEfectivo += Number(inv.amountPaid || 0);
                        } else if (inv.paymentMethod === 'tarjeta') {
                            totalTarjeta += Number(inv.amountPaid || 0);
                        }
                    });
                } catch (err) {
                    console.error('Error obteniendo facturas', err);
                }

                // Cargar movimientos de caja del día
                let egresosProcesados = [];
                let totalEgresos = 0;
                try {
                    const shiftsResult = await shifts.list({ status: 'open' });
                    const openShifts = shiftsResult.data || [];
                    
                    openShifts.forEach(shift => {
                        if (shift.movements) {
                            shift.movements.forEach(m => {
                                if (m.type === 'salida') {
                                    egresosProcesados.push(m.id);
                                    totalEgresos += Number(m.amount || 0);
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.error('Error obteniendo movimientos', err);
                }

                if (!cancelled) {
                    setSystemReport({ totalEfectivo, totalTarjeta, totalEgresos, facturasProcesadas, egresosProcesados });
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        loadData();
        return () => { cancelled = true; };
    }, []);

    const totalEgresosManuales = useMemo(() => (lastMinuteExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0), [lastMinuteExpenses]);
    const totalEgresosTotal = useMemo(() => (systemReport.totalEgresos || 0) + totalEgresosManuales, [systemReport.totalEgresos, totalEgresosManuales]);
    const efectivoEsperado = useMemo(() => (systemReport.totalEfectivo || 0) - totalEgresosTotal, [systemReport.totalEfectivo, totalEgresosTotal]);
    const diferencia = useMemo(() => Number(manualCashCount || 0) - efectivoEsperado, [manualCashCount, efectivoEsperado]);

    const addLastMinuteExpense = () => {
        setLastMinuteExpenses(prev => [...prev, { id: Date.now().toString(), description: '', amount: 0 }]);
    };
    const removeLastMinuteExpense = (id) => {
        setLastMinuteExpenses(prev => prev.filter(x => x.id !== id));
    };
    const handleChangeExpense = (id, field, value) => {
        setLastMinuteExpenses(prev => prev.map(x => x.id === id ? { ...x, [field]: field === 'amount' ? Number(value) : value } : x));
    };

    const handleFinalizeClose = async () => {
        setIsFinalizing(true);
        try {
            const closingData = {
                totals: {
                    totalEfectivo: Number(systemReport.totalEfectivo || 0),
                    totalTarjeta: Number(systemReport.totalTarjeta || 0),
                    totalEgresosSistema: Number(systemReport.totalEgresos || 0),
                    totalEgresosManuales: Number(totalEgresosManuales || 0),
                    totalEgresos: Number(totalEgresosTotal || 0),
                    efectivoEsperado: Number(efectivoEsperado || 0),
                    contado: Number(manualCashCount || 0),
                    diferencia: Number(diferencia || 0),
                },
                invoiceIds: systemReport.facturasProcesadas || [],
                lastMinuteExpenses: (lastMinuteExpenses || []).map(e => ({ 
                    description: e.description || 'Egreso de última hora', 
                    amount: Number(e.amount || 0) 
                })),
                manualCashCount: Number(manualCashCount || 0)
            };

            await shifts.createDailyClose(closingData);
            toast.success('Cierre guardado con éxito');
            onClose && onClose();
        } catch (err) {
            console.error('Error finalizando cierre', err);
            toast.error('No se pudo guardar el cierre de caja');
            setIsFinalizing(false);
        }
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4">
            <div className="modal-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-6 border-b border-line">
                    <h3 className="text-lg font-semibold text-ink">Cierre de Caja</h3>
                    <button onClick={onClose} className="text-ink-muted hover:text-gray-800" aria-label="Cerrar"><X /></button>
                </div>
                <div className="p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center p-12 text-ink-muted"><Loader2 className="animate-spin mr-2"/>Cargando...</div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h4 className="font-semibold">Totales del Sistema</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                    <div className="p-3 bg-surface-muted rounded">Total Efectivo
                                        <div className="font-bold">{formatCurrency(systemReport.totalEfectivo || 0, currency)}</div>
                                    </div>
                                    <div className="p-3 bg-surface-muted rounded">Total Tarjeta
                                        <div className="font-bold">{formatCurrency(systemReport.totalTarjeta || 0, currency)}</div>
                                    </div>
                                    <div className="p-3 bg-surface-muted rounded">Egresos Registrados
                                        <div className="font-bold">{formatCurrency(systemReport.totalEgresos || 0, currency)}</div>
                                    </div>
                                    <div className="p-3 bg-surface-muted rounded">Facturas
                                        <div className="font-bold">{(systemReport.facturasProcesadas || []).length}</div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold">Egresos de Última Hora</h4>
                                <div className="space-y-2 mt-2">
                                    {(lastMinuteExpenses || []).map(e => (
                                        <div key={e.id} className="flex gap-2 items-center">
                                            <input type="text" placeholder="Descripción" value={e.description} onChange={ev => handleChangeExpense(e.id, 'description', ev.target.value)} className="input-base flex-1" />
                                            <input type="number" placeholder="Monto" value={e.amount} onChange={ev => handleChangeExpense(e.id, 'amount', ev.target.value)} className="input-base w-40" />
                                            <button onClick={() => removeLastMinuteExpense(e.id)} className="text-red-600 hover:text-red-800" aria-label="Eliminar"><Trash2 /></button>
                                        </div>
                                    ))}
                                    <div>
                                        <button onClick={addLastMinuteExpense} className="bg-gray-100 hover:bg-gray-200 text-ink px-3 py-2 rounded inline-flex items-center gap-2"><PlusCircle size={18}/> Añadir Egreso</button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold">Conciliación de Efectivo</h4>
                                <div className="mt-2 grid grid-cols-1 gap-2">
                                    <div>Efectivo Esperado en Caja: <span className="font-bold">{formatCurrency(efectivoEsperado || 0, currency)}</span></div>
                                    <div className="flex gap-2 items-center">
                                        <label className="w-48">Monto Contado Manualmente:</label>
                                        <input type="number" value={manualCashCount} onChange={e => setManualCashCount(Number(e.target.value || 0))} className="input-base w-full" />
                                    </div>
                                    <div>Dif. (Descuadre): <span className={`font-bold ${diferencia < 0 ? 'text-red-600' : 'text-success-600'}`}>{formatCurrency(diferencia || 0, currency)}</span></div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                                <Button disabled={isFinalizing} onClick={handleFinalizeClose} className="bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-600">
                                    {isFinalizing ? 'Guardando...' : 'Finalizar y Guardar Cierre'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CierreCajaModal;
