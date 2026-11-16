import path from 'path';
import { safeUserPath, isImagePath } from '../safePath.js';

const base = 'C:\\Users\\a\\AppData\\Zenda';
const w = (rel) => safeUserPath(base, rel, path.win32);

describe('safeUserPath', () => {
  it('acepta rutas dentro de la carpeta', () => {
    expect(w('img\\x.png')).toBe(base + '\\img\\x.png');
    expect(w('img/x.png')).toBe(base + '\\img\\x.png');
  });
  it('rechaza rutas que salen de la carpeta', () => {
    for (const rel of ['..\\..\\x', 'C:\\Windows\\x.exe', '\\\\server\\share\\x', 'a/../../b', '', '..', '.', null, 5]) {
      expect(w(rel)).toBeNull();
    }
  });
  it('rechaza una carpeta hermana con el mismo prefijo', () => {
    expect(w('..\\Zenda2\\x.png')).toBeNull();
  });
  it('en posix también funciona', () => {
    expect(safeUserPath('/data/z', 'img/x.png', path.posix)).toBe('/data/z/img/x.png');
    expect(safeUserPath('/data/z', '../x', path.posix)).toBeNull();
  });
});

describe('isImagePath', () => {
  it('solo imágenes', () => {
    expect(isImagePath('x.PNG')).toBe(true);
    expect(isImagePath('a/b.jpeg')).toBe(true);
    expect(isImagePath('x.exe')).toBe(false);
  });
});
