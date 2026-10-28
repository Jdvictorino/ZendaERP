import { act } from 'react';
import { confirmDialog } from '../src/utils/confirmDialog.jsx';

const findButton = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);

describe('confirmDialog', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('resuelve true al confirmar y desmonta el modal', async () => {
    let p;
    await act(async () => { p = confirmDialog('¿Eliminar?', { confirmText: 'Eliminar' }); });
    expect(document.body.textContent).toContain('¿Eliminar?');
    await act(async () => { findButton('Eliminar').click(); });
    await expect(p).resolves.toBe(true);
    expect(findButton('Eliminar')).toBeUndefined();
  });

  it('resuelve false al cancelar', async () => {
    let p;
    await act(async () => { p = confirmDialog('¿Seguro?'); });
    await act(async () => { findButton('Cancelar').click(); });
    await expect(p).resolves.toBe(false);
  });
});
