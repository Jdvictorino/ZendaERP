import React, { useState, useEffect } from 'react';
import { FileSignature } from 'lucide-react';
import Button from '../ui/Button.jsx';

const BillingTypeModal = ({ onClose, onConfirm, customer, companyProfile }) => {
    const [billingType, setBillingType] = useState('NoFiscal'); // Ahora el default es Sin Valor Fiscal
    const [rnc, setRnc] = useState('');

    useEffect(() => {
        if (customer && customer.identificationNumber && customer.type === 'Empresa') {
            setRnc(customer.identificationNumber);
        }
    }, [customer]);

    const handleConfirm = () => {
        if (billingType === 'B01' && !rnc.trim()) {
            alert("El RNC es obligatorio para facturas de Crédito Fiscal.");
            return;
        }
        onConfirm(billingType, rnc);
    };

    const nextB01 = companyProfile?.ncfB01SequenceNext || 1;
    const nextB02 = companyProfile?.ncfB02SequenceNext || 1;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-md">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900 flex items-center gap-2"><FileSignature /> Tipo de Facturación</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                
                <div className="space-y-4">
                    {/* --- NUEVA OPCIÓN AÑADIDA --- */}
                    <div onClick={() => setBillingType('NoFiscal')} className={`p-4 border rounded-lg cursor-pointer ${billingType === 'NoFiscal' ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                        <p className="font-bold">Factura Sin Valor Fiscal</p>
                        <p className="text-sm text-gray-600">Para uso interno o informal. No consume una secuencia de NCF.</p>
                    </div>
                    <div onClick={() => setBillingType('B02')} className={`p-4 border rounded-lg cursor-pointer ${billingType === 'B02' ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                        <p className="font-bold">Factura de Consumo (B02)</p>
                        <p className="text-sm text-gray-600">Para clientes que no reportan gastos. Próximo NCF: {nextB02}</p>
                    </div>
                    <div onClick={() => setBillingType('B01')} className={`p-4 border rounded-lg cursor-pointer ${billingType === 'B01' ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                        <p className="font-bold">Factura de Crédito Fiscal (B01)</p>
                        <p className="text-sm text-gray-600">Para empresas que necesitan comprobante. Próximo NCF: {nextB01}</p>
                    </div>
                </div>

                {billingType === 'B01' && (
                    <div className="mt-6">
                        <label className="block text-gray-700 mb-1 font-semibold">RNC del Cliente</label>
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
