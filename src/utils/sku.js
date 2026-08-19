// Utilidades para SKU automático

const sanitize = (s) => (s || '')
  .toUpperCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
  .replace(/[^A-Z0-9]+/g, '')
  .trim();

export const generateUniqueSKU = (name, existingSkus) => {
  const used = existingSkus || new Set();
  const baseLetters = sanitize(name).slice(0, 4) || 'PRD';
  // Busca el mayor sufijo numérico existente con este prefijo
  let max = 0;
  used.forEach((sku) => {
    const m = new RegExp(`^${baseLetters}-?(\\d{1,5})$`).exec((sku || '').toUpperCase());
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  // Próximo número
  const next = (max + 1).toString().padStart(4, '0');
  let candidate = `${baseLetters}-${next}`;
  // Evitar colisiones exactas
  let counter = 1;
  while (used.has(candidate)) {
    const k = (max + 1 + counter).toString().padStart(4, '0');
    candidate = `${baseLetters}-${k}`;
    counter++;
  }
  return candidate;
};
