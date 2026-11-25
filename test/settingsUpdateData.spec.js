import { describe, it, expect } from 'vitest';
import { companyUpdateData } from '../backend/src/routes/settings.js';

describe('companyUpdateData', () => {
  it('un guardado parcial no toca las columnas de la empresa', () => {
    expect(companyUpdateData({ withholdings: [] })).toEqual({});
  });
  it('el cuerpo completo escribe todo como antes', () => {
    const d = companyUpdateData({ companyName: 'ACME', rnc: '', phone: '809', address: { street: 'C1', city: 'SD' }, currency: '', email: 'a@b.c', logoUrl: 'x.png' });
    expect(d).toEqual({ name: 'ACME', rnc: null, phone: '809', address: 'C1, SD', currency: 'DOP', email: 'a@b.c', logoUrl: 'x.png' });
  });
});
