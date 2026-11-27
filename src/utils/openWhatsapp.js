// Misma regla que isWhatsappUrl en electron.js (el proceso principal no confía en el renderer): mantener iguales.
export function isWhatsappUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://wa.me/')) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'wa.me';
  } catch { return false; }
}

// En Electron siempre por el puente (window.open abriría una ventana de Electron); en la web, pestaña nueva.
export function openWhatsapp(url) {
  if (!isWhatsappUrl(url)) return false;
  if (typeof window !== 'undefined' && window.electronAPI?.openWhatsapp) {
    window.electronAPI.openWhatsapp(url);
    return true;
  }
  window.open(url, '_blank', 'noopener');
  return true;
}
