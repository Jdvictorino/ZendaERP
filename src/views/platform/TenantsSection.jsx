import React from 'react';
import { Building2, ChevronRight, RefreshCw, Search } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { STATUS_META, STATUS_OPTIONS, StatusBadge, TenantAvatar, daysUntil, dueLabel, dueTone, formatDate } from './shared.jsx';
import { badgeClass } from '../../components/ui/Badge.jsx';

export default function TenantsSection({ tenants, loading, search, onSearch, statusFilter, onStatusFilter, plansById, planAssignments, onOpenTenant }) {
  return (
    <section className="card overflow-hidden">
      <div className="p-4 border-b border-line flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o RNC"
            aria-label="Buscar empresas"
            className="input-base pl-9"
          />
        </div>
        <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)} aria-label="Filtrar por estado" className="input-base sm:w-52">
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <p className="self-center text-sm text-ink-muted whitespace-nowrap tabular-nums flex items-center gap-2" aria-live="polite">
          {loading && <RefreshCw size={14} className="animate-spin" aria-hidden="true" />}
          {tenants.length} {tenants.length === 1 ? 'empresa' : 'empresas'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-muted bg-surface-muted border-b border-line">
              <th scope="col" className="px-4 py-2.5 font-medium">Empresa</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Vencimiento</th>
              <th scope="col" className="px-4 py-2.5 font-medium hidden md:table-cell">Plan</th>
              <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell text-right">Usuarios</th>
              <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">Actualizaciones</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading && !tenants.length && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3" colSpan={7}><Skeleton className="h-9 w-full" /></td>
              </tr>
            ))}
            {tenants.map((t) => {
              const days = daysUntil(t.billingDueDate);
              const plan = plansById[planAssignments[t.id]];
              return (
                <tr key={t.id} onClick={() => onOpenTenant(t.id)} className="cursor-pointer hover:bg-surface-muted transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-[14rem]">
                      <TenantAvatar tenant={t} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenTenant(t.id); }}
                          className="font-medium text-ink truncate block max-w-[18rem] text-left hover:text-brand-600 dark:hover:text-brand-400 focus:outline-none focus-visible:underline"
                        >
                          {t.name}
                        </button>
                        <p className="text-xs text-ink-muted truncate max-w-[18rem]">{t.email || 'Sin correo'}{t.rnc ? ` · RNC ${t.rnc}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={t.billingStatus} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-ink">{formatDate(t.billingDueDate)}</p>
                    {days !== null && <span className={`${badgeClass(dueTone(days, t.billingStatus), 'sm')} mt-0.5`}>{dueLabel(days)}</span>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-ink-soft">{plan ? plan.name : <span className="text-ink-muted">Sin plan</span>}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-right tabular-nums text-ink-soft">{t._count?.users ?? 0}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={badgeClass(t.otaUpdates ? 'brand' : 'neutral')}>{t.otaUpdates ? 'Automáticas' : 'Desactivadas'}</span>
                  </td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={16} className="text-ink-muted inline" aria-hidden="true" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !tenants.length && (
          <EmptyState
            icon={Building2}
            title="No hay empresas que coincidan"
            description={search || statusFilter ? 'Prueba con otro nombre o quita el filtro de estado.' : 'Las empresas aparecen aquí cuando se registran en Zenda ERP.'}
          />
        )}
      </div>
    </section>
  );
}
