import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Plus, FileDown, Send, PackageCheck, Receipt, XCircle, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { purchaseOrders, products as productsApi, suppliers as suppliersApi } from '../api/client.js';
import { canAccessView } from '../utils/permissions.js';
import { confirmDialog } from '../utils/confirmDialog.jsx';
import { generatePDF } from '../utils/pdfGenerator.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import Card from '../components/ui/Card.jsx';
import Select from '../components/ui/Select.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PurchaseOrderForm from '../components/purchases/PurchaseOrderForm.jsx';
import ReceiveModal from '../components/purchases/ReceiveModal.jsx';
import SupplierInvoiceModal from '../components/purchases/SupplierInvoiceModal.jsx';

export const STATUS = {
    borrador: ['Borrador', 'neutral'], enviada: ['Enviada', 'info'], parcial: ['Recibida parcial', 'warning'],
    recibida: ['Recibida', 'success'], cancelada: ['Cancelada', 'danger']
};
const errMsg = (e) => e?.message || e?.error || 'No se pudo completar la acción.';

const SuggestionGroup = ({ title, lines: initial, needsSupplier, suppliers, onCreate }) => {
    const keyOf = (l) => `${l.productId}-${l.packagingId || ''}`;
    const [qty, setQty] = useState(() => Object.fromEntries(initial.map((l) => [keyOf(l), String(l.quantity)])));
    const [busy, setBusy] = useState(false);
    const [supplierId, setSupplierId] = useState('');
    const create = async () => {
        const items = initial.map((l) => ({ productId: l.productId, packagingId: l.packagingId || null, quantity: Number(qty[keyOf(l)]), unitCost: Number(l.unitCost) })).filter((l) => l.quantity > 0);
        if (needsSupplier && !supplierId) return toast.error('Elige un suplidor.');
        if (!items.length) return toast.error('No hay cantidades para pedir.');
        setBusy(true);
        try { await onCreate(items, supplierId); } finally { setBusy(false); }
    };
    return (
        <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">{title}</h3>
                <div className="flex items-end gap-2">
                    {needsSupplier && (
                        <Select aria-label={`Suplidor para ${title}`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                            <option value="">Suplidor…</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    )}
                    <Button size="sm" onClick={create} disabled={busy}>Crear borrador</Button>
                </div>
            </div>
            <ul className="space-y-2 text-sm">
                {initial.map((l) => (
                    <li key={keyOf(l)} className="flex items-center justify-between gap-2">
                        <span>{l.productName}{l.packagingName ? ` — ${l.packagingName}` : ''}</span>
                        <input aria-label={`Cantidad de ${l.productName}`} type="number" min="0" step="any" className="input-base w-28"
                            value={qty[keyOf(l)]} onChange={(e) => setQty({ ...qty, [keyOf(l)]: e.target.value })} />
                    </li>
                ))}
            </ul>
        </Card>
    );
};

const PurchasesView = ({ companyProfile, currentUserProfile }) => {
    const role = currentUserProfile?.role || 'viewer';
    const canWrite = canAccessView(role, 'purchases');
    const canInvoice = canAccessView(role, 'finance-expenses');

    const [tab, setTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [suggestions, setSuggestions] = useState(null);
    const [modal, setModal] = useState(null); // { type: 'form'|'receive'|'invoice', order?, initial? }

    const load = useCallback(async () => {
        try {
            setOrders(await purchaseOrders.list({ status: statusFilter || undefined, supplierId: supplierFilter || undefined }));
        } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
    }, [statusFilter, supplierFilter]);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        (async () => {
            try {
                const [ps, ss] = await Promise.all([productsApi.list(), suppliersApi.list()]);
                const rows = (r) => (Array.isArray(r) ? r : r?.data || []);
                setProducts(rows(ps).filter((p) => p.status !== 'inactive' && !p.variants?.length));
                setSuppliers(rows(ss).filter((s) => s.status !== 'inactive'));
            } catch (e) { toast.error(errMsg(e)); }
        })();
    }, []);

    const loadSuggestions = useCallback(async () => {
        setSuggestions(null);
        try { setSuggestions(await purchaseOrders.suggestions()); } catch (e) { toast.error(errMsg(e)); }
    }, []);
    useEffect(() => { if (tab === 'suggestions' && canWrite) loadSuggestions(); }, [tab, canWrite, loadSuggestions]);

    const act = async (fn, okMsg) => {
        try { await fn(); toast.success(okMsg); setModal(null); await load(); return true; } catch (e) { toast.error(errMsg(e)); return false; }
    };
    // la lista trae solo el resumen; el detalle (líneas, recepciones) se pide al abrir cada modal
    const openWithDetail = async (type, o) => {
        try { setModal({ type, order: await purchaseOrders.get(o.id) }); } catch (e) { toast.error(errMsg(e)); }
    };

    const download = async (o) => {
        try {
            const full = await purchaseOrders.get(o.id);
            const emitter = currentUserProfile ? { fullName: `${currentUserProfile.firstName} ${currentUserProfile.lastName}`, employeeId: currentUserProfile.employeeId } : null;
            await generatePDF(full, 'purchase-order', companyProfile, suppliers.find((s) => s.id === full.supplierId) || full.supplier, emitter, 'download');
        } catch (e) { toast.error(errMsg(e)); }
    };
    const cancel = async (o) => {
        if (await confirmDialog(`¿Cancelar la orden ${o.number}?`, { confirmText: 'Cancelar orden', cancelText: 'Volver' })) act(() => purchaseOrders.cancel(o.id), 'Orden cancelada');
    };
    const send = async (o) => {
        if (await confirmDialog(`¿Enviar la orden ${o.number}? Ya no se podrá editar.`, { confirmText: 'Enviar', danger: false })) act(() => purchaseOrders.send(o.id), 'Orden enviada');
    };
    const createFromSuggestion = async (items, supplierId) => {
        if (await act(() => purchaseOrders.create({ supplierId, items }), 'Borrador creado')) setTab('orders');
    };

    const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold text-ink flex items-center gap-2"><ShoppingBag size={22} /> Compras</h1>
                {canWrite && <Button onClick={() => setModal({ type: 'form' })}><Plus size={16} className="mr-1" /> Nueva orden</Button>}
            </div>

            <div role="tablist" className="flex gap-2">
                <Button role="tab" aria-selected={tab === 'orders'} variant={tab === 'orders' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('orders')}>Órdenes</Button>
                {canWrite && <Button role="tab" aria-selected={tab === 'suggestions'} variant={tab === 'suggestions' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('suggestions')}>Sugerencias</Button>}
            </div>

            {tab === 'orders' && (
                <>
                    <div className="flex flex-wrap gap-3">
                        <Select aria-label="Filtrar por estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Todos los estados</option>
                            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                        </Select>
                        <Select aria-label="Filtrar por suplidor" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                            <option value="">Todos los suplidores</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    </div>
                    {!loading && !orders.length ? (
                        <EmptyState icon={ShoppingBag} title="Sin órdenes de compra" description="Crea una orden o revisa las sugerencias de reposición." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-ink-muted"><th className="py-2">Número</th><th>Suplidor</th><th>Estado</th><th>Líneas</th><th className="text-right">Total</th><th /></tr></thead>
                                <tbody>
                                    {orders.map((o) => {
                                        const [label, tone] = STATUS[o.status] || [o.status, 'neutral'];
                                        // la lista no trae lo facturado: el modal muestra lo pendiente y el servidor valida
                                        const openInvoice = o.status === 'parcial' || o.status === 'recibida';
                                        return (
                                            <tr key={o.id} className="border-t border-line">
                                                <td className="py-2 font-medium">{o.number}</td>
                                                <td>{o.supplier?.name || supplierName[o.supplierId] || ''}</td>
                                                <td><Badge variant={tone}>{label}</Badge></td>
                                                <td>{o.lineCount ?? o._count?.items ?? ''}</td>
                                                <td className="text-right">{formatCurrency(Number(o.total))}</td>
                                                <td className="py-1">
                                                    <div className="flex justify-end gap-1">
                                                        {canWrite && o.status === 'borrador' && <Button size="sm" variant="ghost" aria-label={`Editar ${o.number}`} onClick={() => openWithDetail('form', o)}><Pencil size={15} /></Button>}
                                                        {canWrite && o.status === 'borrador' && <Button size="sm" variant="ghost" aria-label={`Enviar ${o.number}`} onClick={() => send(o)}><Send size={15} /></Button>}
                                                        <Button size="sm" variant="ghost" aria-label={`Descargar PDF de ${o.number}`} onClick={() => download(o)}><FileDown size={15} /></Button>
                                                        {canWrite && (o.status === 'enviada' || o.status === 'parcial') && <Button size="sm" variant="ghost" aria-label={`Recibir ${o.number}`} onClick={() => openWithDetail('receive', o)}><PackageCheck size={15} /></Button>}
                                                        {canInvoice && openInvoice && <Button size="sm" variant="ghost" aria-label={`Registrar factura de ${o.number}`} onClick={() => openWithDetail('invoice', o)}><Receipt size={15} /></Button>}
                                                        {canWrite && ['borrador', 'enviada'].includes(o.status) && <Button size="sm" variant="ghost" aria-label={`Cancelar ${o.number}`} onClick={() => cancel(o)}><XCircle size={15} /></Button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {tab === 'suggestions' && canWrite && (
                <div className="space-y-3">
                    {!suggestions && <p className="text-sm text-ink-muted">Calculando sugerencias…</p>}
                    {suggestions && !Object.keys(suggestions.bySupplier || {}).length && !suggestions.noSupplier?.length && !suggestions.reviewByHand?.length && (
                        <EmptyState icon={ShoppingBag} title="Nada por reponer" description="Ningún producto está por debajo de su mínimo." />
                    )}
                    {suggestions && Object.entries(suggestions.bySupplier || {}).map(([sid, lines]) => (
                        <SuggestionGroup key={sid} title={suggestions.suppliers?.[sid] || supplierName[sid] || 'Suplidor'} lines={lines} suppliers={suppliers}
                            onCreate={(items) => createFromSuggestion(items, sid)} />
                    ))}
                    {suggestions?.noSupplier?.length > 0 && (
                        <SuggestionGroup title="Sin suplidor" needsSupplier lines={suggestions.noSupplier} suppliers={suppliers}
                            onCreate={(items, sid) => createFromSuggestion(items, sid)} />
                    )}
                    {suggestions?.reviewByHand?.length > 0 && (
                        <Card className="p-4">
                            <h3 className="font-semibold text-ink mb-2">Revisar a mano</h3>
                            <p className="text-sm text-ink-muted mb-2">Estos productos necesitan reposición pero no se pueden sugerir automáticamente (por ejemplo, tienen variantes).</p>
                            <ul className="list-disc pl-5 text-sm">{suggestions.reviewByHand.map((p) => <li key={p.id || p.productId}>{p.name || p.productName}</li>)}</ul>
                        </Card>
                    )}
                </div>
            )}

            {modal?.type === 'form' && (
                <PurchaseOrderForm isOpen onClose={() => setModal(null)} order={modal.order} products={products} suppliers={suppliers}
                    onSave={(data) => act(() => (modal.order ? purchaseOrders.update(modal.order.id, data) : purchaseOrders.create(data)), 'Orden guardada')} />
            )}
            {modal?.type === 'receive' && (
                <ReceiveModal isOpen onClose={() => setModal(null)} order={modal.order}
                    onSubmit={(data) => act(() => purchaseOrders.receive(modal.order.id, data), 'Recepción registrada')} />
            )}
            {modal?.type === 'invoice' && (
                <SupplierInvoiceModal isOpen onClose={() => setModal(null)} order={modal.order}
                    onSubmit={(data) => act(() => purchaseOrders.invoice(modal.order.id, data), 'Factura registrada')} />
            )}
        </div>
    );
};

export default PurchasesView;
