import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { roundQty } from '../../utils/units.js';
import { CHARGE_KEYS, previewUnitCosts } from '../../utils/receiptCost.js';

const CHARGE_FIELDS = { flete: 'Flete', seguro: 'Seguro', aranceles: 'Aranceles', otros: 'Otros' };

const ReceiveModal = ({ isOpen, onClose, order, onSubmit }) => {
    const pending = (i) => roundQty(i.quantity - i.receivedQuantity);
    const [qty, setQty] = useState(() => Object.fromEntries(order.items.map((i) => [i.id, String(pending(i))])));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [charges, setCharges] = useState({ flete: '', seguro: '', aranceles: '', otros: '' });
    const [error, setError] = useState('');
    const amount = (k) => (String(charges[k]).trim() === '' ? 0 : Number(charges[k]));
    const badKey = CHARGE_KEYS.find((k) => !Number.isFinite(amount(k)) || amount(k) < 0);
    const preview = previewUnitCosts(
        order.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]) || 0, unitCost: Number(i.unitCost), factor: Number(i.packagingFactor ?? 1) || 1 })),
        badKey ? {} : charges
    );

    const submit = async () => {
        if (badKey) { setError(`Revisa ${CHARGE_FIELDS[badKey].toLowerCase()}: debe ser un monto de 0 o más.`); return; }
        setError('');
        setSaving(true);
        try {
            await onSubmit({
                lines: order.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]) || 0 })), notes: notes || undefined,
                charges: Object.fromEntries(CHARGE_KEYS.map((k) => [k, amount(k)]))
            });
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Recibir mercancía — ${order.number}`} size="lg">
            <div className="p-6 space-y-4 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-ink-muted"><th>Producto</th><th>Pedido</th><th>Pendiente</th><th>Recibir</th><th>Costo unitario final</th></tr></thead>
                    <tbody>
                        {order.items.map((i, k) => (
                            <tr key={i.id} className="border-t border-line">
                                <td className="py-2">{i.product?.name}{i.packagingName ? ` — ${i.packagingName}` : ''}</td>
                                <td>{i.quantity}</td>
                                <td>{pending(i)}</td>
                                <td><input aria-label={`Cantidad a recibir ${k + 1}`} type="number" min="0" step="any" className="input-base w-28" value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /></td>
                                <td data-testid={`rc-cost-${i.id}`} className="tabular-nums">{preview[i.id].toFixed(4)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <details className="group">
                    <summary className="text-sm font-medium text-ink-soft cursor-pointer select-none">Gastos de importación</summary>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        {CHARGE_KEYS.map((k) => (
                            <div key={k}>
                                <label htmlFor={`rc-${k}`} className="block text-sm text-ink-soft mb-1">{CHARGE_FIELDS[k]}</label>
                                <input id={`rc-${k}`} type="number" min="0" step="any" className="input-base" value={charges[k]} onChange={(e) => setCharges({ ...charges, [k]: e.target.value })} />
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-warning-700 dark:text-warning-400">No incluyas el ITBIS de aduana: es crédito fiscal</p>
                </details>
                {error && <p role="alert" className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>}
                <div>
                    <label htmlFor="rc-notes" className="block text-sm font-medium text-ink-soft mb-1">Notas</label>
                    <textarea id="rc-notes" rows={2} className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? 'Registrando…' : 'Registrar recepción'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ReceiveModal;
