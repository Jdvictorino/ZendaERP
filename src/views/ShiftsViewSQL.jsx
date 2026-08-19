/**
 * ShiftsView - Versión migrada a PostgreSQL API
 */

import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import { formatCurrency } from '../utils/formatCurrency.js';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';

export default function ShiftsViewSQL({ companyProfile, currentUserProfile }) {
  const currency = companyProfile?.currency || 'USD';
  const { data: cashShifts, loading, error, remove, refetch } = useApiCrud('/shifts');
  
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const isAdminUser = (currentUserProfile?.role || '').toLowerCase() === 'admin';

  const parseDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const filtered = useMemo(() => {
    let rows = [...(cashShifts || [])];
    if (status) rows = rows.filter(s => (s.status || '').toLowerCase() === status.toLowerCase());
    if (registerId) rows = rows.filter(s => (s.registerId || '') === registerId);
    if (q.trim()) rows = rows.filter(s => (s.openedBy || '').includes(q) || (s.closedBy || '').includes(q));
    if (fromDate) {
      const ts = new Date(fromDate).getTime();
      rows = rows.filter(s => {
        const openedAt = parseDate(s.openedAt);
        return openedAt ? openedAt.getTime() >= ts : true;
      });
    }
    if (toDate) {
      const ts = new Date(toDate).getTime() + 86400000 - 1;
      rows = rows.filter(s => {
        const openedAt = parseDate(s.openedAt);
        return openedAt ? openedAt.getTime() <= ts : true;
      });
    }
    return rows.sort((a, b) => {
      const dateA = parseDate(a.openedAt);
      const dateB = parseDate(b.openedAt);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [cashShifts, status, registerId, q, fromDate, toDate]);

  const exportCSV = () => {
    const headers = ['Estado','Apertura','Cierre','Caja','Abierto Por','Cerrado Por','Fondo','Esperado','Contado','Dif','Ventas Efectivo','Tarjeta','Transfer/Cheque','Crédito'];
    const lines = [headers.join(',')];
    filtered.forEach(s => {
      const p = s.paymentsTotals || {}; 
      const fmt = (v) => String(v ?? '').replace(/[,\n]/g, '');
      const openedAt = parseDate(s.openedAt);
      const closedAt = parseDate(s.closedAt);
      lines.push([
        s.status,
        openedAt ? openedAt.toLocaleString() : '',
        closedAt ? closedAt.toLocaleString() : '',
        s.registerId || '',
        s.openedBy || '',
        s.closedBy || '',
        s.openingAmount || 0,
        s.efectivoEsperado || 0,
        s.closingAmount || 0,
        s.diferencia || 0,
        p.efectivo || 0,
        p.tarjeta || 0,
        p.chequeTransferencia || 0,
        p.credito || 0,
      ].map(fmt).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `turnos_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const registers = companyProfile?.cash?.registers || [];

  const handleDeleteShift = async (shift) => {
    if (!isAdminUser) return;
    if (!shift?.id) return;
    const confirmed = window.confirm('¿Eliminar este turno de caja? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    try {
      await remove(shift.id);
      toast.success('Turno eliminado.');
    } catch (err) {
      console.error('Error deleting shift:', err);
      toast.error('No se pudo eliminar el turno.');
    }
  };

  // Estados de carga y error
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p className="ml-4 text-gray-500">Cargando turnos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <AlertTriangle className="text-red-500" size={48} />
        <p className="ml-4 text-red-500">Error: {error}</p>
        <Button variant="primary" onClick={refetch} className="ml-4">Reintentar</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-6 gap-2">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          Turnos de Caja
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCSV}>Exportar CSV</Button>
        </div>
      </div>
      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input placeholder="Buscar por usuario" value={q} onChange={e => setQ(e.target.value)} />
          <select className="input-base" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="open">Abiertos</option>
            <option value="closed">Cerrados</option>
          </select>
          <select className="input-base" value={registerId} onChange={e => setRegisterId(e.target.value)}>
            <option value="">Todas las cajas</option>
            {registers.map(r => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
          </select>
          <input type="date" className="input-base" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <input type="date" className="input-base" value={toDate} onChange={e => setToDate(e.target.value)} />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="border-b bg-gray-50/60">
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Apertura</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Cierre</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Caja</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Fondo</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Esperado</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contado</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Diferencia</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Ventas (Efe/Tar/Trf/Cr)</th>
                {isAdminUser && (
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdminUser ? 10 : 9} className="p-4 text-center text-gray-500">No hay turnos registrados</td>
                </tr>
              ) : (
                filtered.map(s => {
                  const openedAt = parseDate(s.openedAt);
                  const closedAt = parseDate(s.closedAt);
                  return (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-3"><span className={`px-2 py-1 text-xs rounded-full ${s.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{s.status}</span></td>
                      <td className="p-3">{openedAt ? openedAt.toLocaleString() : ''}</td>
                      <td className="p-3">{closedAt ? closedAt.toLocaleString() : ''}</td>
                      <td className="p-3 font-mono text-sm">{s.registerId || '-'}</td>
                      <td className="p-3">{formatCurrency(s.openingAmount || 0, currency)}</td>
                      <td className="p-3">{formatCurrency(s.efectivoEsperado || 0, currency)}</td>
                      <td className="p-3">{formatCurrency(s.closingAmount || 0, currency)}</td>
                      <td className={`p-3 ${s.diferencia ? 'font-bold' : ''}`}>{formatCurrency(s.diferencia || 0, currency)}</td>
                      <td className="p-3 text-sm">
                        {formatCurrency(s?.paymentsTotals?.efectivo || 0, currency)} /
                        {formatCurrency(s?.paymentsTotals?.tarjeta || 0, currency)} /
                        {formatCurrency(s?.paymentsTotals?.chequeTransferencia || 0, currency)} /
                        {formatCurrency(s?.paymentsTotals?.credito || 0, currency)}
                      </td>
                      {isAdminUser && (
                        <td className="p-3 text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteShift(s)}
                            title="Eliminar turno"
                          >
                            <Trash2 size={16} className="mr-2" />
                            Eliminar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
