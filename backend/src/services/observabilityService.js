/**
 * Observability Service — Zenda ERP Platform
 * 
 * Servicio central de observabilidad en memoria con ring buffers.
 * Recolecta: trazas HTTP, logs estructurados, métricas de rendimiento,
 * health checks de sistema y auditoría por empresa/tenant.
 * 
 * Datos almacenados en memoria (se pierden al reiniciar).
 * Diseñado para bajo overhead y zero-dependency.
 */

import os from 'os';

const MAX_GLOBAL_TRACES = 5000;
const MAX_TENANT_TRACES = 500;
const MAX_GLOBAL_LOGS = 3000;
const MAX_TENANT_LOGS = 300;
const MAX_ERROR_GROUPS = 200;
const MAX_SLOW_QUERIES = 100;
const METRICS_WINDOW_MS = 60 * 60 * 1000; // 1 hora de granularidad para buckets
const METRICS_RETENTION_HOURS = 24;

// =============================================
// RING BUFFER
// =============================================

class RingBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  push(item) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll() {
    return [...this.buffer];
  }

  getRecent(n) {
    const start = Math.max(0, this.buffer.length - n);
    return this.buffer.slice(start);
  }

  size() {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
  }

  filter(predicate) {
    return this.buffer.filter(predicate);
  }
}

// =============================================
// PERCENTILE CALCULATOR
// =============================================

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
}

function computeLatencyStats(durations) {
  if (!durations.length) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// =============================================
// METRICS BUCKET (per-minute aggregation)
// =============================================

class MetricsBucket {
  constructor(timestamp) {
    this.timestamp = timestamp;
    this.requestCount = 0;
    this.errorCount = 0;
    this.durations = [];
    this.statusCodes = {};
    this.methods = {};
    this.endpoints = {};
  }

  record(trace) {
    this.requestCount++;
    this.durations.push(trace.durationMs);

    if (trace.statusCode >= 400) {
      this.errorCount++;
    }

    const sc = String(trace.statusCode);
    this.statusCodes[sc] = (this.statusCodes[sc] || 0) + 1;

    this.methods[trace.method] = (this.methods[trace.method] || 0) + 1;

    const endpoint = `${trace.method} ${trace.path}`;
    if (!this.endpoints[endpoint]) {
      this.endpoints[endpoint] = { count: 0, totalMs: 0, errors: 0 };
    }
    this.endpoints[endpoint].count++;
    this.endpoints[endpoint].totalMs += trace.durationMs;
    if (trace.statusCode >= 400) {
      this.endpoints[endpoint].errors++;
    }
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      latency: computeLatencyStats(this.durations),
      statusCodes: this.statusCodes,
      methods: this.methods,
      topEndpoints: Object.entries(this.endpoints)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([endpoint, stats]) => ({
          endpoint,
          count: stats.count,
          avgMs: Math.round(stats.totalMs / stats.count),
          errors: stats.errors,
        })),
    };
  }
}

// =============================================
// OBSERVABILITY STORE
// =============================================

class ObservabilityStore {
  constructor() {
    // Traces
    this.globalTraces = new RingBuffer(MAX_GLOBAL_TRACES);
    this.tenantTraces = new Map(); // companyId -> RingBuffer

    // Logs
    this.globalLogs = new RingBuffer(MAX_GLOBAL_LOGS);
    this.tenantLogs = new Map(); // companyId -> RingBuffer

    // Metrics buckets (per minute)
    this.globalBuckets = new Map(); // timestamp -> MetricsBucket
    this.tenantBuckets = new Map(); // companyId -> Map<timestamp, MetricsBucket>

    // Error groups
    this.errorGroups = new Map(); // errorKey -> { message, count, lastSeen, companyIds, stack }

    // Slow queries
    this.slowQueries = new RingBuffer(MAX_SLOW_QUERIES);

    // System metrics snapshots
    this.systemSnapshots = new RingBuffer(120); // 2 hours of per-minute snapshots

    // Counters
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.startedAt = new Date().toISOString();

    // Start periodic system metric collection
    this._collectSystemMetrics();
    this._systemInterval = setInterval(() => this._collectSystemMetrics(), 60_000);

    // Periodic cleanup of old buckets
    this._cleanupInterval = setInterval(() => this._cleanupOldBuckets(), 10 * 60_000);
  }

  // ─── TRACES ───────────────────────────

  recordTrace(trace) {
    const entry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      method: trace.method,
      path: trace.path,
      statusCode: trace.statusCode,
      durationMs: trace.durationMs,
      companyId: trace.companyId || null,
      companyName: trace.companyName || null,
      userId: trace.userId || null,
      userEmail: trace.userEmail || null,
      userAgent: trace.userAgent || null,
      ip: trace.ip || null,
      error: trace.error || null,
      query: trace.query || null,
    };

    this.globalTraces.push(entry);
    this.totalRequests++;

    if (entry.statusCode >= 400) {
      this.totalErrors++;
    }

    // Per-tenant trace
    if (entry.companyId) {
      if (!this.tenantTraces.has(entry.companyId)) {
        this.tenantTraces.set(entry.companyId, new RingBuffer(MAX_TENANT_TRACES));
      }
      this.tenantTraces.get(entry.companyId).push(entry);
    }

    // Aggregate into metrics bucket
    this._recordToBucket(entry);

    // Track errors
    if (entry.statusCode >= 500 && entry.error) {
      this._recordError(entry);
    }

    // Track slow requests
    if (entry.durationMs > 1000) {
      this.slowQueries.push({
        id: entry.id,
        timestamp: entry.timestamp,
        method: entry.method,
        path: entry.path,
        durationMs: entry.durationMs,
        statusCode: entry.statusCode,
        companyId: entry.companyId,
        companyName: entry.companyName,
      });
    }

    return entry;
  }

  getTraces(options = {}) {
    const { companyId, limit = 100, method, minDuration, maxDuration, statusMin, statusMax } = options;

    let traces;
    if (companyId) {
      const buf = this.tenantTraces.get(companyId);
      traces = buf ? buf.getAll() : [];
    } else {
      traces = this.globalTraces.getAll();
    }

    // Apply filters
    let filtered = traces;

    if (method) {
      filtered = filtered.filter(t => t.method === method.toUpperCase());
    }
    if (minDuration !== undefined) {
      filtered = filtered.filter(t => t.durationMs >= minDuration);
    }
    if (maxDuration !== undefined) {
      filtered = filtered.filter(t => t.durationMs <= maxDuration);
    }
    if (statusMin !== undefined) {
      filtered = filtered.filter(t => t.statusCode >= statusMin);
    }
    if (statusMax !== undefined) {
      filtered = filtered.filter(t => t.statusCode <= statusMax);
    }

    // Return most recent first, limited
    return filtered.slice(-limit).reverse();
  }

  // ─── LOGS ─────────────────────────────

  recordLog(log) {
    const entry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      level: log.level || 'info', // error, warn, info, debug
      message: log.message,
      companyId: log.companyId || null,
      companyName: log.companyName || null,
      userId: log.userId || null,
      source: log.source || 'app',
      metadata: log.metadata || null,
      stack: log.stack || null,
    };

    this.globalLogs.push(entry);

    if (entry.companyId) {
      if (!this.tenantLogs.has(entry.companyId)) {
        this.tenantLogs.set(entry.companyId, new RingBuffer(MAX_TENANT_LOGS));
      }
      this.tenantLogs.get(entry.companyId).push(entry);
    }

    return entry;
  }

  getLogs(options = {}) {
    const { companyId, limit = 100, level, search, since } = options;

    let logs;
    if (companyId) {
      const buf = this.tenantLogs.get(companyId);
      logs = buf ? buf.getAll() : [];
    } else {
      logs = this.globalLogs.getAll();
    }

    let filtered = logs;

    if (level) {
      const levels = Array.isArray(level) ? level : [level];
      filtered = filtered.filter(l => levels.includes(l.level));
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.message || '').toLowerCase().includes(searchLower) ||
        (l.source || '').toLowerCase().includes(searchLower)
      );
    }
    if (since) {
      const sinceDate = new Date(since).getTime();
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= sinceDate);
    }

    return filtered.slice(-limit).reverse();
  }

  // ─── METRICS ──────────────────────────

  getOverview() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const fiveMinAgo = now - 5 * 60 * 1000;

    // Recent traces for RPM calculation
    const recentTraces = this.globalTraces.getAll().filter(
      t => new Date(t.timestamp).getTime() >= fiveMinAgo
    );
    const rpm = recentTraces.length > 0
      ? Math.round(recentTraces.length / 5)
      : 0;

    const recentDurations = recentTraces.map(t => t.durationMs);
    const latency = computeLatencyStats(recentDurations);

    const recentErrors = recentTraces.filter(t => t.statusCode >= 500);
    const errorRate = recentTraces.length > 0
      ? Math.round((recentErrors.length / recentTraces.length) * 10000) / 100
      : 0;

    // Per-tenant summary
    const tenantSummaries = [];
    for (const [companyId, buf] of this.tenantTraces) {
      const tenantRecent = buf.getAll().filter(
        t => new Date(t.timestamp).getTime() >= oneHourAgo
      );
      if (tenantRecent.length === 0) continue;

      const tenantErrors = tenantRecent.filter(t => t.statusCode >= 500);
      const tenantDurations = tenantRecent.map(t => t.durationMs);

      tenantSummaries.push({
        companyId,
        companyName: tenantRecent[tenantRecent.length - 1]?.companyName || companyId,
        requestCount: tenantRecent.length,
        errorCount: tenantErrors.length,
        errorRate: tenantRecent.length > 0
          ? Math.round((tenantErrors.length / tenantRecent.length) * 10000) / 100
          : 0,
        latency: computeLatencyStats(tenantDurations),
      });
    }

    tenantSummaries.sort((a, b) => b.requestCount - a.requestCount);

    // Timeline data (per-minute for last hour)
    const timeline = this._getTimeline(60);

    // System health
    const systemHealth = this._getLatestSystemMetrics();

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      uptime: process.uptime(),
      startedAt: this.startedAt,
      rpm,
      latency,
      errorRate,
      activeCompanies: this.tenantTraces.size,
      topTenants: tenantSummaries.slice(0, 10),
      timeline,
      system: systemHealth,
      recentErrors: this._getRecentErrorGroups(10),
      timestamp: new Date().toISOString(),
    };
  }

  getTenantMetrics(companyId) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const fiveMinAgo = now - 5 * 60 * 1000;

    const buf = this.tenantTraces.get(companyId);
    if (!buf) {
      return {
        companyId,
        requestCount: 0,
        errorCount: 0,
        rpm: 0,
        latency: computeLatencyStats([]),
        errorRate: 0,
        statusCodes: {},
        topEndpoints: [],
        timeline: [],
      };
    }

    const allTraces = buf.getAll();
    const hourTraces = allTraces.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
    const recentTraces = allTraces.filter(t => new Date(t.timestamp).getTime() >= fiveMinAgo);

    const rpm = recentTraces.length > 0 ? Math.round(recentTraces.length / 5) : 0;
    const durations = hourTraces.map(t => t.durationMs);
    const errors = hourTraces.filter(t => t.statusCode >= 500);

    // Status code distribution
    const statusCodes = {};
    hourTraces.forEach(t => {
      const sc = String(t.statusCode);
      statusCodes[sc] = (statusCodes[sc] || 0) + 1;
    });

    // Top endpoints
    const endpointMap = {};
    hourTraces.forEach(t => {
      const key = `${t.method} ${t.path}`;
      if (!endpointMap[key]) endpointMap[key] = { count: 0, totalMs: 0, errors: 0 };
      endpointMap[key].count++;
      endpointMap[key].totalMs += t.durationMs;
      if (t.statusCode >= 400) endpointMap[key].errors++;
    });

    const topEndpoints = Object.entries(endpointMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgMs: Math.round(stats.totalMs / stats.count),
        errors: stats.errors,
      }));

    // Timeline (per-minute for last hour)
    const timeline = this._getTenantTimeline(companyId, 60);

    return {
      companyId,
      companyName: allTraces[allTraces.length - 1]?.companyName || companyId,
      requestCount: hourTraces.length,
      errorCount: errors.length,
      rpm,
      latency: computeLatencyStats(durations),
      errorRate: hourTraces.length > 0
        ? Math.round((errors.length / hourTraces.length) * 10000) / 100
        : 0,
      statusCodes,
      topEndpoints,
      timeline,
    };
  }

  // ─── ERRORS ───────────────────────────

  getRecentErrors(limit = 50) {
    return this._getRecentErrorGroups(limit);
  }

  getSlowQueries(limit = 50) {
    return this.slowQueries.getRecent(limit).reverse();
  }

  // ─── SYSTEM ───────────────────────────

  getSystemHealth() {
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();
    const cpus = os.cpus();

    return {
      uptime: process.uptime(),
      startedAt: this.startedAt,
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
      },
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers || 0,
        rssFormatted: formatBytes(mem.rss),
        heapUsedFormatted: formatBytes(mem.heapUsed),
        heapTotalFormatted: formatBytes(mem.heapTotal),
      },
      system: {
        totalMem,
        freeMem,
        usedMem: totalMem - freeMem,
        totalMemFormatted: formatBytes(totalMem),
        freeMemFormatted: formatBytes(freeMem),
        memoryUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model || 'unknown',
        loadAvg: {
          '1m': loadAvg[0]?.toFixed(2),
          '5m': loadAvg[1]?.toFixed(2),
          '15m': loadAvg[2]?.toFixed(2),
        },
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      observability: {
        tracesStored: this.globalTraces.size(),
        logsStored: this.globalLogs.size(),
        tenantsTracked: this.tenantTraces.size,
        errorGroupsTracked: this.errorGroups.size,
        slowQueriesStored: this.slowQueries.size(),
      },
      eventLoopLag: this._lastEventLoopLag || 0,
      systemTimeline: this.systemSnapshots.getRecent(60),
      timestamp: new Date().toISOString(),
    };
  }

  // ─── INTERNALS ────────────────────────

  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  _getBucketKey(date) {
    // Round to nearest minute
    const d = new Date(date);
    d.setSeconds(0, 0);
    return d.getTime();
  }

  _recordToBucket(trace) {
    const key = this._getBucketKey(trace.timestamp);

    // Global bucket
    if (!this.globalBuckets.has(key)) {
      this.globalBuckets.set(key, new MetricsBucket(new Date(key).toISOString()));
    }
    this.globalBuckets.get(key).record(trace);

    // Tenant bucket
    if (trace.companyId) {
      if (!this.tenantBuckets.has(trace.companyId)) {
        this.tenantBuckets.set(trace.companyId, new Map());
      }
      const tenantBucketsMap = this.tenantBuckets.get(trace.companyId);
      if (!tenantBucketsMap.has(key)) {
        tenantBucketsMap.set(key, new MetricsBucket(new Date(key).toISOString()));
      }
      tenantBucketsMap.get(key).record(trace);
    }
  }

  _recordError(trace) {
    const key = `${trace.statusCode}:${(trace.error || '').slice(0, 100)}`;

    if (!this.errorGroups.has(key)) {
      this.errorGroups.set(key, {
        key,
        message: trace.error || 'Unknown error',
        statusCode: trace.statusCode,
        count: 0,
        firstSeen: trace.timestamp,
        lastSeen: trace.timestamp,
        companyIds: new Set(),
        lastPath: trace.path,
        lastMethod: trace.method,
      });
    }

    const group = this.errorGroups.get(key);
    group.count++;
    group.lastSeen = trace.timestamp;
    group.lastPath = trace.path;
    group.lastMethod = trace.method;
    if (trace.companyId) {
      group.companyIds.add(trace.companyId);
    }

    // Prune if too many error groups
    if (this.errorGroups.size > MAX_ERROR_GROUPS) {
      const entries = [...this.errorGroups.entries()]
        .sort((a, b) => new Date(a[1].lastSeen) - new Date(b[1].lastSeen));
      const toRemove = entries.slice(0, entries.length - MAX_ERROR_GROUPS);
      toRemove.forEach(([k]) => this.errorGroups.delete(k));
    }
  }

  _getRecentErrorGroups(limit) {
    return [...this.errorGroups.values()]
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, limit)
      .map(g => ({
        ...g,
        companyIds: [...g.companyIds],
        affectedCompanies: g.companyIds.size,
      }));
  }

  _getTimeline(minutes) {
    const now = Date.now();
    const result = [];

    for (let i = minutes - 1; i >= 0; i--) {
      const bucketTime = this._getBucketKey(now - i * 60_000);
      const bucket = this.globalBuckets.get(bucketTime);

      if (bucket) {
        const json = bucket.toJSON();
        result.push({
          timestamp: json.timestamp,
          rpm: json.requestCount,
          errors: json.errorCount,
          p95: json.latency.p95,
          avg: json.latency.avg,
        });
      } else {
        result.push({
          timestamp: new Date(bucketTime).toISOString(),
          rpm: 0,
          errors: 0,
          p95: 0,
          avg: 0,
        });
      }
    }

    return result;
  }

  _getTenantTimeline(companyId, minutes) {
    const now = Date.now();
    const bucketsMap = this.tenantBuckets.get(companyId);
    const result = [];

    for (let i = minutes - 1; i >= 0; i--) {
      const bucketTime = this._getBucketKey(now - i * 60_000);
      const bucket = bucketsMap?.get(bucketTime);

      if (bucket) {
        const json = bucket.toJSON();
        result.push({
          timestamp: json.timestamp,
          rpm: json.requestCount,
          errors: json.errorCount,
          p95: json.latency.p95,
          avg: json.latency.avg,
        });
      } else {
        result.push({
          timestamp: new Date(bucketTime).toISOString(),
          rpm: 0,
          errors: 0,
          p95: 0,
          avg: 0,
        });
      }
    }

    return result;
  }

  _collectSystemMetrics() {
    const mem = process.memoryUsage();

    // Measure event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
      this._lastEventLoopLag = Math.round(lag * 100) / 100;
    });

    this.systemSnapshots.push({
      timestamp: new Date().toISOString(),
      memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      loadAvg1m: os.loadavg()[0],
      eventLoopLag: this._lastEventLoopLag || 0,
    });
  }

  _getLatestSystemMetrics() {
    const snapshots = this.systemSnapshots.getRecent(1);
    return snapshots.length > 0 ? snapshots[0] : null;
  }

  _cleanupOldBuckets() {
    const cutoff = Date.now() - METRICS_RETENTION_HOURS * 60 * 60 * 1000;

    for (const [key] of this.globalBuckets) {
      if (key < cutoff) {
        this.globalBuckets.delete(key);
      }
    }

    for (const [, bucketsMap] of this.tenantBuckets) {
      for (const [key] of bucketsMap) {
        if (key < cutoff) {
          bucketsMap.delete(key);
        }
      }
    }
  }

  destroy() {
    if (this._systemInterval) clearInterval(this._systemInterval);
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
  }
}

// =============================================
// UTILITIES
// =============================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// =============================================
// SINGLETON EXPORT
// =============================================

const observability = new ObservabilityStore();

export default observability;
export { ObservabilityStore, computeLatencyStats, formatBytes };
