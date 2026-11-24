import { TAXPAYER_TYPES } from './tax.js';
import { httpError } from './ncfService.js';

// Tipos que siempre facturan con RNC; consumidor final y persona física pueden ir sin identificación
export const ID_REQUIRED_TYPES = ['empresa', 'gubernamental', 'zona_franca', 'regimen_especial', 'diplomatico', 'ong'];

// Cédula/RNC: solo dígitos. Pasaporte (tiene letras): mayúsculas sin espacios ni guiones. Vacío: null.
export function normalizeCustomerId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/[a-z]/i.test(s)) return s.replace(/[\s-]/g, '').toUpperCase();
  return s.replace(/\D/g, '') || null;
}

export function customerIdError(taxpayerType, rnc) {
  return ID_REQUIRED_TYPES.includes(taxpayerType) && !rnc
    ? 'La identificación (RNC) es obligatoria para este tipo de cliente.'
    : null;
}

// Valores del selector viejo "type" del formulario de clientes.
const LEGACY_TYPES = { Persona: 'consumidor_final', Empresa: 'empresa', 'Zona Franca': 'zona_franca', Gubernamental: 'gubernamental', ONG: 'ong' };

// existing: cliente guardado (PUT). Las llaves ausentes en body conservan lo guardado.
export function customerTaxFields(body = {}, existing = null) {
  // El type viejo solo se mapea al crear: las apps viejas mandan 'Persona' en cada PUT y borrarían tipo y carnet
  const taxpayerType = body.taxpayerType || (!existing && LEGACY_TYPES[body.type]) || existing?.taxpayerType || 'consumidor_final';
  const def = TAXPAYER_TYPES.find((t) => t.value === taxpayerType);
  if (!def) throw httpError(400, 'Tipo de contribuyente no válido');
  if (!def.exemptible) return { taxpayerType, exemptionNumber: null, exemptionExpiresAt: null };

  const num = 'exemptionNumber' in body ? body.exemptionNumber : existing?.exemptionNumber;
  const exemptionNumber = String(num ?? '').trim() || null;
  const exp = 'exemptionExpiresAt' in body ? body.exemptionExpiresAt : existing?.exemptionExpiresAt;
  const raw = String((exp instanceof Date ? exp.toISOString() : exp) ?? '').trim().slice(0, 10);
  let exemptionExpiresAt = null;
  if (raw) {
    exemptionExpiresAt = new Date(`${raw}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(exemptionExpiresAt.getTime())) {
      throw httpError(400, 'La fecha de vencimiento del carnet no es válida');
    }
  }
  return { taxpayerType, exemptionNumber, exemptionExpiresAt };
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// fields: salida de customerTaxFields. Registrar o cambiar el carnet (no quitarlo) es de gerencia.
export function exemptionChangeError(fields, existing, user) {
  if (user?.isAdmin || ['admin', 'manager'].includes(user?.role)) return null;
  const changed = (fields.exemptionNumber && fields.exemptionNumber !== existing?.exemptionNumber)
    || (fields.exemptionExpiresAt && day(fields.exemptionExpiresAt) !== day(existing?.exemptionExpiresAt));
  return changed ? 'Solo un gerente o administrador puede registrar el carnet de exención.' : null;
}
