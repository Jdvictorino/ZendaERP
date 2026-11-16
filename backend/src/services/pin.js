import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const PIN_RE = /^\d{4,8}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export async function hashPin(pin) {
  if (!PIN_RE.test(String(pin ?? ''))) throw new Error('El PIN debe tener de 4 a 8 dígitos');
  return bcrypt.hash(String(pin), 12);
}

// Un PIN viejo es sha256 hex: si coincide, `rehash` trae el bcrypt para guardarlo en su lugar.
export async function verifyPin(pin, stored) {
  if (!stored || !PIN_RE.test(String(pin ?? ''))) return { ok: false, rehash: null };
  if (SHA256_HEX.test(stored)) {
    const ok = createHash('sha256').update(String(pin)).digest('hex') === stored.toLowerCase();
    return { ok, rehash: ok ? await hashPin(pin) : null };
  }
  return { ok: await bcrypt.compare(String(pin), stored), rehash: null };
}
