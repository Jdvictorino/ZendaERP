import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import Input from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import { consoleApi } from '../../../api/client.js';

export default function TotpSetup({ sessionToken, onConfirmed }) {
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    consoleApi.totpSetup(sessionToken).then((r) => setUri(r.otpauthUri)).catch((e) => setError(e.message));
  }, [sessionToken]);

  async function confirm(e) {
    e.preventDefault();
    setError('');
    try {
      await consoleApi.totpConfirm(sessionToken, code);
      onConfirmed();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card p-6 max-w-md space-y-4">
      <h2 className="text-base font-semibold text-ink">Configura tu app autenticadora</h2>
      <p className="text-sm text-ink-muted">Escanea el código QR con Google Authenticator, Authy o similar y escribe el código de 6 dígitos que te muestre.</p>
      {uri && <div data-testid="totp-qr" className="bg-white p-3 inline-block rounded-lg"><QRCode value={uri} size={168} /></div>}
      <form onSubmit={confirm} className="space-y-3">
        <Input aria-label="Código de 6 dígitos" placeholder="Código de 6 dígitos" inputMode="numeric" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <Button type="submit" disabled={code.length !== 6 || !uri}>Confirmar</Button>
      </form>
    </section>
  );
}
