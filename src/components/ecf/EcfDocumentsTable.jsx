import React, { useEffect, useState, useCallback } from 'react';
import { Eye, RefreshCw, RotateCcw, FileText, ExternalLink, ChevronLeft, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardBody } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import api from '../../api/client.js';
import { ECF_STATUSES, ECF_TYPES, ECF_TYPE_MAP } from '../../utils/ecfConstants.js';
import { badgeClass } from '../ui/Badge.jsx';

const StatusBadge = ({ status }) => {
  const config = ECF_STATUSES[status] || ECF_STATUSES.pendiente;
  return (
    <span className={badgeClass(config.tone)}>
      {config.label}
    </span>
  );
};

const EcfDocumentsTable = () => {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', tipoEcf: '', desde: '', hasta: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const limit = 15;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (filters.status) params.status = filters.status;
      if (filters.tipoEcf) params.tipoEcf = filters.tipoEcf;
      if (filters.desde) params.desde = filters.desde;
      if (filters.hasta) params.hasta = filters.hasta;
      const result = await api.ecf.getDocuments(params);
      setDocuments(result.documents || []);
      setTotal(result.total || 0);
    } catch (err) {
      toast.error('Error al cargar documentos e-CF');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleCheckStatus = async (doc) => {
    setActionLoading(doc.id);
    try {
      const result = await api.ecf.checkStatus(doc.id);
      toast.success(`Estado: ${result.document?.dgiiStatus || 'Sin cambios'}`);
      loadDocuments();
    } catch (err) { toast.error(err.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  const handleRetry = async (doc) => {
    setActionLoading(doc.id);
    try {
      const result = await api.ecf.retry(doc.id);
      toast[result.success ? 'success' : 'error'](result.success ? 'Reenviado' : (result.error || 'Error'));
      loadDocuments();
    } catch (err) { toast.error(err.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  const handleViewDetail = async (doc) => {
    try {
      const detail = await api.ecf.getDocument(doc.id);
      setSelectedDoc(detail);
      setShowDetail(true);
    } catch { toast.error('Error al cargar detalle'); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Estado</label>
            <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <option value="">Todos</option>
              {Object.entries(ECF_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Tipo</label>
            <select value={filters.tipoEcf} onChange={e => { setFilters(f => ({ ...f, tipoEcf: e.target.value })); setPage(1); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <option value="">Todos</option>
              {ECF_TYPES.map(t => <option key={t.code} value={t.code}>{t.code} — {t.shortName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Desde</label>
            <input type="date" value={filters.desde} onChange={e => { setFilters(f => ({ ...f, desde: e.target.value })); setPage(1); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Hasta</label>
            <input type="date" value={filters.hasta} onChange={e => { setFilters(f => ({ ...f, hasta: e.target.value })); setPage(1); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFilters({ status: '', tipoEcf: '', desde: '', hasta: '' }); setPage(1); }}>Limpiar</Button>
          <Button variant="outline" size="sm" onClick={loadDocuments}><RefreshCw size={14} className="mr-1" />Actualizar</Button>
        </CardBody>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['e-NCF','Tipo','Comprador','Monto','Estado','Fecha','Acciones'].map(h => (
                  <th key={h} className={`px-4 py-3 font-medium text-slate-500 dark:text-slate-400 ${h === 'Monto' ? 'text-right' : h === 'Estado' || h === 'Acciones' ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : documents.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center"><FileText className="mx-auto mb-2 text-slate-300" size={32} /><p className="text-slate-400">No hay documentos e-CF</p></td></tr>
              ) : documents.map(doc => (
                <tr key={doc.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">{doc.eNcf}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ECF_TYPE_MAP[doc.tipoEcf]?.shortName || doc.tipoEcf}</td>
                  <td className="px-4 py-3"><div className="text-slate-700 dark:text-slate-300 text-sm">{doc.nombreComprador || '—'}</div>{doc.rncComprador && <div className="text-xs text-slate-400">{doc.rncComprador}</div>}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">RD$ {parseFloat(doc.montoTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={doc.dgiiStatus} /></td>
                  <td className="px-4 py-3 text-ink-muted text-xs">{new Date(doc.fechaEmision).toLocaleDateString('es-DO')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleViewDetail(doc)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-brand-500" title="Ver"><Eye size={16} /></button>
                      {doc.trackId && ['enviado','en_proceso'].includes(doc.dgiiStatus) && (
                        <button onClick={() => handleCheckStatus(doc)} disabled={actionLoading === doc.id} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500" title="Consultar">
                          <RefreshCw size={16} className={actionLoading === doc.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                      {['error','pendiente','rechazado'].includes(doc.dgiiStatus) && (
                        <button onClick={() => handleRetry(doc)} disabled={actionLoading === doc.id} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-amber-500" title="Reintentar">
                          <RotateCcw size={16} className={actionLoading === doc.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm text-ink-muted">{total} documentos</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <span className="text-sm text-slate-600 dark:text-slate-300">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </Card>

      {showDetail && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setShowDetail(false)}>
          <div className="modal-panel max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Detalle e-CF</h3>
              <button onClick={() => setShowDetail(false)} aria-label="Cerrar" className="modal-close"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-ink-muted">e-NCF:</span><br/><span className="font-mono font-medium">{selectedDoc.eNcf}</span></div>
                <div><span className="text-ink-muted">Tipo:</span><br/>{ECF_TYPE_MAP[selectedDoc.tipoEcf]?.name || selectedDoc.tipoEcf}</div>
                <div><span className="text-ink-muted">Estado:</span><br/><StatusBadge status={selectedDoc.dgiiStatus} /></div>
                <div><span className="text-ink-muted">TrackId:</span><br/><span className="font-mono text-xs">{selectedDoc.trackId || '—'}</span></div>
                <div><span className="text-ink-muted">RNC Emisor:</span><br/>{selectedDoc.rncEmisor}</div>
                <div><span className="text-ink-muted">RNC Comprador:</span><br/>{selectedDoc.rncComprador || '—'}</div>
                <div><span className="text-ink-muted">Monto:</span><br/>RD$ {parseFloat(selectedDoc.montoTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
                <div><span className="text-ink-muted">Código Seguridad:</span><br/><span className="font-mono">{selectedDoc.securityCode || '—'}</span></div>
              </div>
              {selectedDoc.dgiiMessage && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                  <span className="text-ink-muted text-xs">Mensaje DGII:</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-1">{selectedDoc.dgiiMessage}</p>
                </div>
              )}
              {selectedDoc.qrCodeUrl && (
                <a href={selectedDoc.qrCodeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-500 hover:text-brand-600 text-xs break-all">
                  <ExternalLink size={12} /> Verificar en DGII
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EcfDocumentsTable;
