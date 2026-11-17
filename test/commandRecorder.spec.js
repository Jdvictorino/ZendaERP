import { describe, it, expect } from 'vitest';
import { createCommandRecorder } from '../backend/src/services/commandRecorder.js';

describe('commandRecorder', () => {
  it('registra una línea al Enter', () => {
    expect(createCommandRecorder().input('ls -l\r')).toEqual(['ls -l']);
  });
  it('aplica retroceso', () => {
    expect(createCommandRecorder().input('lss\x7f -a\r')).toEqual(['ls -a']);
  });
  it('omite la contraseña tras el aviso y luego vuelve a normal', () => {
    const r = createCommandRecorder();
    r.output('[sudo] password for zenda:');
    expect(r.input('secreto\r')).toEqual(['[contraseña omitida]']);
    expect(r.input('whoami\r')).toEqual(['whoami']);
  });
  it('ignora secuencias de escape', () => {
    expect(createCommandRecorder().input('ls\x1b[A -a\r')).toEqual(['ls -a']);
  });
});
