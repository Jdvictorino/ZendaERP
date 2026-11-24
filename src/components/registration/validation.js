import { isPasswordStrong, passwordCriteria } from '../../utils/password.js';

const digits = (v = '') => String(v).replace(/\D/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENDERS = { M: 'Masculino', F: 'Femenino', otro: 'Prefiero no decir' };

export const BUSINESS_TYPES = [
  { group: 'Modo Tienda: venta en mostrador', options: [
    ['restaurante', 'Restaurante / Comida rápida'], ['food_truck', 'Food truck'], ['cafeteria', 'Cafetería / Repostería'],
    ['tienda_regalos', 'Tienda de regalos / artículos personalizados'], ['libreria', 'Librería'], ['floristeria', 'Floristería'],
  ] },
  { group: 'Modo Distribuidor: pedidos, crédito y entregas', options: [
    ['distribuidora', 'Distribuidora / Mayorista'], ['ferreteria', 'Ferretería'], ['farmacia', 'Farmacia'],
    ['salon', 'Salón de belleza / Estética'], ['supermercado', 'Supermercado / Minimarket'],
    ['tecnologia', 'Tecnología / Electrónica'], ['otro', 'Otra actividad'],
  ] },
];
export const businessTypeLabel = (value) =>
  BUSINESS_TYPES.flatMap(g => g.options).find(([v]) => v === value)?.[1] || value;

const phoneError = (v) => (v && digits(v).length !== 10 ? 'Escribe 10 dígitos, por ejemplo 809-555-0000.' : null);
const emailError = (v) => (v && !EMAIL.test(v.trim()) ? 'Revisa el correo; debe verse como nombre@empresa.com.' : null);

/** Errores del paso 1, por campo. Vacío = válido. */
export function validateAdmin(f) {
  const e = {};
  if (!f.firstName?.trim()) e.firstName = 'Escribe tus nombres.';
  if (!f.lastName?.trim()) e.lastName = 'Escribe tus apellidos.';
  // Solo se valida la cédula si es numérica; un pasaporte lleva letras
  if (f.idNumber && /^[\d\s-]+$/.test(f.idNumber) && digits(f.idNumber).length !== 11) e.idNumber = 'La cédula tiene 11 dígitos.';
  const phone = phoneError(f.phone); if (phone) e.phone = phone;
  const cell = phoneError(f.cellphone); if (cell) e.cellphone = cell;
  if (!f.email?.trim()) e.email = 'Escribe el correo con el que vas a entrar.';
  else { const em = emailError(f.email); if (em) e.email = em; }
  if (!f.password) e.password = 'Crea una contraseña.';
  else if (f.password.length < passwordCriteria.minLength || !isPasswordStrong(f.password, 3)) {
    e.password = 'Usa al menos 8 caracteres y combina mayúsculas, minúsculas, números o símbolos.';
  }
  if (!f.confirmPassword) e.confirmPassword = 'Repite la contraseña.';
  else if (f.password !== f.confirmPassword) e.confirmPassword = 'Las contraseñas no coinciden.';
  return e;
}

/** Errores del paso 2, por campo. Vacío = válido. */
export function validateCompany(f) {
  const e = {};
  if (!f.name?.trim()) e.name = 'Escribe el nombre de tu negocio.';
  const rnc = digits(f.rnc);
  if (f.rnc && rnc.length !== 9 && rnc.length !== 11) e.rnc = 'El RNC tiene 9 dígitos (11 si usas tu cédula).';
  const phone = phoneError(f.phone); if (phone) e.phone = phone;
  const em = emailError(f.email); if (em) e.email = em;
  return e;
}
