import React, { useMemo, useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';
import { logAction } from '../../utils/audit.js';
import { openCashDrawer } from '../../utils/printer.js';

export default function CashMovementModal({ onClose, currentUserProfile, companyProfile, openShift, registerId }) {
  const currency = companyProfile?.currency || 'USD';
  const [type, setType] = useState('retiro'); // retiro | ingreso
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { toast.error('Monto inválido'); return; }
    if (!openShift?.id) { toast.error('No hay turno abierto.'); return; }

    try {
      // Mapear tipo para el backend (retiro -> salida, ingreso -> entrada)
      const backendType = type === 'retiro' ? 'salida' : 'entrada';
      
      await toast.promise(
        shifts.addMovement(openShift.id, backendType, val, reason || ''),
        {
          loading: 'Guardando movimiento...',
          success: 'Movimiento registrado.',
          error: 'No se pudo registrar.'
        }
      );
      
      try { 
        await logAction('cash_movement', { 
          registerId: registerId || '', 
          type, 
          amount: val, 
          shiftId: openShift.id, 
          by: currentUserProfile?.uid || currentUserProfile?.id 
        }); 
      } catch {}
      
      try { await openCashDrawer(); } catch {}
      
      onClose(true);
    } catch (error) {
      console.error('Error guardando movimiento:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Movimiento de Caja</h3>
          <button onClick={() => onClose(false)} className="text-2xl text-gray-500">&times;</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tipo</label>
            <select className="input-base" value={type} onChange={e => setType(e.target.value)}>
              <option value="retiro">Retiro</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>
          {(registerId || openShift.registerId) && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Caja</label>
              <input className="input-base bg-gray-100" value={registerId || openShift.registerId} readOnly />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Monto</label>
            <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Motivo</label>
            <textarea className="input-base" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Retiro de excedente, Cambio para caja, etc." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </div>
      </div>
    </div>
  );
}
