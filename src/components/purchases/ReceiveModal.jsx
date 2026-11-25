import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { roundQty } from '../../utils/units.js';

const ReceiveModal = ({ isOpen, onClose, order, onSubmit }) => {
    const pending = (i) => roundQty(i.quantity - i.receivedQuantity);
    const [qty, setQty] = useState(() => Object.fromEntries(order.items.map((i) => [i.id, String(pending(i))])));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            await onSubmit({ lines: order.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]) || 0 })), notes: notes || undefined });
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Recibir mercancía — ${order.number}`} size="lg">
            <div className="p-6 space-y-4 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-ink-muted"><th>Producto</th><th>Pedido</th><th>Pendiente</th><th>Recibir</th></tr></thead>
                    <tbody>
                        {order.items.map((i, k) => (
                            <tr key={i.id} className="border-t border-line">
                                <td className="py-2">{i.product?.name}{i.packagingName ? ` — ${i.packagingName}` : ''}</td>
                                <td>{i.quantity}</td>
                                <td>{pending(i)}</td>
                                <td><input aria-label={`Cantidad a recibir ${k + 1}`} type="number" min="0" step="any" className="input-base w-28" value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
