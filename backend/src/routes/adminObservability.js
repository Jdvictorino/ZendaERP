/**
 * Admin Observability Routes — Zenda ERP Platform
 * 
 * Endpoints API protegidos para el panel de observabilidad.
 * Requiere autenticación de platform admin (misma que adminBilling).
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import observability from '../services/observabilityService.js';
import prisma from '../db.js';

const router = Router();
import { requireJwtSecret } from '../services/security.js';

// =============================================
// AUTH MIDDLEWARE (reutiliza patrón de adminBilling)
// =============================================

router.use(requirePlatformAdmin);

// =============================================
// ROUTES
// =============================================

/**
 * GET /api/admin/observability/overview
 * Métricas globales de plataforma: RPM, latencia, errores, health, timeline
 */
router.get('/overview', (req, res) => {
  try {
    const overview = observability.getOverview();
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo overview de observabilidad', details: error.message });
  }
});

/**
 * GET /api/admin/observability/tenants/:companyId/metrics
 * Métricas detalladas por empresa: RPM, latencia P50/P95/P99, endpoints
 */
router.get('/tenants/:companyId/metrics', (req, res) => {
  try {
    const { companyId } = req.params;
    const metrics = observability.getTenantMetrics(companyId);
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo métricas del tenant', details: error.message });
  }
});

/**
 * GET /api/admin/observability/tenants/:companyId/traces
 * Últimas N trazas de requests por empresa con filtros
 */
router.get('/tenants/:companyId/traces', (req, res) => {
  try {
    const { companyId } = req.params;
    const { limit, method, minDuration, maxDuration, statusMin, statusMax } = req.query;

    const traces = observability.getTraces({
      companyId,
      limit: limit ? parseInt(limit, 10) : 100,
      method: method || undefined,
      minDuration: minDuration ? parseInt(minDuration, 10) : undefined,
      maxDuration: maxDuration ? parseInt(maxDuration, 10) : undefined,
      statusMin: statusMin ? parseInt(statusMin, 10) : undefined,
      statusMax: statusMax ? parseInt(statusMax, 10) : undefined,
    });

    res.json({ data: traces, total: traces.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo trazas', details: error.message });
  }
});

/**
 * GET /api/admin/observability/traces
 * Trazas globales (sin filtro de empresa) con filtros opcionales
 */
router.get('/traces', (req, res) => {
  try {
    const { limit, method, minDuration, maxDuration, statusMin, statusMax } = req.query;

    const traces = observability.getTraces({
      limit: limit ? parseInt(limit, 10) : 100,
      method: method || undefined,
      minDuration: minDuration ? parseInt(minDuration, 10) : undefined,
      maxDuration: maxDuration ? parseInt(maxDuration, 10) : undefined,
      statusMin: statusMin ? parseInt(statusMin, 10) : undefined,
      statusMax: statusMax ? parseInt(statusMax, 10) : undefined,
    });

    res.json({ data: traces, total: traces.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo trazas globales', details: error.message });
  }
});

/**
 * GET /api/admin/observability/tenants/:companyId/logs
 * Logs filtrados por empresa, nivel, texto
 */
router.get('/tenants/:companyId/logs', (req, res) => {
  try {
    const { companyId } = req.params;
    const { limit, level, search, since } = req.query;

    const logs = observability.getLogs({
      companyId,
      limit: limit ? parseInt(limit, 10) : 100,
      level: level || undefined,
      search: search || undefined,
      since: since || undefined,
    });

    res.json({ data: logs, total: logs.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo logs', details: error.message });
  }
});

/**
 * GET /api/admin/observability/logs
 * Logs globales con filtros
 */
router.get('/logs', (req, res) => {
  try {
    const { limit, level, search, since, companyId } = req.query;

    const logs = observability.getLogs({
      companyId: companyId || undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      level: level || undefined,
      search: search || undefined,
      since: since || undefined,
    });

    res.json({ data: logs, total: logs.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo logs globales', details: error.message });
  }
});

/**
 * GET /api/admin/observability/system
 * Métricas de sistema: CPU, RAM, uptime, event loop, DB connections
 */
router.get('/system', async (req, res) => {
  try {
    const systemHealth = observability.getSystemHealth();

    // Check DB connectivity
    let dbStatus = 'connected';
    let dbLatencyMs = 0;
    try {
      const dbStart = process.hrtime.bigint();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Math.round(Number(process.hrtime.bigint() - dbStart) / 1_000_000);
    } catch (dbError) {
      dbStatus = 'disconnected';
    }

    res.json({
      ...systemHealth,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        provider: 'postgresql',
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo health del sistema', details: error.message });
  }
});

/**
 * GET /api/admin/observability/errors
 * Top errores recientes agrupados por tipo y empresa
 */
router.get('/errors', (req, res) => {
  try {
    const { limit } = req.query;
    const errors = observability.getRecentErrors(limit ? parseInt(limit, 10) : 50);
    res.json({ data: errors, total: errors.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo errores recientes', details: error.message });
  }
});

/**
 * GET /api/admin/observability/slow-queries
 * Queries lentas detectadas (requests > 1000ms)
 */
router.get('/slow-queries', (req, res) => {
  try {
    const { limit } = req.query;
    const slowQueries = observability.getSlowQueries(limit ? parseInt(limit, 10) : 50);
    res.json({ data: slowQueries, total: slowQueries.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo slow queries', details: error.message });
  }
});

export default router;
