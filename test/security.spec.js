import { describe, it, expect } from 'vitest';
import { requireJwtSecret, isAccessPayload, PASSWORD_MIN } from '../backend/src/services/security.js';

describe('seguridad', () => {
  it('exige JWT_SECRET real', () => {
    expect(() => requireJwtSecret({})).toThrow('JWT_SECRET falta o es el valor de ejemplo');
    expect(() => requireJwtSecret({ JWT_SECRET: 'default-secret-change-in-production' })).toThrow();
    expect(requireJwtSecret({ JWT_SECRET: 'x'.repeat(40) })).toBe('x'.repeat(40));
  });
  it('solo el token de acceso sirve para autenticar', () => {
    expect(isAccessPayload({ userId: 'u' })).toBe(true);
    expect(isAccessPayload({ userId: 'u', type: 'refresh' })).toBe(false);
    expect(isAccessPayload({ type: 'approval' })).toBe(false);
  });
  it('contraseña mínima 8', () => expect(PASSWORD_MIN).toBe(8));
});
