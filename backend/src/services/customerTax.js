import { TAXPAYER_TYPES } from './tax.js';
import { httpError } from './ncfService.js';

// Valores del selector viejo "type" del formulario de clientes.
const LEGACY_TYPES = { Persona: 'consumidor_final', Empresa: 'empresa', 'Zona Franca': 'zona_franca', Gubernamental: 'gubernamental', ONG: 'ong' };

export function customerTaxFields(body = {}) {
  const taxpayerType = body.taxpayerType || LEGACY_TYPES[body.type] || 'consumidor_final';
  const def = TAXPAYER_TYPES.find((t) => t.value === taxpayerType);
  if (!def) throw httpError(400, 'Tipo de contribuyente no válido');
  if (!def.exemptible) return { taxpayerType, exemptionNumber: null, exemptionExpiresAt: null };

  const exemptionNumber = String(body.exemptionNumber ?? '').trim() || null;
  const raw = String(body.exemptionExpiresAt ?? '').trim().slice(0, 10);
  let exemptionExpiresAt = null;
  if (raw) {
    exemptionExpiresAt = new Date(`${raw}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(exemptionExpiresAt.getTime())) {
      throw httpError(400, 'La fecha de vencimiento del carnet no es válida');
    }
  }
  return { taxpayerType, exemptionNumber, exemptionExpiresAt };
}
