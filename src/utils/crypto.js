// Simple crypto helpers for hashing PINs (SHA-256)

export async function sha256(text) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (non-crypto) minimal implementation if subtle is unavailable
  // NOTE: For Electron renderer we expect subtle to exist; this is a last resort and not cryptographically secure.
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return String(hash);
}

export async function hashPin(pin) {
  // Normalize pin to string and trim
  const p = String(pin || '').trim();
  if (!p) return '';
  return sha256(p);
}
