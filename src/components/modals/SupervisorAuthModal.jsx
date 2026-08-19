import React, { useMemo, useState } from 'react';
import Button from '../ui/Button.jsx';
import { hashPin } from '../../utils/crypto.js';
import toast from 'react-hot-toast';

// Props:
// - supervisors: array of users with { id, uid, firstName, lastName, role, pinHash }
// - onClose(result): result is { authorized: true, user } or false/null
export default function SupervisorAuthModal({ supervisors = [], onClose }) {
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedUser = useMemo(() => supervisors.find(u => (u.id || u.uid) === selectedId), [supervisors, selectedId]);

  const handleAuthorize = async () => {
    if (!selectedUser) { toast.error('Selecciona un supervisor.'); return; }
    if (!pin) { toast.error('Ingresa el PIN.'); return; }
    setLoading(true);
    try {
      const h = await hashPin(pin);
      // For admin stored under adminProfile.pinHash
      const expectedHash = selectedUser.pinHash || selectedUser.adminPinHash || '';
      if (expectedHash && h === expectedHash) {
        onClose({ authorized: true, user: selectedUser });
      } else {
        toast.error('PIN incorrecto.');
      }
    } catch (e) {
      console.error('Auth error', e);
      toast.error('No se pudo validar el PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-sm">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Autorización de Supervisor</h3>
          <button onClick={() => onClose(false)} className="text-2xl text-gray-500">&times;</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Supervisor</label>
            <select className="input-base" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">Selecciona...</option>
              {supervisors.map(u => (
                <option key={u.id || u.uid} value={u.id || u.uid}>{u.firstName || ''} {u.lastName || ''} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">PIN</label>
            <input type="password" className="input-base" value={pin} onChange={e => setPin(e.target.value)} placeholder="****" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleAuthorize} disabled={loading}>Autorizar</Button>
        </div>
      </div>
    </div>
  );
}
