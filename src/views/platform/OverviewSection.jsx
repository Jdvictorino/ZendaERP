import React, { useMemo } from 'react';
import { AlertTriangle, Building2, CircleDollarSign, LockKeyhole, CheckCircle2 } from 'lucide-react';
import KpiCard from '../../components/ui/KpiCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { STATUS_META, STATUS_OPTIONS, StatusBadge, TenantAvatar, daysUntil, dueLabel, dueTone, formatDate, formatMoney } from './shared.jsx';
import { badgeClass } from '../../components/ui/Badge.jsx';

const BAR_COLORS = {
  active: 'bg-success-500',
  trial: 'bg-sky-500',
  past_due: 'bg-warning-500',
  suspended: 'bg-orange-500',
  blocked: 'bg-danger-500',
  cancelled: 'bg-gray-400',
};

export default function OverviewSection({ tenants, plansById, planAssignments, onOpenTenant }) {
  const metrics = useMemo(() => {
    const count = (...statuses) => tenants.filter((t) => statuses.includes(t.billingStatus)).length;
    const mrr = tenants.reduce((total, t) => {
      const plan = plansById[planAssignments[t.id]];
      return plan && ['active', 'trial', 'past_due'].includes(t.billingStatus) ? total + Number(plan.price || 0) : total;
    }, 0);

    // Empresas que requieren acción: vencidas, bloqueadas o que vencen en 15 días
    const attention = tenants
      .map((t) => ({ ...t, days: daysUntil(t.billingDueDate) }))
      .filter((t) => ['past_due', 'suspended', 'blocked'].includes(t.billingStatus) || (t.days !== null && t.days <= 15 && t.billingStatus !== 'cancelled'))
      .sort((a, b) => (a.days ?? -9999) - (b.days ?? -9999));

    return {
      active: count('active', 'trial'),
      pastDue: count('past_due'),
      blocked: count('blocked', 'suspended'),
      mrr,
      attention,
      byStatus: STATUS_OPTIONS.map((status) => ({ status, count: count(status) })).filter((s) => s.count > 0),
    };
  }, [tenants, plansById, planAssignments]);

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <KpiCard label="Empresas activas" value={metrics.active} icon={Building2} tone="success" hint={`de ${tenants.length} registradas`} />
        <KpiCard label="Con pago vencido" value={metrics.pastDue} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Bloqueadas o suspendidas" value={metrics.blocked} icon={LockKeyhole} tone="danger" />
        <KpiCard label="Ingreso mensual estimado" value={formatMoney(metrics.mrr)} icon={CircleDollarSign} tone="brand" hint="Según los planes asignados" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <section className="card xl:col-span-2 overflow-hidden" aria-labelledby="attention-title">
          <header className="px-5 py-4 border-b border-line">
            <h2 id="attention-title" className="text-base font-semibold text-ink">Requieren atención</h2>
            <p className="text-sm text-ink-muted">Vencidas, bloqueadas o que vencen en los próximos 15 días.</p>
          </header>
          {metrics.attention.length ? (
            <ul className="divide-y divide-line">
              {metrics.attention.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTenant(t.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-muted focus-visible:bg-surface-muted focus:outline-none transition-colors"
                  >
                    <TenantAvatar tenant={t} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{t.name}</p>
                      <p className="text-xs text-ink-muted">Vence {formatDate(t.billingDueDate)}</p>
                    </div>
                    <StatusBadge status={t.billingStatus} />
                    <span className={`${badgeClass(dueTone(t.days, t.billingStatus))} hidden sm:inline-flex w-32 justify-center tabular-nums`}>{dueLabel(t.days)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCircle2} title="Todo al día" description="Ninguna empresa está vencida ni vence en los próximos 15 días." />
          )}
        </section>

        <section className="card p-5" aria-labelledby="status-title">
          <h2 id="status-title" className="text-base font-semibold text-ink">Empresas por estado</h2>
          {tenants.length > 0 && (
            <div className="mt-4 flex h-2.5 rounded-full overflow-hidden bg-surface-muted" aria-hidden="true">
              {metrics.byStatus.map((s) => (
                <div key={s.status} className={BAR_COLORS[s.status]} style={{ width: `${(s.count / tenants.length) * 100}%` }} />
              ))}
            </div>
          )}
          <dl className="mt-4 space-y-2">
            {STATUS_OPTIONS.map((status) => {
              const value = metrics.byStatus.find((s) => s.status === status)?.count || 0;
              return (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${BAR_COLORS[status]}`} aria-hidden="true" />
                  <dt className="flex-1 text-ink-soft">{STATUS_META[status].label}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{value}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      </div>
    </div>
  );
}
