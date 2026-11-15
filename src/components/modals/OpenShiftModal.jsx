import React, { useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import toast from 'react-hot-toast';
import { logAction } from '../../utils/audit.js';
import ShiftDialog, { CashCount, countTotal, emptyCount } from './ShiftDialog.jsx';

export default function OpenShiftModal({ onClose, currentUserProfile, companyProfile, registerId, existingShifts = [] }) {
  const currency = companyProfile?.currency || 'DOP';
  const [denoms, setDenoms] = useState(emptyCount);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const total = countTotal(denoms);

  const handleOpen = async () => {
    // Una sola caja abierta por registro
    const alreadyOpen = (existingShifts || []).some(s => s.status === 'open' && (s.registerId || '') === (registerId || ''));
    if (alreadyOpen) {
      toast.error('Ya existe un turno abierto para esta caja.');
      return;
    }

    setSaving(true);
    try {
      await toast.promise(
        shifts.open(total, registerId || '', notes || ''),
        { loading: 'Abriendo turno...', success: 'Turno abierto.', error: 'No se pudo abrir el turno.' }
      );
      try {
        await logAction('shift_open', { registerId: registerId || '', amount: total, by: currentUserProfile?.uid || currentUserProfile?.id });
      } catch {}
      onClose(true);
    } catch (error) {
      console.error('Error abriendo turno:', error);
      setSaving(false);
    }
  };

  return (
    <ShiftDialog
      title="Abrir turno"
      subtitle={`${registerId ? `Caja: ${registerId}. ` : ''}Cuenta el efectivo con que empiezas.`}
      onClose={() => onClose(false)}
      footer={<>
        <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
        <Button onClick={handleOpen} disabled={saving}>{saving ? 'Abriendo...' : 'Abrir turno'}</Button>
      </>}
    >
      <CashCount denoms={denoms} setDenoms={setDenoms} currency={currency} label="Fondo inicial" />
      <label className="block mt-4">
        <span className="block text-sm text-ink-soft mb-1">Notas</span>
        <textarea className="input-base" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </label>
    </ShiftDialog>
  );
}
