import React, { useState } from 'react';
import { X } from 'lucide-react';
import api from '../../api/client.js';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import { generatePDF } from '../../utils/pdfGenerator.js';
import Button from '../ui/Button.jsx';

const DebitNoteModal = ({ invoice, onClose, onSuccess, companyProfile, customers }) => {
    const [amount, setAmount] = useState(0);
    const [reason, setReason] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        const debitAmount = parseFloat(amount);
        if (isNaN(debitAmount) || debitAmount <= 0) {
            toast.error("El monto a debitar es inválido.");
            return;
        }

        // Generar NCF si es factura fiscal
        let ncfNumber = 'N/A';
        if (invoice.ncf && invoice.ncfType !== 'NoFiscal') {
            const ncfConfig = companyProfile?.ncf || {};
            const ncfSequence = ncfConfig?.b03_sequence_next;
            const ncfPrefix = ncfConfig?.b03_prefix;
            if (ncfSequence && ncfPrefix) {
                ncfNumber = `${ncfPrefix}${String(ncfSequence).padStart(8, '0')}`;
            }
        }

        const promise = api.invoices.createDebitNote(invoice.id, {
            amount: debitAmount,
            reason,
            ncfNumber
        }).then((debitNote) => {
            const customerDetails = (customers || []).find(c => c.id === invoice.customerId);
            const debitNoteData = {
                ...debitNote,
                debitNoteNumber: debitNote.id,
                originalInvoiceNumber: invoice.invoiceNumber || invoice.orderNumber,
                customerName: invoice.customerName,
                date: new Date()
            };
            generatePDF(debitNoteData, 'debit-note', companyProfile, customerDetails, invoice.emitterInfo, 'view');
        });

        await toast.promise(promise, {
            loading: 'Emitiendo nota de débito...',
            success: () => { playSuccessSound(); return '¡Nota de débito emitida!'; },
            error: () => { playErrorSound(); return 'No se pudo emitir la nota de débito.'; }
        });

        onSuccess();
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4">
            <div className="modal-panel p-6 w-full max-w-md">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-2 gap-2">
                    <h3 className="text-lg font-semibold text-ink">Emitir Nota de Débito</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <p className="text-ink-soft mb-4">Para Factura: {invoice.invoiceNumber}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="block text-ink-soft mb-1">Monto a Añadir</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-base" required min="0.01" step="0.01" /></div>
                    <div><label className="block text-ink-soft mb-1">Motivo del Débito</label><textarea value={reason} onChange={e => setReason(e.target.value)} className="input-base" rows="3" required placeholder="Ej: Intereses por mora, ajuste de precio..."/></div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Emitir Nota</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DebitNoteModal;
