// Utilidades para EAN-13

export const computeEAN13Checksum = (twelveDigits) => {
  const digits = String(twelveDigits).replace(/\D/g, '').padStart(12, '0').slice(-12).split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : (10 - mod);
};

export const isValidEAN13 = (code) => {
  if (!code) return false;
  const s = String(code).trim();
  if (!/^\d{13}$/.test(s)) return false;
  const check = computeEAN13Checksum(s.slice(0, 12));
  return check === Number(s[12]);
};

// Genera 12 dígitos semi-aleatorios a partir de timestamp y random, luego aplica checksum
export const generateEAN13 = () => {
  const now = Date.now().toString();
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  // Toma los últimos 12 dígitos combinando timestamp+rand
  const base12 = (now + rand).slice(-12);
  const check = computeEAN13Checksum(base12);
  return base12 + String(check);
};

export const generateUniqueEAN13 = (existingSet) => {
  const used = existingSet || new Set();
  for (let i = 0; i < 10000; i++) {
    const ean = generateEAN13();
    if (!used.has(ean)) return ean;
  }
  // Fallback improbable
  return generateEAN13();
};
