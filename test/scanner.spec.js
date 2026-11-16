import { describe, it, expect } from 'vitest';
import { isValidSessionId, MAX_CONNECTIONS } from '../backend/src/routes/scanner.js';
import { createWindowCounter } from '../backend/src/services/mailGuard.js';

describe('escáner', () => {
  it('acepta UUID y rechaza lo demás', () => {
    expect(isValidSessionId('3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b')).toBe(true);
    expect(isValidSessionId('3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B')).toBe(true);
    for (const bad of ['abc', '', '../x', undefined, 5]) expect(isValidSessionId(bad)).toBe(false);
  });
  it('tope de conexiones', () => expect(MAX_CONNECTIONS).toBe(500));
  it('el contador libera claves inactivas', () => {
    let t = 0;
    const c = createWindowCounter(1, 10, () => t);
    for (let i = 0; i < 1100; i++) c.hit('k' + i);
    t = 100;
    expect(c.hit('nuevo')).toBe(true);
    expect(c.hit('k0')).toBe(true);
  });
});
