import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { waUrl } from '../src/utils/collectionReminders.js';
import { isWhatsappUrl, openWhatsapp, prepareWhatsappWindow } from '../src/utils/openWhatsapp.js';

const OK = 'https://wa.me/18095551234?text=Hola';

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

describe('isWhatsappUrl', () => {
  it('acepta solo https://wa.me/', () => {
    expect(isWhatsappUrl('https://wa.me/1809?text=a')).toBe(true);
  });
  it('acepta el enlace armado por la app con acentos, saltos y &', () => {
    expect(isWhatsappUrl(waUrl('18095551234', 'Hola\nJosé & Cía'))).toBe(true);
  });
  it.each([
    'http://wa.me/1', 'https://wa.me.evil.com/1', 'https://evil.com/https://wa.me/', 'file:///c:/x',
    'javascript:alert(1)', 'https://wa.me@evil.com/1', 'https://wa.me:8080/1', 'HTTPS://WA.ME/1',
    'https://wa.me/1\nx', 'https://wa.me/1\r\nx', 'https://wa.me/1\tx', 'https://wa.me/1 x',
    '', null, undefined, 5,
  ])('rechaza %j', (u) => expect(isWhatsappUrl(u)).toBe(false));
});

describe('isWhatsappUrl en electron.js', () => {
  it('es igual a la de src/utils/openWhatsapp.js', () => {
    const body = (f) => {
      const s = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      const i = s.indexOf('function isWhatsappUrl(url) {');
      expect(i).toBeGreaterThan(-1);
      return s.slice(i, s.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i)).replace(/\s+/g, ' ');
    };
    expect(body('electron.js')).toBe(body('src/utils/openWhatsapp.js'));
  });
});

describe('openWhatsapp', () => {
  it('usa el puente de Electron si existe y devuelve su resultado', async () => {
    const bridge = vi.fn().mockResolvedValue(true);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    window.electronAPI = { openWhatsapp: bridge };
    expect(await openWhatsapp(OK)).toBe(true);
    expect(bridge).toHaveBeenCalledWith(OK);
    expect(open).not.toHaveBeenCalled();
    bridge.mockResolvedValue(false);
    expect(await openWhatsapp(OK)).toBe(false);
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

describe('prepareWhatsappWindow', () => {
  const win = () => ({ location: {}, close: vi.fn() });
  it('web: abre la ventana en el clic y go asigna la URL', () => {
    const w = win();
    const open = vi.spyOn(window, 'open').mockImplementation(() => w);
    const p = prepareWhatsappWindow();
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(p.blocked).toBe(false);
    expect(w.opener).toBe(null);
    expect(p.go(OK)).toBe(true);
    expect(w.location.href).toBe(OK);
  });
  it('web: URL invalida cierra la ventana', () => {
    const w = win();
    vi.spyOn(window, 'open').mockImplementation(() => w);
    expect(prepareWhatsappWindow().go('https://evil.com/')).toBe(false);
    expect(w.close).toHaveBeenCalled();
  });
  it('web: cancel cierra la ventana', () => {
    const w = win();
    vi.spyOn(window, 'open').mockImplementation(() => w);
    prepareWhatsappWindow().cancel();
    expect(w.close).toHaveBeenCalled();
  });
  it('web: window.open null -> blocked', () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(prepareWhatsappWindow().blocked).toBe(true);
  });
  it('Electron: go espera el puente y no abre ventana', async () => {
    const bridge = vi.fn().mockResolvedValue(true);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    window.electronAPI = { openWhatsapp: bridge };
    const p = prepareWhatsappWindow();
    expect(p.blocked).toBe(false);
    expect(await p.go(OK)).toBe(true);
    expect(bridge).toHaveBeenCalledWith(OK);
    expect(open).not.toHaveBeenCalled();
    bridge.mockResolvedValue(false);
    expect(await p.go(OK)).toBe(false);
    p.cancel();
  });
});
