import React, { useMemo, useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';

const DEFAULT_DENOMS = [1000, 500, 200, 100, 50, 25, 10, 5, 1];

import { logAction } from '../../utils/audit.js';

export default function OpenShiftModal({ onClose, currentUserProfile, companyProfile, registerId, existingShifts = [] }) {
  const currency = companyProfile?.currency || 'USD';
  const [denoms, setDenoms] = useState(() => Object.fromEntries(DEFAULT_DENOMS.map(v => [v, 0])));
  const [notes, setNotes] = useState('');

  const total = useMemo(() => {
    return Object.entries(denoms).reduce((sum, [k, qty]) => sum + (Number(k) * (parseInt(qty || 0, 10))), 0);
  }, [denoms]);

  const changeQty = (value, qty) => setDenoms(prev => ({ ...prev, [value]: qty }));

  const handleOpen = async () => {
    // Prevent multiple open shifts per register
    const alreadyOpen = (existingShifts || []).some(s => s.status === 'open' && (s.registerId || '') === (registerId || ''));
    if (alreadyOpen) {
      toast.error('Ya existe un turno abierto para esta caja.');
      return;
    }

    try {
      await toast.promise(
        shifts.open(total, registerId || '', notes || ''),
        {
          loading: 'Abriendo turno...',
          success: 'Turno abierto.',
          error: 'No se pudo abrir el turno.'
        }
      );
      
      // Audit
      try { 
        await logAction('shift_open', { registerId: registerId || '', amount: total, by: currentUserProfile?.uid || currentUserProfile?.id });
      } catch {}
      
      onClose(true);
    } catch (error) {
      console.error('Error abriendo turno:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-lg">
        <div className="flex justify-between items-start gap-4 mb-2">
          <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Apertura de Turno</h3>
          <button onClick={() => onClose(false)} className="text-2xl text-gray-500">&times;</button>
        </div>
        <p className="text-sm text-gray-600 mb-4">Ingresa cantidades por denominación.</p>
        {registerId && (
          <div className="mb-2 text-sm text-gray-700"><span className="font-medium">Caja:</span> {registerId}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {DEFAULT_DENOMS.map(v => (
            <div key={v} className="flex items-center justify-between gap-2 border rounded p-2">
              <div className="text-gray-700 font-medium">{formatCurrency(v, currency)}</div>
              <input type="number" min="0" className="input-base w-24" value={denoms[v]} onChange={e => changeQty(v, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded flex items-center justify-between">
          <span className="text-gray-600">Fondo inicial</span>
          <span className="text-xl font-bold text-indigo-600">{formatCurrency(total, currency)}</span>
        </div>
        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">Notas</label>
          <textarea className="input-base" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleOpen} disabled={total < 0}>Abrir Turno</Button>
        </div>
      </div>
    </div>
  );
}
