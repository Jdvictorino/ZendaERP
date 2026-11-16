import { publicCompany, publicSettings, mergeSmtp } from '../backend/src/services/security.js';

describe('secretos de la empresa', () => {
  it('quita pass y pinHash y marca hasPassword', () => {
    const s = publicSettings({ smtp: { host: 'h', pass: 'x' }, adminProfile: { pinHash: 'h', name: 'a' }, otro: 1 });
    expect(s.smtp).toEqual({ host: 'h', hasPassword: true });
    expect(s.adminProfile).toEqual({ name: 'a' });
    expect(s.otro).toBe(1);
    expect(publicSettings({ smtp: { host: 'h', pass: '' } }).smtp.hasPassword).toBe(false);
  });
  it('publicCompany no muta y tolera null', () => {
    const c = { id: 1, settings: { smtp: { pass: 'x' } } };
    expect(publicCompany(c).settings.smtp.pass).toBeUndefined();
    expect(c.settings.smtp.pass).toBe('x');
    expect(publicCompany(null)).toBe(null);
  });
  it('mergeSmtp conserva la contraseña si no llega o llega vacía', () => {
    expect(mergeSmtp({ pass: 'old' }, { host: 'n' }).pass).toBe('old');
    expect(mergeSmtp({ pass: 'old' }, { host: 'n', pass: '' }).pass).toBe('old');
    expect(mergeSmtp({ pass: 'old' }, { pass: 'new', hasPassword: true })).toEqual({ pass: 'new' });
  });
});
