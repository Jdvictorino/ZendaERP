/**
 * Utilidades de auditoría - Migrado a PostgreSQL API
 * Las acciones de auditoría ahora se envían al backend
 */
import api from '../api/client.js';

/**
 * Registrar una acción en el log de auditoría
 */
export async function logAction(action, details = {}, options = {}) {
  try {
    // Enviar al backend para logging
    await api.post('/audit/log', {
      action,
      details,
      ...options,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    // Si falla el logging de auditoría, solo registrar en consola
    // No queremos que falle la operación principal
    console.warn('Audit log failed:', action, e.message);
  }
}

/**
 * Obtener logs de auditoría
 */
export async function getAuditLogs(params = {}) {
  try {
    return await api.get('/audit/logs', params);
  } catch (e) {
    console.warn('Failed to fetch audit logs:', e.message);
    return [];
  }
}

export default {
  logAction,
  getAuditLogs
};
