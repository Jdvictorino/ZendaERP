// src/components/modals/NcfModal.jsx

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Save } from 'lucide-react';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import Button from '../ui/Button.jsx';

// Lista de los tipos de NCF según la DGII (Tradicionales)
const ncfTypes = [
    { code: 'B01', name: 'Crédito Fiscal (B01)', group: 'ncf' },
    { code: 'B02', name: 'Consumidor Final (B02)', group: 'ncf' },
    { code: 'B03', name: 'Nota de Débito (B03)', group: 'ncf' },
    { code: 'B04', name: 'Nota de Crédito (B04)', group: 'ncf' },
    { code: 'B11', name: 'Comprobante de Compras (B11)', group: 'ncf' },
    { code: 'B12', name: 'Registro Único de Ingresos (B12)', group: 'ncf' },
    { code: 'B13', name: 'Gasto Menor (B13)', group: 'ncf' },
    { code: 'B14', name: 'Régimen Especial (B14)', group: 'ncf' },
    { code: 'B15', name: 'Gubernamental (B15)', group: 'ncf' },
    { code: 'B16', name: 'Exportación (B16)', group: 'ncf' }
];

const NcfModal = ({ companyProfile, onClose, onSave, isMasterUser }) => {
    const [sequences, setSequences] = useState([]);

    useEffect(() => {
        // Inicializa las secuencias, creando las que no existan
        const existingSequences = companyProfile?.ncfSequences || [];
        const fullSequences = ncfTypes.map(type => {
            const existing = existingSequences.find(s => s.code === type.code);
            return existing || {
                code: type.code, name: type.name, prefix: type.code,
                start: 1, end: 100, next: 1, active: false
            };
        });
        setSequences(fullSequences);
    }, [companyProfile]);

    const handleChange = (index, field, value) => {
        const newSequences = [...sequences];
        // Asegura que los valores numéricos se guarden como números
        const isNumericField = ['start', 'end', 'next'].includes(field);
        const processedValue = isNumericField ? parseInt(value, 10) || 0 : value;
        newSequences[index][field] = field === 'active' ? value : processedValue;
        setSequences(newSequences);
    };

    const handleSaveChanges = async () => {
        const promise = onSave(sequences);
        await toast.promise(promise, {
            loading: 'Guardando secuencias...',
            success: () => { playSuccessSound(); return '¡Secuencias guardadas!'; },
            error: () => { playErrorSound(); return 'No se pudo guardar.'; }
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Gestionar Secuencias de NCF</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                            <tr className="border-b">
                                <th className="p-2 text-left">Tipo de NCF</th>
                                <th className="p-2 text-left">Prefijo</th>
                                <th className="p-2 text-left">Desde</th>
                                <th className="p-2 text-left">Hasta</th>
                                <th className="p-2 text-left">Próximo</th>
                                <th className="p-2 text-center">Activa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sequences.map((seq, index) => {
                                const isOutOfSequence = seq.next > seq.end;
                                return (
                                    <tr key={seq.code} className={`border-b ${isOutOfSequence && seq.active ? 'bg-red-50' : ''}`}>
                                        <td className="p-2">
                                            <p className="font-semibold">{seq.name}</p>
                                            {isOutOfSequence && seq.active && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> Secuencia agotada</p>}
                                        </td>
                                        <td className="p-2"><input type="text" value={seq.prefix} onChange={(e) => handleChange(index, 'prefix', e.target.value)} className="input-base w-24" readOnly={!isMasterUser} /></td>
                                        <td className="p-2"><input type="number" value={seq.start} onChange={(e) => handleChange(index, 'start', e.target.value)} className="input-base w-28" readOnly={!isMasterUser} /></td>
                                        <td className="p-2"><input type="number" value={seq.end} onChange={(e) => handleChange(index, 'end', e.target.value)} className="input-base w-28" readOnly={!isMasterUser} /></td>
                                        <td className="p-2"><input type="number" value={seq.next} onChange={(e) => handleChange(index, 'next', e.target.value)} className="input-base w-28" readOnly={!isMasterUser} /></td>
                                        <td className="p-2 text-center">
                                            <input type="checkbox" checked={seq.active} onChange={(e) => handleChange(index, 'active', e.target.checked)} className="h-5 w-5" disabled={!isMasterUser} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end gap-2 mt-6 border-t pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
                    {isMasterUser && (
                       <Button type="button" onClick={handleSaveChanges} className="flex items-center gap-2">
                           <Save size={18}/> Guardar Cambios
                       </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NcfModal;