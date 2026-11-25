import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Select from '../ui/Select.jsx';
import { round2 } from '../../utils/tax.js';
import { unitOf } from '../../utils/units.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

export const productRate = (p) => (p?.isTaxable ? Number(p.taxRate) || 0 : 0);

// Misma regla que orderTotals del servidor: monto de línea redondeado y su ITBIS redondeado
export const formTotals = (lines, productsById) => {
    let subtotal = 0, itbis = 0;
    for (const l of lines) {
        const amount = round2((Number(l.quantity) || 0) * (Number(l.unitCost) || 0));
        subtotal += amount;
        itbis += round2((amount * productRate(productsById[l.productId])) / 100);
    }
    subtotal = round2(subtotal); itbis = round2(itbis);
    return { subtotal, itbis, total: round2(subtotal + itbis) };
};

const factorOf = (p, packagingId) => Number(p?.packagings?.find((k) => k.id === packagingId)?.factor) || 1;
const costFor = (p, packagingId) => String(round2((Number(p?.costPrice) || 0) * factorOf(p, packagingId)));

const PurchaseOrderForm = ({ isOpen, onClose, order, products = [], suppliers = [], initial, onSave }) => {
    const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
    const src = order || initial || {};
    const [supplierId, setSupplierId] = useState(src.supplierId || '');
    const [expectedDate, setExpectedDate] = useState(src.expectedDate ? String(src.expectedDate).slice(0, 10) : '');
    const [notes, setNotes] = useState(src.notes || '');
    const [lines, setLines] = useState((src.items || []).map((i) => ({ productId: i.productId, packagingId: i.packagingId || '', quantity: String(i.quantity), unitCost: String(i.unitCost) })));
    const [saving, setSaving] = useState(false);

    const setLine = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    const pickProduct = (i, productId) => setLine(i, { productId, packagingId: '', unitCost: productId ? costFor(productsById[productId], '') : '' });
    const pickUnit = (i, packagingId) => setLine(i, { packagingId, unitCost: costFor(productsById[lines[i].productId], packagingId) });
    const totals = formTotals(lines, productsById);

    const submit = async () => {
        if (!supplierId) return toast.error('Elige un suplidor.');
        if (!lines.length || lines.some((l) => !l.productId || !(Number(l.quantity) > 0) || l.unitCost === '' || Number(l.unitCost) < 0)) {
            return toast.error('Completa producto, cantidad y costo en cada línea.');
        }
        setSaving(true);
        try {
            await onSave({
                supplierId, expectedDate: expectedDate || null, notes: notes || undefined,
                items: lines.map((l) => ({ productId: l.productId, packagingId: l.packagingId || null, quantity: Number(l.quantity), unitCost: Number(l.unitCost) }))
            });
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={order ? `Editar orden ${order.number}` : 'Nueva orden de compra'} size="xl">
            <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid sm:grid-cols-2 gap-3">
                    <Select label="Suplidor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                        <option value="">Selecciona…</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                    <div>
                        <label htmlFor="po-date" className="block text-sm font-medium text-ink-soft mb-1">Fecha esperada</label>
                        <input id="po-date" type="date" className="input-base" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label htmlFor="po-notes" className="block text-sm font-medium text-ink-soft mb-1">Notas</label>
                    <textarea id="po-notes" rows={2} className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <div className="space-y-2">
                    {lines.map((l, i) => {
                        const p = productsById[l.productId];
                        return (
                            <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end border border-line rounded-lg p-2">
                                <div className="col-span-2 sm:col-span-4">
                                    <label htmlFor={`po-prod-${i}`} className="block text-xs text-ink-muted mb-1">Producto</label>
                                    <select id={`po-prod-${i}`} className="input-base" value={l.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                                        <option value="">Selecciona…</option>
                                        {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor={`po-unit-${i}`} className="block text-xs text-ink-muted mb-1">Unidad</label>
                                    <select id={`po-unit-${i}`} className="input-base" value={l.packagingId} onChange={(e) => pickUnit(i, e.target.value)}>
                                        <option value="">{unitOf(p?.unit).label}</option>
                                        {(p?.packagings || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor={`po-qty-${i}`} className="block text-xs text-ink-muted mb-1">Cantidad</label>
                                    <input id={`po-qty-${i}`} type="number" min="0" step="any" className="input-base" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor={`po-cost-${i}`} className="block text-xs text-ink-muted mb-1">Costo (sin ITBIS)</label>
                                    <input id={`po-cost-${i}`} type="number" min="0" step="0.01" className="input-base" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                                </div>
                                <div className="sm:col-span-2 flex items-center justify-between gap-2 text-sm">
                                    <span className="text-ink-muted">ITBIS {productRate(p)}%</span>
                                    <Button type="button" variant="ghost" size="sm" aria-label={`Quitar línea ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 size={16} /></Button>
                                </div>
                            </div>
                        );
                    })}
                    <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { productId: '', packagingId: '', quantity: '1', unitCost: '' }])}>
                        <Plus size={14} className="mr-1" /> Agregar producto
                    </Button>
                </div>

                <dl className="ml-auto max-w-xs text-sm space-y-1" aria-label="Totales de la orden">
                    <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd data-testid="po-subtotal">{formatCurrency(totals.subtotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-muted">ITBIS</dt><dd data-testid="po-itbis">{formatCurrency(totals.itbis)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>Total</dt><dd data-testid="po-total">{formatCurrency(totals.total)}</dd></div>
                </dl>

                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default PurchaseOrderForm;
