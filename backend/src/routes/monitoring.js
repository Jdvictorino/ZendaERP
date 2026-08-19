import { Router } from 'express';
import prisma from '../db.js';
import observability from '../services/observabilityService.js';

const router = Router();

/**
 * GET /api/monitoring/health
 * Health check liviano para uptime monitoring.
 */
router.get('/health', (req, res) => {
  const mem = process.memoryUsage();

  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'zenda-erp-api',
    env: process.env.NODE_ENV || 'development',
    version: process.version,
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    observability: {
      totalRequests: observability.totalRequests,
      totalErrors: observability.totalErrors,
      tracesStored: observability.globalTraces.size(),
      tenantsTracked: observability.tenantTraces.size,
    },
  });
});

/**
 * GET /api/monitoring/ready
 * Readiness check incluyendo conexion a base de datos.
 */
router.get('/ready', async (req, res) => {
  try {
    const dbStart = process.hrtime.bigint();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round(Number(process.hrtime.bigint() - dbStart) / 1_000_000);

    res.json({
      status: 'ready',
      db: 'connected',
      dbLatencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not-ready',
      db: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
