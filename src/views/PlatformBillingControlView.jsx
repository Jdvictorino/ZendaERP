import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Activity, Building2, DownloadCloud, Layers, LayoutDashboard, Loader2, LogOut, Moon, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import { platformBilling } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import PageSkeleton from '../components/ui/Skeleton.jsx';
import ObservabilityDashboard from '../components/observability/ObservabilityDashboard.jsx';
import { getTheme, toggleTheme } from '../utils/theme.js';
import OverviewSection from './platform/OverviewSection.jsx';
import TenantsSection from './platform/TenantsSection.jsx';
import TenantDetail from './platform/TenantDetail.jsx';
import PlansSection from './platform/PlansSection.jsx';
import UpdatesSection from './platform/UpdatesSection.jsx';
import { Field } from './platform/shared.jsx';

const SESSION_STORAGE_KEY = 'platformBillingSession';
const BILLING_PLANS_STORAGE_KEY = 'platformBillingPlansV1';
const BILLING_ASSIGNMENTS_STORAGE_KEY = 'platformBillingAssignmentsV1';

const DEFAULT_BILLING_PLANS = [
  { id: 'plan-monthly', name: 'Mensual', cycle: 'Mensual', price: 49, graceDays: 7, description: 'Renovación mensual con cobro recurrente.' },
  { id: 'plan-quarterly', name: 'Trimestral', cycle: 'Trimestral', price: 129, graceDays: 10, description: 'Pago cada 90 días con mejor retención.' },
  { id: 'plan-yearly', name: 'Anual', cycle: 'Anual', price: 449, graceDays: 15, description: 'Descuento anual con estabilidad de caja.' },
];

const SECTIONS = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard, subtitle: 'Estado de cobro de todas las empresas.' },
  { id: 'tenants', label: 'Empresas', icon: Building2, subtitle: 'Suscripción, facturas, pagos y módulos de cada empresa.' },
  { id: 'plans', label: 'Planes', icon: Layers, subtitle: 'Precios y ciclos que se asignan a las empresas.' },
  { id: 'updates', label: 'Actualizaciones', icon: DownloadCloud, subtitle: 'Qué empresas reciben la nueva versión de la app de escritorio.' },
  { id: 'observability', label: 'Observabilidad', icon: Activity, subtitle: 'Tráfico, errores y rendimiento del servidor.' },
];

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* almacenamiento no disponible: los planes viven solo en esta sesión */ }
}

export default function PlatformBillingControlView() {
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [tenants, setTenants] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('overview');
  const [openTenantId, setOpenTenantId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [plans, setPlans] = useState(() => readStoredJson(BILLING_PLANS_STORAGE_KEY, DEFAULT_BILLING_PLANS));
  const [planAssignments, setPlanAssignments] = useState(() => readStoredJson(BILLING_ASSIGNMENTS_STORAGE_KEY, {}));
  const [theme, setThemeState] = useState(getTheme);

  const plansById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);
  const openTenant = tenants.find((t) => t.id === openTenantId) || null;

  useEffect(() => writeStoredJson(BILLING_PLANS_STORAGE_KEY, plans), [plans]);
  useEffect(() => writeStoredJson(BILLING_ASSIGNMENTS_STORAGE_KEY, planAssignments), [planAssignments]);

  const logout = useCallback((message = 'Sesión cerrada') => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionToken('');
    setOwnerEmail('');
    setTenants([]);
    setLoaded(false);
    setOpenTenantId(null);
    if (message) toast(message);
  }, []);

  const loadTenants = useCallback(async (token = sessionToken) => {
    setLoading(true);
    try {
      const response = await platformBilling.listTenants(token);
      setTenants(response.data || []);
      setLoaded(true);
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar las empresas');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    platformBilling.validateSession(sessionToken)
      .then((data) => {
        setOwnerEmail(data?.owner?.email || '');
        loadTenants(sessionToken);
      })
      .catch(() => logout('Tu sesión expiró. Vuelve a entrar.'));
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => (!statusFilter || t.billingStatus === statusFilter)
      && (!q || [t.name, t.email, t.rnc].some((v) => v && v.toLowerCase().includes(q))));
  }, [tenants, search, statusFilter]);

  const patchTenant = (id, patch) => setTenants((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const goTo = (id) => {
    setSection(id);
    setOpenTenantId(null);
  };
  const showTenant = (id) => {
    setSection('tenants');
    setOpenTenantId(id);
    window.scrollTo({ top: 0 });
  };

  if (!sessionToken) {
    return <LoginScreen onLoggedIn={(token, email) => { sessionStorage.setItem(SESSION_STORAGE_KEY, token); setOwnerEmail(email); setSessionToken(token); }} />;
  }

  const current = SECTIONS.find((s) => s.id === section);
  const title = openTenant ? openTenant.name : current.label;

  return (
    <div className="min-h-screen bg-surface-muted dark:bg-night-950 lg:flex">
      <Toaster position="top-right" />

      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-night-900 text-white sticky top-0 h-screen">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8 rounded-lg" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Zenda ERP</p>
            <p className="text-xs text-gray-400">Plataforma</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1" aria-label="Secciones">
          {SECTIONS.map((s) => {
            const active = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${active ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <s.icon size={18} className={active ? 'text-brand-300' : ''} />
                {s.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <p className="px-3 text-xs text-gray-400">Sesión de propietario</p>
          <p className="px-3 text-sm text-gray-200 truncate" title={ownerEmail}>{ownerEmail || '—'}</p>
          <button type="button" onClick={() => logout()} className="mt-2 w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-surface/95 dark:bg-gray-900/95 backdrop-blur border-b border-line">
          <div className="h-16 px-4 sm:px-6 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-ink truncate">{title}</h1>
              <p className="text-xs text-ink-muted truncate hidden sm:block">{openTenant ? 'Ficha de la empresa' : current.subtitle}</p>
            </div>
            {section !== 'observability' && (
              <Button variant="secondary" size="sm" onClick={() => loadTenants()} disabled={loading} className="gap-1.5">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Actualizar</span>
              </Button>
            )}
            <button
              type="button"
              onClick={() => setThemeState(toggleTheme())}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button type="button" onClick={() => logout()} aria-label="Cerrar sesión" className="lg:hidden h-8 w-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-muted">
              <LogOut size={16} />
            </button>
          </div>
          <nav className="lg:hidden flex gap-1 px-3 pb-2 overflow-x-auto" aria-label="Secciones">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={s.id === section ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${s.id === section ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'text-ink-muted hover:text-ink'}`}
              >
                <s.icon size={15} /> {s.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="p-4 sm:p-6 max-w-7xl">
          {section === 'observability' ? (
            <ObservabilityDashboard sessionToken={sessionToken} />
          ) : !loaded ? (
            <PageSkeleton kpis={section === 'overview' ? 4 : 0} label="Cargando empresas…" />
          ) : section === 'overview' ? (
            <OverviewSection tenants={tenants} plansById={plansById} planAssignments={planAssignments} onOpenTenant={showTenant} />
          ) : section === 'tenants' && openTenant ? (
            <TenantDetail
              key={openTenant.id}
              tenant={openTenant}
              sessionToken={sessionToken}
              ownerEmail={ownerEmail}
              plans={plans}
              planId={planAssignments[openTenant.id]}
              onAssignPlan={(planId) => setPlanAssignments((cur) => ({ ...cur, [openTenant.id]: planId || undefined }))}
              onTenantUpdated={(patch) => (patch ? patchTenant(openTenant.id, patch) : loadTenants())}
              onBack={() => setOpenTenantId(null)}
            />
          ) : section === 'tenants' ? (
            <TenantsSection
              tenants={filteredTenants}
              loading={loading}
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              plansById={plansById}
              planAssignments={planAssignments}
              onOpenTenant={showTenant}
            />
          ) : section === 'plans' ? (
            <PlansSection
              plans={plans}
              planAssignments={planAssignments}
              onCreate={(plan) => setPlans((cur) => [...cur, plan])}
              onRemove={(planId) => {
                setPlans((cur) => cur.filter((p) => p.id !== planId));
                setPlanAssignments((cur) => Object.fromEntries(Object.entries(cur).filter(([, id]) => id !== planId)));
              }}
            />
          ) : (
            <UpdatesSection tenants={tenants} sessionToken={sessionToken} onTenantPatched={patchTenant} onOpenTenant={showTenant} />
          )}
        </main>
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await platformBilling.login(email.trim(), password);
      onLoggedIn(data.token, data?.owner?.email || email.trim());
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted dark:bg-night-950 px-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-10 w-10 rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold text-ink">Zenda ERP · Plataforma</h1>
            <p className="text-sm text-ink-muted">Acceso solo para el propietario.</p>
          </div>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4" noValidate>
          <Field label="Correo" htmlFor="owner-email">
            <input id="owner-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" required autoComplete="username" aria-invalid={!!error} />
          </Field>
          <Field label="Contraseña" htmlFor="owner-password">
            <input id="owner-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-base" required autoComplete="current-password" aria-invalid={!!error} />
          </Field>
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={loading || !email || !password}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
