// @vitest-environment node
import { generateSecret, totpAt, verifyTotp, otpauthUri } from '../backend/src/services/totp.js';

const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('vectores RFC 6238 SHA-1', () => {
    for (const [t, code] of [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']]) {
      expect(totpAt(S, Math.floor(t / 30))).toBe(code);
    }
  });
  it('acepta ±1 paso y rechaza ±2', () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(S, totpAt(S, step), { now })).toBe(step);
    expect(verifyTotp(S, totpAt(S, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(S, totpAt(S, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(S, totpAt(S, step - 2), { now })).toBeNull();
    expect(verifyTotp(S, totpAt(S, step + 2), { now })).toBeNull();
  });
  it('rechaza un paso <= lastStep', () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(S, totpAt(S, step), { now, lastStep: step })).toBeNull();
    expect(verifyTotp(S, totpAt(S, step + 1), { now, lastStep: step })).toBe(step + 1);
  });
  it('rechaza formatos inválidos', () => {
    for (const c of ['12345', 'abcdef', '', undefined]) expect(verifyTotp(S, c, { now: 0 })).toBeNull();
  });
  it('generateSecret da base32 de 32 caracteres y otpauthUri es exacto', () => {
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri('ABC', 'a@b.com')).toBe('otpauth://totp/Zenda%20ERP:a@b.com?secret=ABC&issuer=Zenda%20ERP');
  });
});
