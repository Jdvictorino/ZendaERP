import React, { useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import Input from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import { consoleApi } from '../../../api/client.js';

export default function UnlockDialog({ sessionToken, onUnlocked, onClose }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await consoleApi.unlock(sessionToken, code);
      onUnlocked();
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Verificación" subtitle="Escribe el código de tu app autenticadora." size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Input aria-label="Código de verificación" placeholder="Código de verificación" inputMode="numeric" maxLength={6} autoFocus
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <Button type="submit" disabled={busy || code.length !== 6} className="w-full">Desbloquear</Button>
      </form>
    </Modal>
  );
}
