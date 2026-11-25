export const SUPPLIER_TYPES = ['empresa', 'persona_fisica', 'informal', 'exterior'];

function rncValid(d) {
  if (!/^\d{9}$/.test(d)) return false;
  const w = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  let c = 11 - (sum % 11);
  if (c === 10) c = 2;
  if (c === 11) c = 1;
  return c === Number(d[8]);
}

// Normaliza la identificación según el tipo de proveedor. Copia en src/utils/supplierId.js (la app valida igual).
export function normalizeSupplierId(type, value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/[\s-]/g, '');
  const fail = (error) => ({ value: null, error });
  if (type === 'exterior') {
    const v = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!v) return { value: null, error: null };
    return /^[A-Z0-9]{1,20}$/.test(v) ? { value: v, error: null } : fail('La identificación del exterior solo admite letras y números (máx. 20).');
  }
  if (!SUPPLIER_TYPES.includes(type)) return fail('Tipo de proveedor no válido.');
  const numeric = /^\d+$/.test(digits);
  if (type === 'empresa') {
    if (!digits) return fail('El RNC es obligatorio para una empresa.');
    if (!numeric || digits.length !== 9) return fail('El RNC debe tener 9 dígitos.');
    return rncValid(digits) ? { value: digits, error: null } : fail('El RNC no es válido (dígito verificador).');
  }
  if (type === 'persona_fisica') {
    const ok = numeric && (digits.length === 11 || rncValid(digits));
    return ok ? { value: digits, error: null } : fail('Escribe una cédula (11 dígitos) o un RNC (9) válidos.');
  }
  return numeric && digits.length === 11 ? { value: digits, error: null } : fail('La cédula del vendedor informal es obligatoria (11 dígitos).');
}
