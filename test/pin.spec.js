import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { hashPin, verifyPin } from '../backend/src/services/pin.js';

const sha = (p) => createHash('sha256').update(p).digest('hex');

describe('PIN', () => {
  it('rechaza PIN que no son de 4 a 8 dígitos', async () => {
    await expect(hashPin('12a4')).rejects.toThrow('El PIN debe tener de 4 a 8 dígitos');
    await expect(hashPin('123')).rejects.toThrow('El PIN debe tener de 4 a 8 dígitos');
  });
  it('verifica un PIN con bcrypt sin pedir rehash', async () => {
    expect(await verifyPin('1234', await hashPin('1234'))).toEqual({ ok: true, rehash: null });
  });
  it('acepta un sha256 viejo y devuelve un bcrypt nuevo', async () => {
    const r = await verifyPin('1234', sha('1234'));
    expect(r.ok).toBe(true);
    expect(r.rehash.startsWith('$2')).toBe(true);
  });
  it('rechaza un PIN incorrecto o sin PIN guardado', async () => {
    expect(await verifyPin('9999', sha('1234'))).toEqual({ ok: false, rehash: null });
    expect((await verifyPin('1234', null)).ok).toBe(false);
  });
});
