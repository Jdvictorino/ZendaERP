import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  Cpu,
  Database,
  Eye,
  FileText,
  Filter,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { platformBilling } from '../../api/client.js';
import Button from '../ui/Button.jsx';

/**
 * Renderiza un gráfico SVG de línea (sparkline) para tendencias de RPM/Latencia.
 */
function Sparkline({ data = [], color = '#6366f1', height = 40, dataKey = 'rpm' }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-gray-400">Sin datos</div>;
  }

  const values = data.map(d => Number(d[dataKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((val, idx) => {
    const x = (idx / (values.length - 1)) * 100;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full relative" style={{ height }}>
      <svg className="w-full h-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export default function ObservabilityDashboard({ sessionToken }) {
  const [activeSubTab, setActiveSubTab] = useState('overview'); // overview | tenant | traces | logs | system
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Data states
  const [overview, setOverview] = useState(null);
  const [systemData, setSystemData] = useState(null);
  const [allCompanies, setAllCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [tenantMetrics, setTenantMetrics] = useState(null);
  
  // Traces state
  const [traces, setTraces] = useState([]);
  const [traceFilter, setTraceFilter] = useState({ method: '', statusMin: '', minDuration: '' });
  const [selectedTrace, setSelectedTrace] = useState(null);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState({ level: '', search: '' });

  // Errors state
  const [recentErrors, setRecentErrors] = useState([]);
  const [slowQueries, setSlowQueries] = useState([]);

  // Fetch all companies from database
  const loadAllCompanies = async () => {
    try {
      const res = await platformBilling.listTenants(sessionToken, { page: 1, limit: 200 });
      const list = res?.data || (Array.isArray(res) ? res : []);
      setAllCompanies(list);
    } catch (err) {
      console.error('Error cargando empresas:', err);
    }
  };

  // Fetch overview data
  const loadOverview = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      const data = await platformBilling.getObservabilityOverview(sessionToken);
      setOverview(data);
    } catch (err) {
      console.error('Error cargando observabilidad:', err);
      toast.error('Error cargando datos de observabilidad');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch system health
  const loadSystemData = async () => {
    try {
      const data = await platformBilling.getSystemHealth(sessionToken);
      setSystemData(data);
    } catch (err) {
      console.error('Error cargando datos de sistema:', err);
    }
  };

  // Fetch tenant metrics
  const loadTenantMetrics = async (companyId) => {
    if (!companyId) return;
    try {
      const data = await platformBilling.getTenantMetrics(sessionToken, companyId);
      setTenantMetrics(data);
    } catch (err) {
      console.error('Error cargando métricas de tenant:', err);
    }
  };

  // Fetch traces
  const loadTraces = async () => {
    try {
      let data;
      if (selectedCompanyId) {
        data = await platformBilling.getTenantTraces(sessionToken, selectedCompanyId, traceFilter);
      } else {
        data = await platformBilling.getGlobalTraces(sessionToken, traceFilter);
      }
      setTraces(data?.data || []);
    } catch (err) {
      console.error('Error cargando trazas:', err);
    }
  };

  // Fetch logs
  const loadLogs = async () => {
    try {
      let data;
      if (selectedCompanyId) {
        data = await platformBilling.getTenantLogs(sessionToken, selectedCompanyId, logFilter);
      } else {
        data = await platformBilling.getGlobalLogs(sessionToken, logFilter);
      }
      setLogs(data?.data || []);
    } catch (err) {
      console.error('Error cargando logs:', err);
    }
  };

  // Initial and subtab load
  useEffect(() => {
    loadOverview();
    loadSystemData();
    loadAllCompanies();
  }, [sessionToken]);

  useEffect(() => {
    if (activeSubTab === 'traces') loadTraces();
    if (activeSubTab === 'logs') loadLogs();
    if (activeSubTab === 'tenant' && selectedCompanyId) loadTenantMetrics(selectedCompanyId);
    if (activeSubTab === 'system') loadSystemData();
  }, [activeSubTab, selectedCompanyId, traceFilter, logFilter]);

  // Auto refresh interval (10 sec)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadOverview();
      if (activeSubTab === 'system') loadSystemData();
      if (activeSubTab === 'traces') loadTraces();
      if (activeSubTab === 'logs') loadLogs();
      if (activeSubTab === 'tenant' && selectedCompanyId) loadTenantMetrics(selectedCompanyId);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeSubTab, selectedCompanyId]);

  if (loading) {
    return (
      <div className="card p-12 text-center flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-indigo-600 dark:text-indigo-400" size={36} />
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Cargando métricas y observabilidad del sistema...</p>
      </div>
    );
  }

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m`;
  };

  // Build a consolidated list of all registered & active companies
  const companyOptionsMap = new Map();
  allCompanies.forEach(c => {
    companyOptionsMap.set(c.id, {
      id: c.id,
      name: c.name || c.legalName || c.id,
      requestCount: 0,
    });
  });
  (overview?.topTenants || []).forEach(t => {
    if (companyOptionsMap.has(t.companyId)) {
      companyOptionsMap.get(t.companyId).requestCount = t.requestCount;
    } else {
      companyOptionsMap.set(t.companyId, {
        id: t.companyId,
        name: t.companyName || t.companyId,
        requestCount: t.requestCount,
      });
    }
  });
  const availableCompanies = Array.from(companyOptionsMap.values());

  return (
    <div className="space-y-6">
      {/* Header bar with subtabs and controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 shadow-sm backdrop-blur-md">
        {/* Subtab navigation */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'overview', label: 'Visión General', icon: BarChart3 },
            { id: 'tenant', label: 'Por Empresa', icon: Building2 },
            { id: 'traces', label: 'Trazas HTTP', icon: Activity },
            { id: 'logs', label: 'Logs de Sistema', icon: Terminal },
            { id: 'system', label: 'Salud & Servidor', icon: Cpu },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
            {autoRefresh ? 'En vivo (10s)' : 'Pausado'}
          </button>

          <Button
            onClick={() => loadOverview(true)}
            variant="ghost"
            className="!p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Refrescar datos"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. OVERVIEW SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-gray-900 shadow-sm">
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Rendimiento (RPM)</span>
                <Zap size={20} />
              </div>
              <div className="text-3xl font-black text-gray-900 dark:text-white">{overview?.rpm || 0}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Peticiones / minuto (prom. 5m)</p>
              <div className="mt-3">
                <Sparkline data={overview?.timeline || []} color="#6366f1" dataKey="rpm" />
              </div>
            </div>

            <div className="card p-5 border border-emerald-100 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-gray-900 shadow-sm">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Latencia (P95)</span>
                <Timer size={20} />
              </div>
              <div className="text-3xl font-black text-gray-900 dark:text-white">{overview?.latency?.p95 || 0} <span className="text-sm font-normal text-gray-400">ms</span></div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg: {overview?.latency?.avg || 0}ms | P99: {overview?.latency?.p99 || 0}ms</p>
              <div className="mt-3">
                <Sparkline data={overview?.timeline || []} color="#10b981" dataKey="p95" />
              </div>
            </div>

            <div className="card p-5 border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-gray-900 shadow-sm">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Tasa de Errores</span>
                <AlertTriangle size={20} />
              </div>
              <div className="text-3xl font-black text-gray-900 dark:text-white">{overview?.errorRate || 0}%</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview?.totalErrors || 0} errores totales en sesión</p>
              <div className="mt-3">
                <Sparkline data={overview?.timeline || []} color="#f59e0b" dataKey="errors" />
              </div>
            </div>

            <div className="card p-5 border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-gray-900 shadow-sm">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Uptime & Servidor</span>
                <Clock3 size={20} />
              </div>
              <div className="text-2xl font-black text-gray-900 dark:text-white">{formatUptime(overview?.uptime || 0)}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview?.activeCompanies || 0} empresas activas monitorizadas</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Sistema Operativo Normal</span>
              </div>
            </div>
          </div>

          {/* Middle Grid: Top Tenants & Recent Error Groups */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Tenants by traffic */}
            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Building2 className="text-indigo-600 dark:text-indigo-400" size={18} />
                Empresas con Mayor Carga (Última Hora)
              </h3>

              {!overview?.topTenants || overview.topTenants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aún no hay actividad suficiente por empresa.</p>
              ) : (
                <div className="space-y-3">
                  {overview.topTenants.map((t, idx) => (
                    <div
                      key={t.companyId}
                      onClick={() => {
                        setSelectedCompanyId(t.companyId);
                        setActiveSubTab('tenant');
                      }}
                      className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t.companyName}</p>
                          <p className="text-xs text-gray-400">ID: {t.companyId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-gray-100">{t.requestCount} req</p>
                          <p className="text-xs text-gray-400">P95: {t.latency.p95}ms</p>
                        </div>
                        {t.errorCount > 0 ? (
                          <span className="px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold">
                            {t.errorCount} err
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                            100% OK
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Errors */}
            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={18} />
                Grupo de Errores Recientes (5xx)
              </h3>

              {!overview?.recentErrors || overview.recentErrors.length === 0 ? (
                <div className="text-center py-12 text-emerald-600 dark:text-emerald-400 flex flex-col items-center gap-2">
                  <ShieldCheck size={32} />
                  <p className="text-sm font-bold">¡Cero errores de servidor registrados!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.recentErrors.map((err) => (
                    <div key={err.key} className="p-3 rounded-xl border border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white">
                          HTTP {err.statusCode}
                        </span>
                        <span className="text-xs text-gray-400">
                          {err.count} apariciones | {err.affectedCompanies} empresa(s)
                        </span>
                      </div>
                      <p className="text-xs font-mono text-gray-800 dark:text-gray-200 line-clamp-2">{err.message}</p>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                        <span>Ruta: <code className="text-indigo-600 dark:text-indigo-400">{err.lastMethod} {err.lastPath}</code></span>
                        <span>Último: {new Date(err.lastSeen).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TENANT METRICS SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'tenant' && (
        <div className="space-y-6">
          {/* Company selector */}
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center gap-4">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Building2 size={18} className="text-indigo-600" />
              Seleccionar Empresa:
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="input-base sm:w-96"
            >
              <option value="">-- Selecciona una empresa ({availableCompanies.length} registradas) --</option>
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.requestCount > 0 ? `(${c.requestCount} reqs recientes)` : '(Sin tráfico reciente)'}
                </option>
              ))}
            </select>
          </div>

          {!selectedCompanyId ? (
            <div className="card p-12 text-center text-gray-400">
              Selecciona una empresa del menú desplegable superior para examinar su rendimiento detallado.
            </div>
          ) : !tenantMetrics ? (
            <div className="card p-8 text-center"><Loader2 className="animate-spin inline" /> Cargando...</div>
          ) : (
            <div className="space-y-6">
              {/* Tenant KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 font-bold uppercase">Requests (1h)</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{tenantMetrics.requestCount}</p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 font-bold uppercase">Latencia P95</p>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{tenantMetrics.latency?.p95 || 0} ms</p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 font-bold uppercase">Errores</p>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{tenantMetrics.errorCount}</p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 font-bold uppercase">Latencia Promedio</p>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{tenantMetrics.latency?.avg || 0} ms</p>
                </div>
              </div>

              {/* Top endpoints table */}
              <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Endpoints más frecuentados por esta empresa</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                      <tr>
                        <th className="p-2.5">Endpoint</th>
                        <th className="p-2.5">Requests</th>
                        <th className="p-2.5">Latencia Promedios</th>
                        <th className="p-2.5">Errores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {tenantMetrics.topEndpoints?.map((ep, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="p-2.5 font-mono text-indigo-600 dark:text-indigo-400 font-bold">{ep.endpoint}</td>
                          <td className="p-2.5 font-bold">{ep.count}</td>
                          <td className="p-2.5 font-semibold">{ep.avgMs} ms</td>
                          <td className="p-2.5">
                            {ep.errors > 0 ? (
                              <span className="text-red-500 font-bold">{ep.errors}</span>
                            ) : (
                              <span className="text-emerald-500">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TRACES SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'traces' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <span className="text-xs font-bold uppercase text-gray-500">Filtros:</span>
            </div>

            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="input-base text-xs py-1.5 w-48 font-medium"
            >
              <option value="">Todas las Empresas</option>
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={traceFilter.method}
              onChange={(e) => setTraceFilter({ ...traceFilter, method: e.target.value })}
              className="input-base text-xs py-1.5 w-28"
            >
              <option value="">Todos los Métodos</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={traceFilter.statusMin}
              onChange={(e) => setTraceFilter({ ...traceFilter, statusMin: e.target.value })}
              className="input-base text-xs py-1.5 w-32"
            >
              <option value="">Todos los Status</option>
              <option value="200">Exitosos (2xx)</option>
              <option value="400">Cliente Error (4xx)</option>
              <option value="500">Servidor Error (5xx)</option>
            </select>

            <input
              type="number"
              placeholder="Min ms (ej: 500)"
              value={traceFilter.minDuration}
              onChange={(e) => setTraceFilter({ ...traceFilter, minDuration: e.target.value })}
              className="input-base text-xs py-1.5 w-36"
            />
          </div>

          {/* Traces table */}
          <div className="card p-0 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0 backdrop-blur-sm text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Hora</th>
                    <th className="p-3">Método</th>
                    <th className="p-3">Ruta / Path</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Duración</th>
                    <th className="p-3">Empresa</th>
                    <th className="p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {traces.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-400">No hay trazas grabadas que coincidan con los filtros.</td>
                    </tr>
                  ) : (
                    traces.map((tr) => (
                      <tr key={tr.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 font-mono">
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {new Date(tr.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            tr.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                            tr.method === 'POST' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                            tr.method === 'PUT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}>
                            {tr.method}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 max-w-xs truncate" title={tr.path}>
                          {tr.path}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                            tr.statusCode < 300 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                            tr.statusCode < 500 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                            'bg-red-600 text-white'
                          }`}>
                            {tr.statusCode}
                          </span>
                        </td>
                        <td className="p-3 font-bold">
                          <span className={tr.durationMs > 1000 ? 'text-red-500' : tr.durationMs > 300 ? 'text-amber-500' : 'text-emerald-600'}>
                            {tr.durationMs} ms
                          </span>
                        </td>
                        <td className="p-3 text-gray-500 font-sans text-xs">
                          {tr.companyName || tr.companyId || '-'}
                        </td>
                        <td className="p-3 font-sans">
                          <button
                            onClick={() => setSelectedTrace(tr)}
                            className="p-1 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trace details modal */}
      {selectedTrace && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card p-6 bg-white dark:bg-gray-900 max-w-2xl w-full border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b dark:border-gray-800 pb-3 font-sans">
              <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Activity className="text-indigo-600" size={18} />
                Detalle de Traza HTTP #{selectedTrace.id}
              </h3>
              <button onClick={() => setSelectedTrace(null)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-950/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <div><span className="text-gray-400">Método:</span> <strong className="text-indigo-600">{selectedTrace.method}</strong></div>
              <div><span className="text-gray-400">Status:</span> <strong>{selectedTrace.statusCode}</strong></div>
              <div><span className="text-gray-400">Ruta:</span> <strong>{selectedTrace.path}</strong></div>
              <div><span className="text-gray-400">Duración:</span> <strong>{selectedTrace.durationMs} ms</strong></div>
              <div><span className="text-gray-400">Empresa:</span> <strong>{selectedTrace.companyName || selectedTrace.companyId || 'N/A'}</strong></div>
              <div><span className="text-gray-400">IP:</span> <strong>{selectedTrace.ip || 'Local'}</strong></div>
            </div>

            {selectedTrace.userEmail && (
              <p className="font-sans text-xs text-gray-500">Usuario ejecutor: <strong>{selectedTrace.userEmail}</strong></p>
            )}

            {selectedTrace.error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 space-y-1">
                <strong className="font-bold font-sans">Error de servidor capturado:</strong>
                <p className="break-all">{selectedTrace.error}</p>
              </div>
            )}

            <div className="flex justify-end pt-2 font-sans">
              <Button onClick={() => setSelectedTrace(null)} variant="ghost">Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. LOGS SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'logs' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="input-base text-xs py-1.5 w-48 font-medium"
            >
              <option value="">Todas las Empresas</option>
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={logFilter.level}
              onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
              className="input-base text-xs py-1.5 w-36"
            >
              <option value="">Todos los Niveles</option>
              <option value="error">ERROR</option>
              <option value="warn">WARN</option>
              <option value="info">INFO</option>
              <option value="debug">DEBUG</option>
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar en logs por texto o fuente..."
                value={logFilter.search}
                onChange={(e) => setLogFilter({ ...logFilter, search: e.target.value })}
                className="input-base pl-9 text-xs py-1.5"
              />
            </div>
          </div>

          {/* Terminal log viewer */}
          <div className="card p-4 bg-gray-950 text-gray-100 font-mono text-xs border border-gray-800 shadow-xl rounded-2xl max-h-[600px] overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-12">No hay logs almacenados en el buffer.</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="flex flex-col sm:flex-row sm:items-start gap-2 border-b border-gray-900/60 pb-1.5 hover:bg-gray-900/40 p-1 rounded">
                  <span className="text-gray-500 text-[11px] whitespace-nowrap">
                    [{new Date(l.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className={`px-1.5 py-0.2 text-[10px] font-black rounded uppercase w-14 text-center shrink-0 ${
                    l.level === 'error' ? 'bg-red-500 text-white' :
                    l.level === 'warn' ? 'bg-amber-500 text-black' :
                    l.level === 'info' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {l.level}
                  </span>
                  <span className="text-indigo-400 font-bold shrink-0">[{l.source}]</span>
                  <p className="break-all flex-1 text-gray-300">{l.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SYSTEM HEALTH SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'system' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2 flex items-center gap-2">
                <HardDrive size={16} className="text-indigo-500" />
                Uso de Memoria (RAM)
              </h4>
              <p className="text-3xl font-black text-gray-900 dark:text-white">
                {systemData?.system?.memoryUsagePercent || 0}%
              </p>
              <div className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${systemData?.system?.memoryUsagePercent || 0}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Heap Node: {systemData?.memory?.heapUsedFormatted} / {systemData?.memory?.heapTotalFormatted}
              </p>
            </div>

            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2 flex items-center gap-2">
                <Database size={16} className="text-emerald-500" />
                Base de Datos PostgreSQL
              </h4>
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {systemData?.database?.status === 'connected' ? 'Conectado' : 'Error'}
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Latencia query ping: <strong>{systemData?.database?.latencyMs || 0} ms</strong>
              </p>
            </div>

            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2 flex items-center gap-2">
                <Server size={16} className="text-blue-500" />
                Entorno Node.js
              </h4>
              <p className="text-xl font-black text-gray-900 dark:text-white">
                {systemData?.node?.version || 'N/A'}
              </p>
              <p className="text-xs text-gray-400 mt-3">
                PID: {systemData?.node?.pid} | CPUTime: {systemData?.system?.cpuCount} cores ({systemData?.system?.cpuModel?.slice(0, 20)}...)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
