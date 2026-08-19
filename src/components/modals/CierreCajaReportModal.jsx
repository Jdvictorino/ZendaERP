import React, { useEffect, useMemo, useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';

const CierreCajaReportModal = ({ onClose, currentUserProfile, companyProfile }) => {
    const [closings, setClosings] = useState([]);
    const [selected, setSelected] = useState(null);
    const [managerName, setManagerName] = useState(currentUserProfile ? `${currentUserProfile.firstName || ''} ${currentUserProfile.lastName || ''}`.trim() : '');
    const [isSigning, setIsSigning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const [selectedExpenses, setSelectedExpenses] = useState([]);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    useEffect(() => {
        const loadClosings = async () => {
            setLoading(true);
            try {
                const result = await shifts.getClosings({ from: fromDate || undefined, to: toDate || undefined });
                const items = (result.data || []).sort((a, b) => {
                    const aTs = new Date(a.createdAt || a.closedAt).getTime();
                    const bTs = new Date(b.createdAt || b.closedAt).getTime();
                    return bTs - aTs;
                });
                setClosings(items);
                if (items.length > 0) setSelected(items[0]);
            } catch (err) {
                console.error(err);
                toast.error('No se pudieron cargar los cierres.');
            } finally {
                setLoading(false);
            }
        };
        loadClosings();
    }, [fromDate, toDate]);

    const handleSelect = (c) => { setSelected(c); }

    const handleSign = async () => {
        if (!selected) return;
        if (!managerName.trim()) { toast.error('Ingrese el nombre del gerente para firmar.'); return; }
        setIsSigning(true);
        try {
            await shifts.signClosing(selected.id, managerName.trim());
            toast.success('Cierre firmado.');
            // refresh list
            const result = await shifts.getClosings({ from: fromDate || undefined, to: toDate || undefined });
            const items = (result.data || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setClosings(items);
            setSelected(items.find(x => x.id === selected.id) || null);
        } catch (err) {
            console.error(err);
            toast.error('No se pudo firmar.');
        } finally { setIsSigning(false); }
    };

    // Derivar totales y fecha
    const derived = useMemo(() => {
        if (!selected) return null;
        const totals = selected.totals || {};
        const totalEfectivo = totals.totalEfectivo ?? 0;
        const totalTarjeta = totals.totalTarjeta ?? 0;
        const totalEgresos = totals.totalEgresos ?? 0;
        const efectivoEsperado = totals.efectivoEsperado ?? (totalEfectivo - totalEgresos);
        const contado = totals.contado ?? 0;
        const difference = totals.diferencia ?? (contado - efectivoEsperado);
        const when = selected.createdAt ? new Date(selected.createdAt) : (selected.closedAt ? new Date(selected.closedAt) : null);
        const invoices = Array.isArray(selected.invoices) ? selected.invoices : [];
        const egresos = Array.isArray(selected.egresos) ? selected.egresos : [];
        return {
            totalVentas: (totalEfectivo + totalTarjeta),
            totalEgresos,
            efectivoEsperado,
            difference,
            contado,
            when,
            invoices,
            egresos,
        };
    }, [selected]);

    // Cargar detalles de facturas/egresos
    useEffect(() => {
        if (!selected) return;
        setLoadingDetails(true);
        try {
            setSelectedInvoices(selected.invoices || []);
            setSelectedExpenses(selected.egresos || []);
        } finally {
            setLoadingDetails(false);
        }
    }, [selected]);

    const handlePrint = () => {
        if (!selected) return;
        const s = selected;
        const dateStr = derived?.when ? derived.when.toLocaleString() : '';
        const managerInfo = s.managerSignature ? `${s.managerSignature.name}` : '';
        const html = `
            <html>
            <head>
                <title>Reporte Cierre de Caja - ${s.id}</title>
                <style>
                    body{font-family: Arial, Helvetica, sans-serif;padding:20px}
                    h1{font-size:18px}
                    .section{margin-top:12px}
                    table{width:100%;border-collapse:collapse}
                    th,td{border:1px solid #ddd;padding:8px;text-align:left}
                </style>
            </head>
            <body>
                <h1>Reporte de Cierre de Caja</h1>
                <div><strong>Empresa:</strong> ${companyProfile?.name || ''}</div>
                <div><strong>Fecha:</strong> ${dateStr}</div>
                <div><strong>Usuario:</strong> ${s.user?.firstName || ''} ${s.user?.lastName || ''}</div>
                <div class="section"><strong>Resumen:</strong>
                    <ul>
                        <li>Total Ventas: ${formatCurrency(derived?.totalVentas || 0, companyProfile?.currency || 'DOP')}</li>
                        <li>Total Egresos: ${formatCurrency(derived?.totalEgresos || 0, companyProfile?.currency || 'DOP')}</li>
                        <li>Efectivo Esperado: ${formatCurrency(derived?.efectivoEsperado || 0, companyProfile?.currency || 'DOP')}</li>
                        <li>Diferencia: ${formatCurrency(derived?.difference || 0, companyProfile?.currency || 'DOP')}</li>
                    </ul>
                </div>
                <div class="section"><strong>Facturas incluidas:</strong>
                    <table><thead><tr><th>Id</th><th>N°</th><th>Cliente</th><th>Monto</th></tr></thead><tbody>
                    ${ (selectedInvoices || []).map(inv => `<tr><td>${inv.id}</td><td>${inv.invoiceNumber || ''}</td><td>${inv.customerName || ''}</td><td>${formatCurrency(inv.total || 0, companyProfile?.currency || 'DOP')}</td></tr>`).join('') }
                    </tbody></table>
                </div>
                <div class="section"><strong>Egresos:</strong>
                    <table><thead><tr><th>Id</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>
                    ${ (selectedExpenses || []).map(e => `<tr><td>${e.id || ''}</td><td>${e.description || e.reason || ''}</td><td>${formatCurrency(e.amount || 0, companyProfile?.currency || 'DOP')}</td></tr>`).join('') }
                    </tbody></table>
                </div>
                <div class="section"><strong>Firma Gerente:</strong><div style="margin-top:8px">${managerInfo || '--- SIN FIRMAR ---'}</div></div>
            </body>
            </html>
        `;
        const w = window.open('', '_blank', 'width=800,height=600');
        if (!w) { toast.error('Permita popups para imprimir.'); return; }
        w.document.write(html); w.document.close(); w.onload = () => setTimeout(() => w.print(), 300);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="card rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-6 border-b border-gray-100">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Reportes de Cierres de Caja</h3>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <div className="mb-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-base" />
                                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-base" />
                            </div>
                        </div>
                        {loading ? (
                            <div className="text-sm text-gray-500">Cargando cierres...</div>
                        ) : (
                            <ul className="space-y-2">
                                {(closings || []).filter(c => {
                                    const when = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : (c.date?.seconds ? new Date(c.date.seconds * 1000) : null);
                                    if (fromDate) {
                                        const from = new Date(fromDate + 'T00:00:00');
                                        if (!when || when < from) return false;
                                    }
                                    if (toDate) {
                                        const to = new Date(toDate + 'T23:59:59');
                                        if (!when || when > to) return false;
                                    }
                                    return true;
                                }).map(c => {
                                    const when = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : (c.date?.seconds ? new Date(c.date.seconds * 1000) : null);
                                    const totals = c.totals || {};
                                    const ventas = (totals.totalEfectivo || 0) + (totals.totalTarjeta || 0);
                                    return (
                                        <li key={c.id} className={`p-2 border rounded cursor-pointer ${selected?.id === c.id ? 'bg-indigo-50 border-indigo-200' : ''}`} onClick={() => handleSelect(c)}>
                                            <div className="text-sm font-medium">{c.id}</div>
                                            <div className="text-xs text-gray-500">{when ? when.toLocaleString() : ''}</div>
                                            <div className="text-sm">Ventas: {formatCurrency(c.totalVentas ?? ventas ?? 0, companyProfile?.currency || 'DOP')}</div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        {!selected && <div className="p-4 text-gray-500">Seleccione un cierre para ver detalles.</div>}
                        {selected && (
                            <div>
                                <h4 className="font-semibold">Cierre: {selected.id}</h4>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><strong>Fecha:</strong> {derived?.when ? derived.when.toLocaleString() : ''}</div>
                                    <div><strong>Total Ventas:</strong> {formatCurrency(derived?.totalVentas || 0, companyProfile?.currency || 'DOP')}</div>
                                    <div><strong>Total Egresos:</strong> {formatCurrency(derived?.totalEgresos || 0, companyProfile?.currency || 'DOP')}</div>
                                    <div><strong>Efectivo Esperado:</strong> {formatCurrency(derived?.efectivoEsperado || 0, companyProfile?.currency || 'DOP')}</div>
                                    <div><strong>Diferencia:</strong> {formatCurrency(derived?.difference || 0, companyProfile?.currency || 'DOP')}</div>
                                </div>

                                <div className="mt-4">
                                    <h5 className="font-semibold">Facturas</h5>
                                    <div className="mt-2 max-h-40 overflow-y-auto border rounded p-2">
                                        {loadingDetails ? (
                                            <div className="text-sm text-gray-500">Cargando detalles...</div>
                                        ) : (
                                            <ul>
                                                {(selectedInvoices || []).map(inv => (
                                                    <li key={inv.id} className="text-sm py-1 border-b last:border-b-0">{inv.invoiceNumber || inv.orderNumber || inv.id} — {inv.customerName || ''} — {formatCurrency(inv.total || 0, companyProfile?.currency || 'DOP')}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <h5 className="font-semibold">Egresos</h5>
                                    <div className="mt-2 max-h-40 overflow-y-auto border rounded p-2">
                                        {loadingDetails ? (
                                            <div className="text-sm text-gray-500">Cargando detalles...</div>
                                        ) : (
                                            <ul>
                                                {(selectedExpenses || []).map(e => (
                                                    <li key={`${e.id || e.description}-${e.amount}`} className="text-sm py-1 border-b last:border-b-0">{e.description || e.reason || ''} — {formatCurrency(e.amount || 0, companyProfile?.currency || 'DOP')}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 border-t pt-4 flex items-center gap-2">
                                    <input type="text" value={managerName} onChange={(e) => setManagerName(e.target.value)} className="input-base flex-1" placeholder="Nombre del gerente para firmar" />
                                    <Button onClick={handleSign} disabled={isSigning} className="bg-green-600 hover:bg-green-700 focus:ring-green-600">{isSigning ? 'Firmando...' : 'Firmar como Gerente'}</Button>
                                    <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600">Imprimir</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CierreCajaReportModal;
