// Utilidad de impresión: usa IPC de Electron si está disponible, o window.print como fallback

export const printHTML = async (htmlContent, options = {}) => {
  try {
    if (window?.electronAPI?.printHTML) {
      return await window.electronAPI.printHTML(htmlContent, options);
    }
  } catch (e) {
    console.warn('IPC printHTML falló, usando fallback', e);
  }
  return printInSandbox(htmlContent);
};

/**
 * Imprime HTML en un iframe aislado (sandbox sin allow-scripts): las plantillas llevan datos que escriben
 * los usuarios (nombres, direcciones, notas) y así ningún HTML incrustado puede ejecutar código en la app.
 */
export const printInSandbox = (htmlContent) => new Promise((resolve) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';
  frame.onload = () => setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
    resolve(true);
  }, 250);
  frame.srcdoc = htmlContent;
  document.body.appendChild(frame);
});

export const openCashDrawer = async () => {
  try {
    if (window?.electronAPI?.openCashDrawer) {
      const res = await window.electronAPI.openCashDrawer();
      return !!res?.success;
    }
  } catch (e) {
    console.warn('IPC openCashDrawer falló', e);
  }
  return false; // no-op en fallback
};

// Opcional: imprimir líneas en ESC/POS si está disponible
export const printEscPosLines = async (lines = [], printerName = '') => {
  try {
    if (window?.electronAPI?.escposPrint) {
      // Back-compat: wrap lines as text blocks
      const blocks = (lines || []).map(l => ({ type: 'text', text: String(l || ''), align: 'left' }));
      const res = await window.electronAPI.escposPrint(blocks, printerName);
      return !!res?.success;
    }
  } catch (e) {
    console.warn('IPC escposPrint falló', e);
  }
  return false;
};

export const printEscPosReceipt = async (htmlString = '', printerName = '') => {
  try {
    if (window?.electronAPI?.printHTML) {
      const options = { silent: true, deviceName: printerName || undefined };
      const res = await window.electronAPI.printHTML(htmlString, options);
      return !!res?.success;
    }
  } catch (e) {
    console.warn('IPC printHTML (thermal fallback) falló', e);
  }
  return false;
};
