import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, PackageCheck, PackageX, Search } from 'lucide-react';
import { platformBilling } from '../../api/client.js';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { badgeClass } from '../../components/ui/Badge.jsx';
import { StatusBadge, Switch, TenantAvatar, formatDate, formatDateTime } from './shared.jsx';

export default function UpdatesSection({ tenants, sessionToken, onTenantPatched, onOpenTenant }) {
  const [release, setRelease] = useState(undefined);
  const [search, setSearch] = useState('');
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    platformBilling.getUpdateRelease(sessionToken)
      .then((r) => setRelease(r?.release || null))
      .catch(() => setRelease(null));
  }, [sessionToken]);

  const enabledCount = tenants.filter((t) => t.otaUpdates).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => (!onlyEnabled || t.otaUpdates) && (!q || t.name.toLowerCase().includes(q)));
  }, [tenants, search, onlyEnabled]);

  async function toggle(tenant, enabled) {
    setSaving((s) => ({ ...s, [tenant.id]: true }));
    try {
      await platformBilling.setTenantUpdates(sessionToken, tenant.id, enabled);
      onTenantPatched(tenant.id, { otaUpdates: enabled });
      toast.success(`${tenant.name}: actualizaciones ${enabled ? 'activadas' : 'desactivadas'}`);
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar la opción');
    } finally {
      setSaving((s) => ({ ...s, [tenant.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${release ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400' : 'bg-surface-muted text-ink-muted'}`}>
          {release ? <PackageCheck size={22} /> : <PackageX size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          {release === undefined ? <Skeleton className="h-10 w-72" /> : release ? (
            <>
              <h2 className="text-base font-semibold text-ink">Versión publicada: v{release.version}</h2>
              <p className="text-sm text-ink-muted">Publicada el {formatDate(release.releaseDate)}. Las empresas activadas la reciben la próxima vez que inicien sesión en la app.</p>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-ink">No hay versión publicada</h2>
              <p className="text-sm text-ink-muted">Copia latest.yml, el instalador y su .blockmap a /srv/zenda/updates en el servidor para publicar una.</p>
            </>
          )}
        </div>
        <p className="text-sm text-ink-soft md:text-right">
          <span className="block text-2xl font-semibold text-ink tabular-nums">{enabledCount}<span className="text-base text-ink-muted font-normal"> / {tenants.length}</span></span>
          empresas con actualización automática
        </p>
      </section>

      <section className="card overflow-hidden">
        <div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa" aria-label="Buscar empresa" className="input-base pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft whitespace-nowrap">
            <Switch label="Solo activadas" checked={onlyEnabled} onChange={setOnlyEnabled} />
            Solo activadas
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted bg-surface-muted border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">Empresa</th>
                <th scope="col" className="px-4 py-2.5 font-medium hidden sm:table-cell">Estado</th>
                <th scope="col" className="px-4 py-2.5 font-medium hidden sm:table-cell">Versión instalada</th>
                <th scope="col" className="px-4 py-2.5 font-medium hidden md:table-cell">Última consulta</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right"><span className="hidden sm:inline">Actualizar automáticamente</span><span className="sm:hidden">Automática</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => {
                const outdated = release?.version && t.appVersion && t.appVersion !== release.version;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onOpenTenant(t.id)} className="flex items-center gap-3 text-left group focus:outline-none">
                        <TenantAvatar tenant={t} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink group-hover:text-brand-600 dark:group-hover:text-brand-400 group-focus-visible:underline truncate max-w-[16rem]">{t.name}</span>
                          <span className="sm:hidden block text-xs text-ink-muted">{t.appVersion ? `v${t.appVersion}${outdated ? ' · desactualizada' : ''}` : 'Sin reporte'}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={t.billingStatus} /></td>
                    <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                      {t.appVersion
                        ? <span className={badgeClass(outdated ? 'warning' : 'neutral')}>v{t.appVersion}{outdated ? ' · desactualizada' : ''}</span>
                        : <span className="text-ink-muted">Sin reporte</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-soft whitespace-nowrap">{formatDateTime(t.appCheckedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Switch label={`Actualizar automáticamente ${t.name}`} checked={!!t.otaUpdates} disabled={!!saving[t.id]} onChange={(on) => toggle(t, on)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <EmptyState icon={Building2} title={tenants.length ? 'Ninguna empresa coincide' : 'Sin empresas'} description={onlyEnabled ? 'Ninguna empresa tiene la actualización automática activada.' : undefined} />
          )}
        </div>
      </section>

      <p className="text-xs text-ink-muted max-w-3xl">
        La versión instalada la reporta cada app al buscar actualizaciones. Las instalaciones anteriores a la 1.1.0 no tienen actualizador:
        esos equipos deben instalar una vez la versión nueva a mano y desde ahí se actualizan solos.
      </p>
    </div>
  );
}
