import { installModalA11y } from '../src/utils/modalA11y.js';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('installModalA11y', () => {
  let uninstall;
  beforeEach(() => { document.body.innerHTML = '<button id="opener">Abrir</button>'; uninstall = installModalA11y(document); });
  afterEach(() => uninstall());

  const openModal = async (onClose) => {
    document.getElementById('opener').focus();
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 modal-backdrop';
    overlay.innerHTML = '<div class="modal-panel"><button aria-label="Cerrar">x</button><input id="a"/><button id="b">Ok</button></div>';
    overlay.querySelector('[aria-label="Cerrar"]').addEventListener('click', () => { overlay.remove(); onClose?.(); });
    document.body.appendChild(overlay);
    await tick();
    return overlay.querySelector('.modal-panel');
  };

  it('marca el panel como diálogo y mueve el foco dentro', async () => {
    const panel = await openModal();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('ESC pulsa el botón Cerrar y devuelve el foco al que abrió', async () => {
    let closed = false;
    await openModal(() => { closed = true; });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(closed).toBe(true);
    expect(document.activeElement.id).toBe('opener');
  });

  it('Tab desde el último elemento vuelve al primero', async () => {
    const panel = await openModal();
    document.getElementById('b').focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(panel.querySelector('button'));
  });

  it('ignora paneles que no están en un overlay fijo', async () => {
    const page = document.createElement('div');
    page.innerHTML = '<div class="modal-panel"><button>x</button></div>';
    document.body.appendChild(page);
    await tick();
    expect(page.firstChild.hasAttribute('role')).toBe(false);
  });
});
