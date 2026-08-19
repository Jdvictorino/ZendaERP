import React, { useState } from 'react';
import api from '../../api/client.js';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import { generatePDF } from '../../utils/pdfGenerator.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Button from '../ui/Button.jsx';

const CreditNoteModal = ({ invoice, onClose, onSuccess, companyProfile, customers }) => {
    const [noteType, setNoteType] = useState('Anulación de Factura');
    const [amount, setAmount] = useState(invoice.total?.toFixed?.(2) || invoice.total);
    const [reason, setReason] = useState('');
    const currency = companyProfile?.currency || 'USD';

    const handleSubmit = async (e) => {
        e.preventDefault();
        const creditAmount = parseFloat(amount);
        const invoiceTotal = parseFloat(invoice.total);
        if (isNaN(creditAmount) || creditAmount <= 0 || creditAmount > invoiceTotal) {
            toast.error("El monto a acreditar es inválido o supera el total de la factura.");
            return;
        }

        // Generar NCF si es factura fiscal
        let ncfNumber = 'N/A';
        if (invoice.ncf && invoice.ncfType !== 'NoFiscal') {
            const ncfConfig = companyProfile?.ncf || {};
            const ncfSequence = ncfConfig?.b04_sequence_next;
            const ncfPrefix = ncfConfig?.b04_prefix;
            if (ncfSequence && ncfPrefix) {
                ncfNumber = `${ncfPrefix}${String(ncfSequence).padStart(8, '0')}`;
            }
        }

        const promise = api.invoices.createCreditNote(invoice.id, {
            amount: creditAmount,
            reason: `${noteType}: ${reason}`,
            ncfNumber
        }).then((creditNote) => {
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

        await toast.promise(promise, {
            loading: 'Emitiendo nota de crédito...',
            success: () => { playSuccessSound(); return '¡Nota de crédito emitida!'; },
            error: () => { playErrorSound(); return 'No se pudo emitir la nota de crédito.'; }
        });

        onSuccess();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-2 gap-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Emitir Nota de Crédito</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <p className="text-gray-600 mb-4">Para Factura: {invoice.invoiceNumber}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 mb-1">Tipo de Nota de Crédito</label>
                        <select value={noteType} onChange={e => setNoteType(e.target.value)} className="input-base">
                            <option>Anulación de Factura</option>
                            <option>Reembolso</option>
                            <option>Balance a Favor</option>
                            <option>Modificación de Valor</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-700 mb-1">Valor a Acreditar (Máx: {formatCurrency(invoice.total, currency)})</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-base" required max={invoice.total} min="0.01" step="0.01" />
                    </div>
                    <div>
                        <label className="block text-gray-700 mb-1">Descripción / Motivo</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} className="input-base" rows="3" required placeholder="Ej: Devolución de mercancía por defecto, corrección en precio..."/>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-orange-500 hover:bg-orange-600">Emitir Nota</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreditNoteModal;
