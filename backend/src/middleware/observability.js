/**
 * Observability Middleware — Zenda ERP Platform
 * 
 * Express middleware que intercepta toda petición HTTP y registra:
 * - Método, path, status code, duración
 * - CompanyId y UserId (del JWT si disponible)
 * - User Agent e IP
 * - Errores capturados
 * 
 * Se monta ANTES de todas las rutas en index.js.
 * Bajo overhead: usa process.hrtime.bigint() para timing preciso.
 */

import observability from '../services/observabilityService.js';

/**
 * Middleware de observabilidad - Captura automática de trazas HTTP
 */
export function observabilityMiddleware(req, res, next) {
  const startTime = process.hrtime.bigint();

  // Capturar datos originales del request
  const method = req.method;
  const path = req.originalUrl || req.url;
  const userAgent = req.headers['user-agent'] || null;
  const ip = req.ip || req.connection?.remoteAddress || null;

  // Interceptar el fin de la respuesta
  const originalEnd = res.end;
  let ended = false;

  res.end = function (...args) {
    if (ended) return originalEnd.apply(this, args);
    ended = true;

    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Math.round(Number(durationNs) / 1_000_000);

    // Extraer datos del request (disponibles después del middleware de auth)
    const companyId = req.companyId || null;
    const companyName = req.company?.name || null;
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || null;

    // Registrar la traza
    observability.recordTrace({
      method,
      path: sanitizePath(path),
      statusCode: res.statusCode,
      durationMs,
      companyId,
      companyName,
      userId,
      userEmail,
      userAgent,
      ip,
      error: res.statusCode >= 500 ? (res._observabilityError || null) : null,
      query: Object.keys(req.query || {}).length > 0 ? req.query : null,
    });

    // Log automático para errores del servidor
    if (res.statusCode >= 500) {
      observability.recordLog({
        level: 'error',
        message: `${method} ${sanitizePath(path)} → ${res.statusCode} (${durationMs}ms)`,
        companyId,
        companyName,
        userId,
        source: 'http',
        metadata: {
          statusCode: res.statusCode,
          durationMs,
          error: res._observabilityError || null,
        },
      });
    } else if (res.statusCode >= 400) {
      observability.recordLog({
        level: 'warn',
        message: `${method} ${sanitizePath(path)} → ${res.statusCode} (${durationMs}ms)`,
        companyId,
        companyName,
        userId,
        source: 'http',
        metadata: {
          statusCode: res.statusCode,
          durationMs,
        },
      });
    }

    // Log para requests lentas (> 2 segundos)
    if (durationMs > 2000) {
      observability.recordLog({
        level: 'warn',
        message: `Slow request: ${method} ${sanitizePath(path)} took ${durationMs}ms`,
        companyId,
        companyName,
        userId,
        source: 'performance',
        metadata: {
          durationMs,
          statusCode: res.statusCode,
        },
      });
    }

    return originalEnd.apply(this, args);
  };

  next();
}

/**
 * Middleware para capturar errores en el pipeline de observabilidad.
 * Se monta como error handler para registrar el error antes de que llegue
 * al handler global.
 */
export function observabilityErrorCapture(err, req, res, next) {
  // Almacenar el error para que el middleware de traza lo capture
  res._observabilityError = err.message || String(err);

  // Registrar el log de error con stack trace
  observability.recordLog({
    level: 'error',
    message: `Unhandled error: ${err.message || err}`,
    companyId: req.companyId || null,
    companyName: req.company?.name || null,
    userId: req.user?.id || null,
    source: 'error-handler',
    stack: err.stack || null,
    metadata: {
      name: err.name,
      code: err.code,
      path: req.originalUrl || req.url,
      method: req.method,
    },
  });

  next(err);
}

/**
 * Función auxiliar para registrar logs desde cualquier parte del backend.
 * Importar y usar: import { log } from '../middleware/observability.js';
 */
export function log(level, message, options = {}) {
  return observability.recordLog({
    level,
    message,
    companyId: options.companyId || null,
    companyName: options.companyName || null,
    userId: options.userId || null,
    source: options.source || 'app',
    metadata: options.metadata || null,
    stack: options.stack || null,
  });
}

// =============================================
// HELPERS
// =============================================

/**
 * Sanitiza el path para agrupar rutas con parámetros dinámicos.
 * Ej: /api/products/abc-123 → /api/products/:id
 */
function sanitizePath(path) {
  if (!path) return '/';

  // Remover query string
  const basePath = path.split('?')[0];

  // Reemplazar UUIDs
  return basePath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
}

export default { observabilityMiddleware, observabilityErrorCapture, log };
