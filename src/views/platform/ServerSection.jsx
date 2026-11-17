import React, { useEffect, useState } from 'react';
import { consoleApi } from '../../api/client.js';
import Segmented from '../../components/ui/Segmented.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import TotpSetup from './server/TotpSetup.jsx';
import UnlockDialog from './server/UnlockDialog.jsx';
import TerminalTab from './server/TerminalTab.jsx';
import DatabaseTab from './server/DatabaseTab.jsx';
import AuditTab from './server/AuditTab.jsx';

const TABS = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'db', label: 'Base de datos' },
  { value: 'audit', label: 'Registro' },
];

export default function ServerSection({ sessionToken }) {
  const [configured, setConfigured] = useState(undefined);
  const [tab, setTab] = useState('audit');
  const [unlocked, setUnlocked] = useState(consoleApi.isUnlocked());
  const [error, setError] = useState('');

  useEffect(() => {
    consoleApi.totpStatus(sessionToken).then((r) => setConfigured(r.configured)).catch((e) => setError(e.message));
  }, [sessionToken]);

  if (error) return <p role="alert" className="text-sm text-danger-600">{error}</p>;
  if (configured === undefined) return <Spinner />;
  if (!configured) return <TotpSetup sessionToken={sessionToken} onConfirmed={() => setConfigured(true)} />;

  const needsCode = tab !== 'audit' && !unlocked;
  return (
    <div className="space-y-4">
      <div className="max-w-md"><Segmented label="Servidor" options={TABS} value={tab} onChange={setTab} /></div>
      {needsCode && <UnlockDialog sessionToken={sessionToken} onUnlocked={() => setUnlocked(true)} onClose={() => setTab('audit')} />}
      {!needsCode && tab === 'terminal' && <TerminalTab sessionToken={sessionToken} onLocked={() => { setUnlocked(false); setTab('audit'); }} />}
      {!needsCode && tab === 'db' && <DatabaseTab sessionToken={sessionToken} onLocked={() => setUnlocked(false)} />}
      {tab === 'audit' && <AuditTab sessionToken={sessionToken} />}
    </div>
  );
}
