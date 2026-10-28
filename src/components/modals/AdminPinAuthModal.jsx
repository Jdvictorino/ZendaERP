import React, { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { hashPin } from '../../utils/crypto.js';
import toast from 'react-hot-toast';

// Props:
// - adminUser: The current user or admin user object. Needs to check `adminUser.pinHash`
// - currentUserProfile: To fallback or to verify
// - onClose(result): result is true if authorized, false otherwise
export default function AdminPinAuthModal({ adminUser, currentUserProfile, onClose }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const targetUser = adminUser || currentUserProfile;

  const handleAuthorize = async () => {
    if (!pin) { toast.error('Ingresa el PIN de administrador.'); return; }
    
    // Si el usuario no tiene pinHash seteado (y debe tenerlo)
    const expectedHash = targetUser?.pinHash || targetUser?.adminPinHash;
    if (!expectedHash) {
      toast.error('No tienes un PIN de Administrador configurado en tu perfil. Por favor, configúralo primero.');
      onClose(false);
      return;
    }

    setLoading(true);
    try {
      const h = await hashPin(pin);
      if (h === expectedHash) {
        onClose(true);
      } else {
        toast.error('PIN de Administrador incorrecto.');
      }
    } catch (e) {
      console.error('Auth error', e);
      toast.error('No se pudo validar el PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[80] p-4">
      <div className="modal-panel p-6 w-full max-w-sm">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-semibold text-ink">Validación de Administrador</h3>
          <button onClick={() => onClose(false)} aria-label="Cerrar" className="modal-close"><X size={18} /></button>
        </div>
        <p className="text-sm text-ink-soft mb-4">
          Esta acción requiere privilegios de administrador. Por favor, introduce tu PIN para continuar.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-ink-soft mb-1">PIN de Admin</label>
            <input 
              type="password" 
              autoFocus
              className="input-base text-center tracking-[0.5em] text-lg font-bold" 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              placeholder="****" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAuthorize();
              }}
            />
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
