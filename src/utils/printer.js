// Utilidad de impresión: usa IPC de Electron si está disponible, o window.print como fallback

export const printHTML = async (htmlContent, options = {}) => {
  try {
    if (window?.electronAPI?.printHTML) {
      return await window.electronAPI.printHTML(htmlContent, options);
    }
  } catch (e) {
    console.warn('IPC printHTML falló, usando fallback', e);
  }
  // Fallback en navegador: abrir nueva ventana y llamar a print
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  setTimeout(() => printWindow.close(), 500);
  return true;
};

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
