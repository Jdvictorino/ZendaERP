import { describe, it, expect } from 'vitest';
import { createWindowCounter, isCompanyContact } from '../backend/src/services/mailGuard.js';

describe('createWindowCounter', () => {
  it('limita por clave y se libera al pasar la ventana', () => {
    let t = 0;
    const c = createWindowCounter(50, 3600000, () => t);
    for (let i = 0; i < 50; i++) expect(c.hit('c1')).toBe(true);
    expect(c.hit('c1')).toBe(false);
    expect(c.hit('c2')).toBe(true);
    t += 3600000;
    expect(c.hit('c1')).toBe(true);
  });
});

describe('isCompanyContact', () => {
  const tx = {
    customer: { findFirst: async ({ where }) => (where.email.equals === 'a@x.com' ? { id: 1 } : null) },
    supplier: { findFirst: async () => null },
    user: { findFirst: async () => null }
  };
  it('acepta contactos y rechaza desconocidos', async () => {
    expect(await isCompanyContact(tx, 'co', ' a@x.com ')).toBe(true);
    expect(await isCompanyContact(tx, 'co', 'z@x.com')).toBe(false);
  });
});
