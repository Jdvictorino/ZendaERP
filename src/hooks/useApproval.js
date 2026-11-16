import React, { useState, useCallback } from 'react';
import ApprovalPinModal from '../components/modals/ApprovalPinModal.jsx';

// withApproval(action, run): llama run(); si el servidor pide autorización con PIN, abre la ventana
// y repite run(token). `action` solo se usa si el servidor no indica otra en su respuesta.
export default function useApproval() {
  const [pending, setPending] = useState(null);

  const withApproval = useCallback(async (action, run) => {
    try {
      return await run();
    } catch (e) {
      if (e?.status !== 403 || e.data?.code !== 'APPROVAL_REQUIRED') throw e;
      const token = await new Promise(resolve => setPending({ action: e.data.action || action, resolve }));
      if (!token) throw new Error('Operación cancelada');
      return run(token);
    }
  }, []);

  const approvalModal = pending ? React.createElement(ApprovalPinModal, {
    action: pending.action,
    onDone: (token) => { pending.resolve(token); setPending(null); }
  }) : null;

  return { withApproval, approvalModal };
}
