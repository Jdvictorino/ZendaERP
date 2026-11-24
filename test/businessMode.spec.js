import { describe, it, expect } from 'vitest';
import { BUSINESS_TYPES } from '../src/components/registration/validation.js';

describe('tipos de negocio', () => {
  it('salones y barberías se ofrecen en el modo Tienda', () => {
    const tienda = BUSINESS_TYPES.find(g => g.group.startsWith('Modo Tienda')).options.map(([v]) => v);
    expect(tienda).toEqual(expect.arrayContaining(['salon', 'barberia']));
    const dist = BUSINESS_TYPES.find(g => g.group.startsWith('Modo Distribuidor')).options.map(([v]) => v);
    expect(dist).not.toContain('salon');
  });
});
