import React, { useState } from 'react';
import { auth } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';
import ShiftDialog from './ShiftDialog.jsx';

export const APPROVAL_LABELS = {
  shift_open: 'Abrir turno',
  shift_close_tolerance: 'Cerrar turno con diferencia',
  price_override: 'Cambio de precio o descuento'
};

// El servidor verifica el PIN; aquí solo se pide y se muestra su respuesta.
// onDone(token) al acertar, onDone(null) al cancelar.
export default function ApprovalPinModal({ action, onDone }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      const { approvalToken } = await auth.approve(pin, action);
      onDone(approvalToken);
    } catch (e) {
      setError(e.message || 'No se pudo validar el PIN.');
      setBusy(false);
    }
  };

  return (
    <ShiftDialog
      title="Autorización con PIN"
      subtitle={APPROVAL_LABELS[action] || action}
      width="max-w-sm"
      onClose={() => onDone(null)}
      footer={(
        <>
          <Button variant="secondary" onClick={() => onDone(null)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !pin}>Autorizar</Button>
        </>
      )}
    >
      <p className="text-sm text-ink-soft mb-3">Un gerente o administrador debe introducir su PIN para continuar.</p>
      <input
        aria-label="PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        className="input-base text-center tracking-[0.5em] text-lg font-bold"
        value={pin}
        onChange={e => setPin(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="****"
      />
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
    </ShiftDialog>
  );
}
