import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FileSignature, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import api from '../../api/client.js';
import { suggestedVoucher } from '../../utils/tax.js';
import { buildVoucherOptions, missingVoucherWarning } from '../../utils/voucherOptions.js';

// exempt: el pedido ya se vendió exento (el servidor lo decidió al crearlo, invoice.exemptionNumber)
const BillingTypeModal = ({ onClose, onConfirm, customer, companyProfile, exempt = false }) => {
    const [billingType, setBillingType] = useState('NoFiscal'); // Ahora el default es Sin Valor Fiscal
    const [rnc, setRnc] = useState('');

    const [ecfInfo, setEcfInfo] = useState({ enabled: false, sequences: [] });
    useEffect(() => {
        Promise.all([api.ecf.getConfig(), api.ecf.getSequences()])
            .then(([cfg, seqs]) => setEcfInfo({ enabled: !!cfg?.ecfEnabled, sequences: Array.isArray(seqs) ? seqs : [] }))
            .catch(() => {}); // sin permiso o sin e-CF: solo comprobantes tradicionales
    }, []);
    const options = useMemo(() => buildVoucherOptions(companyProfile, ecfInfo), [companyProfile, ecfInfo]);
    const suggested = suggestedVoucher(customer, { ecf: ecfInfo.enabled, exempt });
    const warning = missingVoucherWarning(customer, { ecf: ecfInfo.enabled, exempt }, options, suggested);
    // sugerir el comprobante del cliente al abrir y al cargar la config e-CF
    useEffect(() => {
        if (options.some(o => o.value === suggested)) setBillingType(suggested);
    }, [suggested]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (customer?.rnc) setRnc(customer.rnc);
        else if (customer && customer.identificationNumber && customer.type === 'Empresa') {
            setRnc(customer.identificationNumber);
        }
    }, [customer]);

    const handleConfirm = () => {
        if (options.find(o => o.value === billingType)?.requiresBuyer && !rnc.trim()) {
            toast.error("El RNC es obligatorio para facturas de Crédito Fiscal.");
            return;
        }
        onConfirm(billingType, rnc);
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4">
            <div className="modal-panel p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-ink flex items-center gap-2"><FileSignature /> Tipo de Facturación</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                
                <div className="space-y-4">
                    {options.map(o => (
                        <div key={o.value} onClick={() => setBillingType(o.value)} className={`p-4 border rounded-lg cursor-pointer ${billingType === o.value ? 'border-brand-500 bg-brand-50' : ''}`}>
                            <p className="font-bold">{o.value === 'NoFiscal' ? 'Factura Sin Valor Fiscal' : o.label}</p>
                            <p className="text-sm text-ink-soft">{o.value === 'NoFiscal' ? 'Para uso interno o informal. No consume una secuencia de NCF.' : `Próximo comprobante: ${o.preview}`}</p>
                        </div>
                    ))}
                    {warning && <p role="alert" className="text-xs text-warning-700 dark:text-warning-400">{warning}</p>}
                </div>

                {options.find(o => o.value === billingType)?.requiresBuyer && (
                    <div className="mt-6">
                        <label className="block text-ink-soft mb-1 font-semibold">RNC del Cliente</label>
                        <input 
                            type="text" 
                            value={rnc} 
                            onChange={(e) => setRnc(e.target.value)} 
                            className="input-base" 
                            placeholder="Ingrese el RNC"
                            required 
                        />
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="button" onClick={handleConfirm}>Confirmar y Facturar</Button>
                </div>
            </div>
        </div>
    );
};

export default BillingTypeModal;
