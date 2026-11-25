import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Select from '../ui/Select.jsx';
import { round2 } from '../../utils/tax.js';
import { roundQty } from '../../utils/units.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

export const PAYMENT_TYPES = [
    ['01', 'Efectivo'], ['02', 'Cheque/transferencia/depósito'], ['03', 'Tarjeta'],
    ['04', 'Compra a crédito'], ['05', 'Permuta'], ['06', 'Nota de crédito'], ['07', 'Mixto']
];
const today = () => new Date().toLocaleDateString('en-CA');

const SupplierInvoiceModal = ({ isOpen, onClose, order, onSubmit }) => {
    const open = (i) => roundQty(i.receivedQuantity - i.invoicedQuantity);
    const [qty, setQty] = useState(() => Object.fromEntries(order.items.map((i) => [i.id, String(open(i))])));
    const [ncf, setNcf] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(today());
    const [paymentType, setPaymentType] = useState('04');
    const [saving, setSaving] = useState(false);

    let goods = 0, itbis = 0;
    for (const i of order.items) {
        const amount = round2((Number(qty[i.id]) || 0) * Number(i.unitCost));
        goods += amount;
        itbis += round2((amount * Number(i.taxRate || 0)) / 100);
    }
    goods = round2(goods); itbis = round2(itbis);

    const submit = async () => {
        setSaving(true);
        try {
            await onSubmit({ lines: order.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]) || 0 })), ncf: ncf.trim(), invoiceDate, paymentType });
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Factura del suplidor — ${order.number}`} size="lg">
            <div className="p-6 space-y-4 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-ink-muted"><th>Producto</th><th>Recibido sin facturar</th><th>Facturar</th></tr></thead>
                    <tbody>
                        {order.items.map((i, k) => (
                            <tr key={i.id} className="border-t border-line">
                                <td className="py-2">{i.product?.name}{i.packagingName ? ` — ${i.packagingName}` : ''}</td>
                                <td>{open(i)}</td>
                                <td><input aria-label={`Cantidad a facturar ${k + 1}`} type="number" min="0" step="any" className="input-base w-28" value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                        <label htmlFor="inv-ncf" className="block text-sm font-medium text-ink-soft mb-1">NCF</label>
                        <input id="inv-ncf" className="input-base" value={ncf} onChange={(e) => setNcf(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="inv-date" className="block text-sm font-medium text-ink-soft mb-1">Fecha de la factura</label>
                        <input id="inv-date" type="date" className="input-base" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                    </div>
                    <Select label="Forma de pago" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                        {PAYMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{v} {l}</option>)}
                    </Select>
                </div>
                <dl className="ml-auto max-w-xs text-sm space-y-1" aria-label="Resumen de la factura">
                    <div className="flex justify-between"><dt className="text-ink-muted">Bienes</dt><dd>{formatCurrency(goods)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-muted">ITBIS</dt><dd>{formatCurrency(itbis)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatCurrency(round2(goods + itbis))}</dd></div>
                </dl>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving || !ncf.trim()}>{saving ? 'Registrando…' : 'Registrar factura'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default SupplierInvoiceModal;
