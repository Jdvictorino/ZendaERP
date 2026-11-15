/**
 * ncfService.js
 * Números de comprobante fiscal: secuencias en papel (B01…B17, Configuración > Secuencias NCF)
 * y la decisión entre papel o electrónico (e-CF) para lo que emite la empresa.
 */
import { generateENCF } from './ecfService.js';

export const httpError = (status, message) => Object.assign(new Error(message), { status });

// Las secuencias autorizadas vencen el 31 de diciembre del año siguiente a su autorización (Norma General 06-2018),
// salvo consumo (B02) y notas de crédito (B04), que no vencen.
const NCF_SIN_VENCIMIENTO = ['B02', 'B04'];
const todayRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date()); // AAAA-MM-DD

// Siguiente NCF del tipo `code` dentro del rango de Configuración > Secuencias NCF.
// B01/B02 cuentan en sus columnas; los demás en settings.ncfSequences. El bloqueo por empresa evita números repetidos.
// Devuelve { number, expiresAt } (expiresAt: AAAA-MM-DD o null).
export async function takeNcf(tx, companyId, code) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ncf:${companyId}`}))::text`;
  const company = await tx.company.findUnique({ where: { id: companyId } });
  const sequences = Array.isArray(company.settings?.ncfSequences) ? company.settings.ncfSequences : [];
  const index = sequences.findIndex((s) => s.code === code);
  const seq = sequences[index];
  const column = ['B01', 'B02'].includes(code) ? `ncf${code}SequenceNext` : null;
  const next = Number(column ? company[column] : seq?.next) || 1;
  const prefix = (column && company[`ncf${code}Prefix`]) || seq?.prefix;
  if (!prefix) throw httpError(400, `Falta configurar la secuencia de NCF ${code} en Configuración > Secuencias NCF.`);
  if (seq && !seq.active) throw httpError(400, `La secuencia de NCF ${code} está inactiva. Actívala en Configuración > Secuencias NCF.`);
  if (seq && next > Number(seq.end)) throw httpError(409, `Se agotó la secuencia autorizada de NCF ${code} (hasta ${seq.end}). Registra la nueva en Configuración > Secuencias NCF.`);
  const expiresAt = !NCF_SIN_VENCIMIENTO.includes(code) && seq?.expiresAt ? seq.expiresAt : null;
  if (expiresAt && todayRD() > expiresAt) {
    throw httpError(409, `La secuencia de NCF ${code} venció el ${expiresAt.split('-').reverse().join('-')}. Solicita una nueva en la Oficina Virtual de la DGII y regístrala en Configuración > Secuencias NCF.`);
  }
  if (column) await tx.company.update({ where: { id: companyId }, data: { [column]: next + 1 } });
  // Las demás viven en settings JSON: Configuración guarda bajo este mismo bloqueo (withSettingsLock), así no pisa el contador
  else await tx.$executeRaw`UPDATE companies SET settings = jsonb_set(settings, ${['ncfSequences', String(index), 'next']}::text[], to_jsonb(${next + 1}::int)) WHERE id = ${companyId}`;
  return { number: `${prefix}${String(next).padStart(8, '0')}`, expiresAt };
}

// ¿Papel o electrónico? Electrónico cuando la empresa ya emite e-CF y no tiene activa la secuencia en papel `paperCode`
export function issueChannel(company, paperCode) {
  const sequences = Array.isArray(company.settings?.ncfSequences) ? company.settings.ncfSequences : [];
  const paper = sequences.some((s) => s.code === paperCode && s.active);
  return company.ecfEnabled && !paper ? 'ecf' : 'paper';
}

// Reserva el e-NCF antes de registrar el documento: si no hay secuencia válida, no se registra nada
export async function reserveEncf(company, tipoEcf) {
  if (!company.ecfEnabled) throw httpError(400, `El ${tipoEcf} es un comprobante electrónico: activa la facturación electrónica en Gestión Fiscal.`);
  try {
    return await generateENCF(company.id, tipoEcf);
  } catch (error) {
    throw httpError(400, error.message);
  }
}
