/**
 * EcfDashboard.jsx — Dashboard de Facturación Electrónica
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Send, AlertTriangle, Loader, RefreshCw, Zap } from 'lucide-react';
import Card, { CardBody } from '../ui/Card.jsx';
import api from '../../api/client.js';
import { ECF_STATUSES } from '../../utils/ecfConstants.js';

const StatCard = ({ icon: Icon, label, value, color, bgColor }) => (
  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
      <div className="rounded-lg p-2" style={{ backgroundColor: bgColor }}>
        <Icon size={20} style={{ color }} />
      </div>
    </div>
  </div>
);

const SequenceBar = ({ seq }) => {
  const used = seq.secuencial - 1;
  const total = seq.rangoHasta || 0;
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isLow = total > 0 && (total - used) <= 10;
  
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{seq.tipoEcf} — {seq.nombre}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          seq.estado === 'activa' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
          seq.estado === 'agotada' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>{seq.estado}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-500' : 'bg-indigo-500'}`} 
            style={{ width: `${percent}%` }} 
          />
        </div>
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {total > 0 ? `${used}/${total}` : `#${seq.secuencial}`}
        </span>
      </div>
    </div>
  );
};

const EcfDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const result = await api.ecf.getDashboard();
      setData(result);
    } catch (err) {
      console.error('Error loading e-CF dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader className="animate-spin text-indigo-500" size={28} />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardBody className="text-center py-8">
          <Zap className="mx-auto mb-3 text-slate-400" size={32} />
          <p className="text-slate-500 dark:text-slate-400">No se pudo cargar el dashboard e-CF</p>
          <button onClick={loadDashboard} className="mt-3 text-indigo-500 hover:text-indigo-600 text-sm font-medium">
            Reintentar
          </button>
        </CardBody>
      </Card>
    );
  }

  const { totals, sequences, last30Days } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Send} label="Total Emitidos" value={totals.totalDocuments} color="#6366f1" bgColor="#eef2ff" />
        <StatCard icon={Clock} label="Pendientes" value={totals.pendientes} color={ECF_STATUSES.pendiente.color} bgColor={ECF_STATUSES.pendiente.bgColor} />
        <StatCard icon={Send} label="Enviados" value={totals.enviados} color={ECF_STATUSES.enviado.color} bgColor={ECF_STATUSES.enviado.bgColor} />
        <StatCard icon={CheckCircle} label="Aceptados" value={totals.aceptados} color={ECF_STATUSES.aceptado.color} bgColor={ECF_STATUSES.aceptado.bgColor} />
        <StatCard icon={XCircle} label="Rechazados" value={totals.rechazados} color={ECF_STATUSES.rechazado.color} bgColor={ECF_STATUSES.rechazado.bgColor} />
        <StatCard icon={AlertTriangle} label="Errores" value={totals.errores} color={ECF_STATUSES.error.color} bgColor={ECF_STATUSES.error.bgColor} />
      </div>

      {/* Secuencias */}
      {sequences && sequences.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Secuencias Activas</h3>
              <button onClick={loadDashboard} className="text-slate-400 hover:text-indigo-500 transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sequences.map((seq, i) => <SequenceBar key={i} seq={seq} />)}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Resumen 30 días */}
      {last30Days && (
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Últimos 30 días</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {last30Days.count} documentos procesados — 
              <span className="text-emerald-600 font-medium"> RD$ {last30Days.montoAceptado?.toLocaleString('es-DO', { minimumFractionDigits: 2 })} aceptados</span>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default EcfDashboard;
