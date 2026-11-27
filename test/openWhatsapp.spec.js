import { describe, it, expect, vi, afterEach } from 'vitest';
import { isWhatsappUrl, openWhatsapp } from '../src/utils/openWhatsapp.js';

const OK = 'https://wa.me/18095551234?text=Hola';

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

describe('isWhatsappUrl', () => {
  it('acepta solo https://wa.me/', () => {
    expect(isWhatsappUrl('https://wa.me/1809?text=a')).toBe(true);
  });
  it.each(['http://wa.me/1', 'https://wa.me.evil.com/1', 'https://evil.com/https://wa.me/', 'file:///c:/x', 'javascript:alert(1)', '', null, undefined, 5])(
    'rechaza %s', (u) => expect(isWhatsappUrl(u)).toBe(false));
});

describe('openWhatsapp', () => {
  it('usa el puente de Electron si existe', () => {
    const bridge = vi.fn().mockResolvedValue(true);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    window.electronAPI = { openWhatsapp: bridge };
    expect(openWhatsapp(OK)).toBe(true);
    expect(bridge).toHaveBeenCalledWith(OK);
    expect(open).not.toHaveBeenCalled();
  });
  it('sin puente usa window.open', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(openWhatsapp(OK)).toBe(true);
    expect(open).toHaveBeenCalledWith(OK, '_blank', 'noopener');
  });
  it('con url inválida no abre nada', () => {
    const bridge = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    window.electronAPI = { openWhatsapp: bridge };
    expect(openWhatsapp('https://evil.com/')).toBe(false);
    expect(bridge).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
