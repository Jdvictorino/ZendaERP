/**
 * Accesibilidad para los modales hechos a mano (los que usan .modal-panel dentro de un overlay fijo):
 * role="dialog", foco inicial dentro, Tab atrapado, ESC = su botón "Cerrar", y foco devuelto al cerrar.
 * ui/Modal ya hace esto por su cuenta y no usa .modal-panel, así que no se pisan.
 * shortcut: se basa en clases y aria-label del DOM; si un modal migra a ui/Modal deja de necesitarlo.
 */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE = '[aria-label="Cerrar"], [aria-label="Cerrar modal"]';

const openPanels = (doc) =>
  [...doc.querySelectorAll('.modal-panel')].filter(p => p.closest('.fixed'));

export function installModalA11y(doc = document) {
  const previousFocus = new Map();

  const onOpen = (panel) => {
    if (previousFocus.has(panel)) return;
    previousFocus.set(panel, doc.activeElement);
    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (!panel.contains(doc.activeElement)) {
      const first = panel.querySelector('[autofocus]') || panel.querySelector(FOCUSABLE);
      (first || panel).focus?.();
    }
  };

  const sync = () => {
    const open = openPanels(doc);
    open.forEach(onOpen);
    for (const [panel, prev] of previousFocus) {
      if (!panel.isConnected) {
        previousFocus.delete(panel);
        if (prev && prev.isConnected) prev.focus?.();
      }
    }
  };

  const onKeyDown = (e) => {
    const panels = openPanels(doc);
    const panel = panels[panels.length - 1]; // el último montado es el de encima
    if (!panel) return;
    if (e.key === 'Escape') {
      const close = panel.querySelector(CLOSE)
        || [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cerrar');
      if (close) { e.preventDefault(); close.click(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!panel.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const observer = new MutationObserver(sync);
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener('keydown', onKeyDown);
  sync();
  return () => { observer.disconnect(); doc.removeEventListener('keydown', onKeyDown); };
}
