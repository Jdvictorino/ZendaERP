import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import api from '../../api/client.js';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import { generatePDF } from '../../utils/pdfGenerator.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Button from '../ui/Button.jsx';
import { roundQty } from '../../utils/units.js';

const round2 = (n) => Math.round(n * 100) / 100;

const CreditNoteModal = ({ invoice, onClose, onSuccess, companyProfile, customers }) => {
    const [noteType, setNoteType] = useState('Anulación de Factura');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState(invoice.creditNotes || []);
    const [returnQty, setReturnQty] = useState({});
    const currency = companyProfile?.currency || 'USD';
    const items = invoice.items || [];
    const total = Number(invoice.total) || 0;

    // Las notas anteriores (con lo que ya devolvieron) vienen en el detalle de la factura
    useEffect(() => {
        api.invoices.get(invoice.id).then((full) => setNotes(full?.creditNotes || [])).catch(() => {});
    }, [invoice.id]);

    const credited = notes.reduce((sum, n) => sum + Number(n.amount || 0), 0);
    const remaining = round2(total - credited);
    const returnedBefore = useMemo(() => {
        const map = {};
        notes.forEach((n) => (Array.isArray(n.items) ? n.items : []).forEach((r) => { map[r.itemId] = (map[r.itemId] || 0) + r.quantity; }));
        return map;
    }, [notes]);

    // Valor de una unidad dentro del total de la factura (con su parte de ITBIS y descuentos)
    const lineSum = items.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    const unitValue = (i) => (lineSum > 0 && i.quantity > 0 ? (Number(i.subtotal) / i.quantity / lineSum) * total : 0);
    const itemsValue = round2(items.reduce((sum, i) => sum + (returnQty[i.id] || 0) * unitValue(i), 0));

    const isFull = noteType === 'Anulación de Factura';
    const [amount, setAmount] = useState(String(remaining));
    useEffect(() => {
        if (isFull) setAmount(String(remaining));
        else if (itemsValue > 0) setAmount(String(Math.min(itemsValue, remaining)));
    }, [isFull, itemsValue, remaining]);

    const leftOf = (item) => roundQty(item.quantity - (returnedBefore[item.id] || 0));
    // Decimales solo en líneas sin empaque de productos fraccionables; el servidor valida igual
    const canFraction = (item) => !item.packagingName && item.product?.allowFractions === true;
    const setQty = (item, value) => {
        const left = leftOf(item);
        const n = canFraction(item) ? Math.round(parseFloat(value) * 100) / 100 : parseInt(value, 10);
        const qty = Math.max(0, Math.min(left, n || 0));
        setReturnQty((prev) => ({ ...prev, [item.id]: qty }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const creditAmount = parseFloat(amount);
        if (isNaN(creditAmount) || creditAmount <= 0 || creditAmount > remaining + 0.01) {
            toast.error(`El monto debe ser mayor que 0 y no pasar de ${formatCurrency(remaining, currency)}.`);
            return;
        }

        // El servidor asigna el NCF B04 de la secuencia autorizada cuando la factura es fiscal
        const promise = api.invoices.createCreditNote(invoice.id, {
            amount: creditAmount,
            reason: `${noteType}: ${reason}`,
            items: isFull ? [] : Object.entries(returnQty).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity }))
        }).then((creditNote) => {
            // Nota de una factura electrónica: su e-CF (E34/E33) puede quedar pendiente de llegar a la DGII
            if (creditNote.ecfResult && !creditNote.ecfResult.success) {
                toast.error(`La nota quedó registrada con ${creditNote.ncfNumber}, pero la DGII aún no recibió su e-CF: ${creditNote.ecfResult.error || creditNote.ecfResult.ecfDocument?.dgiiMessage || 'sin respuesta'}. Reinténtalo desde Facturación Electrónica.`, { duration: 10000 });
            }
            const customerDetails = (customers || []).find(c => c.id === invoice.customerId);
            const creditNoteData = {
                ...creditNote,
                creditNoteNumber: creditNote.id,
                originalInvoiceNumber: invoice.invoiceNumber || invoice.orderNumber,
                customerName: invoice.customerName,
                noteType,
                date: new Date()
            };
            generatePDF(creditNoteData, 'credit-note', companyProfile, customerDetails, invoice.emitterInfo, 'view');
        });

        try {
            await toast.promise(promise, {
                loading: 'Emitiendo nota de crédito...',
                success: () => { playSuccessSound(); return '¡Nota de crédito emitida!'; },
                error: (err) => { playErrorSound(); return err?.message || 'No se pudo emitir la nota de crédito.'; }
            });
            onSuccess();
        } catch {
            // el aviso ya muestra el motivo (p. ej. secuencia B04 agotada); la ventana queda abierta
        }
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4">
            <div className="modal-panel p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-2 gap-2">
                    <h3 className="text-lg font-semibold text-ink">Emitir Nota de Crédito</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <p className="text-ink-soft mb-4">
                    Para Factura: {invoice.invoiceNumber || invoice.orderNumber}
                    {credited > 0 && <> · Ya acreditado: {formatCurrency(credited, currency)}</>}
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="cn-type" className="block text-ink-soft mb-1">Tipo de Nota de Crédito</label>
                        <select id="cn-type" value={noteType} onChange={e => setNoteType(e.target.value)} className="input-base">
                            <option>Anulación de Factura</option>
                            <option>Reembolso</option>
                            <option>Balance a Favor</option>
                            <option>Modificación de Valor</option>
                        </select>
                        {isFull && <p className="mt-1 text-xs text-ink-muted">Anula la factura por lo que queda y devuelve a inventario todos los artículos.</p>}
                    </div>
                    {!isFull && items.length > 0 && (
                        <fieldset>
                            <legend className="block text-ink-soft mb-1">Artículos que vuelven a inventario</legend>
                            <div className="divide-y divide-line rounded-lg border border-line">
                                {items.map((item) => {
                                    const left = leftOf(item);
                                    return (
                                        <label key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                            <span className="min-w-0">
                                                <span className="block truncate text-ink">{item.productName}</span>
                                                <span className="text-xs text-ink-muted">
                                                    {left > 0 ? `Puede devolver hasta ${left}` : 'Ya devuelto completo'}
                                                </span>
                                            </span>
                                            <input
                                                type="number" min="0" max={left} step={canFraction(item) ? 0.01 : 1} disabled={left <= 0}
                                                value={returnQty[item.id] || 0}
                                                onChange={(e) => setQty(item, e.target.value)}
                                                className="input-base w-20 text-right tabular-nums"
                                                aria-label={`Cantidad de ${item.productName} a devolver`}
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                            <p className="mt-1 text-xs text-ink-muted">Déjalo en 0 si la nota no devuelve mercancía (p. ej. un descuento posterior).</p>
                        </fieldset>
                    )}
                    <div>
                        <label htmlFor="cn-amount" className="block text-ink-soft mb-1">Valor a Acreditar (Máx: {formatCurrency(remaining, currency)})</label>
                        <input id="cn-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-base" required max={remaining} min="0.01" step="0.01" disabled={isFull} />
                    </div>
                    <div>
                        <label htmlFor="cn-reason" className="block text-ink-soft mb-1">Descripción / Motivo</label>
                        <textarea id="cn-reason" value={reason} onChange={e => setReason(e.target.value)} className="input-base" rows="3" required placeholder="Ej: Devolución de mercancía por defecto, corrección en precio..."/>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={remaining <= 0}>Emitir Nota</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreditNoteModal;
