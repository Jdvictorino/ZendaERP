import React, { useEffect, useState } from 'react';
import { Shield, Upload, Wifi, WifiOff, CheckCircle, AlertTriangle, Loader, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardBody } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import api from '../../api/client.js';
import { ECF_TYPES, ECF_ENVIRONMENTS, SEQUENCE_STATUSES } from '../../utils/ecfConstants.js';

const EcfConfigPanel = () => {
  const [config, setConfig] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAddSeq, setShowAddSeq] = useState(false);
  const [newSeq, setNewSeq] = useState({ tipoEcf: '', nombre: '', rangoDesde: 1, rangoHasta: 0, fechaVencimiento: '' });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [cfg, seqs] = await Promise.all([api.ecf.getConfig(), api.ecf.getSequences()]);
      setConfig(cfg);
      setSequences(seqs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleToggleEcf = async () => {
    setSaving(true);
    try {
      const updated = await api.ecf.updateConfig({ ecfEnabled: !config.ecfEnabled });
      setConfig(c => ({ ...c, ...updated }));
      toast.success(updated.ecfEnabled ? 'e-CF habilitado' : 'e-CF deshabilitado');
    } catch (err) { toast.error('Error al actualizar'); }
    finally { setSaving(false); }
  };

  const handleEnvironmentChange = async (env) => {
    setSaving(true);
    try {
      const updated = await api.ecf.updateConfig({ ecfEnvironment: env });
      setConfig(c => ({ ...c, ...updated }));
      toast.success('Ambiente actualizado');
    } catch (err) { toast.error('Error al cambiar ambiente'); }
    finally { setSaving(false); }
  };

  const handleUploadCert = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const password = prompt('Ingrese la contraseña del certificado .p12:');
    if (!password) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      setSaving(true);
      try {
        const result = await api.ecf.uploadCertificate({ certificateBase64: base64, password });
        if (result.success) {
          toast.success('Certificado configurado');
          loadConfig();
        } else {
          toast.error(result.error || 'Error al subir certificado');
        }
      } catch (err) { toast.error(err.message || 'Error al subir certificado'); }
      finally { setSaving(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleTestConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const result = await api.ecf.testConnection();
      setTestResult(result);
      toast[result.success ? 'success' : 'error'](result.success ? 'Conexión exitosa' : 'Error de conexión');
    } catch (err) { setTestResult({ success: false, error: err.message }); toast.error('Error'); }
    finally { setTesting(false); }
  };

  const handleAddSequence = async () => {
    if (!newSeq.tipoEcf) { toast.error('Seleccione un tipo'); return; }
    const ecfType = ECF_TYPES.find(t => t.code === newSeq.tipoEcf);
    try {
      await api.ecf.createSequence({ ...newSeq, nombre: ecfType?.name || newSeq.tipoEcf });
      toast.success('Secuencia creada');
      setShowAddSeq(false);
      setNewSeq({ tipoEcf: '', nombre: '', rangoDesde: 1, rangoHasta: 0, fechaVencimiento: '' });
      loadConfig();
    } catch (err) { toast.error(err.message || 'Error al crear secuencia'); }
  };

  const handleDeleteSequence = async (id) => {
    if (!confirm('¿Eliminar esta secuencia?')) return;
    try {
      await api.ecf.deleteSequence(id);
      toast.success('Secuencia eliminada');
      loadConfig();
    } catch (err) { toast.error('Error al eliminar'); }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><Loader className="animate-spin text-indigo-500" size={28} /></div>;

  return (
    <div className="space-y-4">
      {/* Estado General */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"><Shield size={18} />Facturación Electrónica</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Estado: <span className={`font-medium ${config?.ecfEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>{config?.ecfEnabled ? 'Habilitado' : 'Deshabilitado'}</span></p>
              <p className="text-xs text-slate-400 mt-1">RNC: {config?.rnc || 'No configurado'} — {config?.companyName}</p>
            </div>
            <Button variant={config?.ecfEnabled ? 'danger' : 'primary'} size="sm" onClick={handleToggleEcf} disabled={saving}>
              {config?.ecfEnabled ? 'Deshabilitar' : 'Habilitar'} e-CF
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Ambiente */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Ambiente DGII</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {ECF_ENVIRONMENTS.map(env => (
              <button key={env.code} onClick={() => handleEnvironmentChange(env.code)} disabled={saving}
                className={`rounded-xl border-2 p-3 text-left transition-all ${config?.ecfEnvironment === env.code ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{env.name}</p>
                <p className="text-xs text-slate-500 mt-1">{env.description}</p>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Certificado */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Certificado Digital (.p12)</h3>
          {config?.hasCertificate ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
              <CheckCircle className="text-emerald-500 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Certificado configurado</p>
                {config.certificateInfo && !config.certificateInfo.error && (
                  <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                    <p>Sujeto: {config.certificateInfo.subject}</p>
                    <p>Válido hasta: {new Date(config.certificateInfo.validTo).toLocaleDateString('es-DO')}</p>
                    {config.certificateInfo.isExpired && <p className="text-red-500 font-medium">⚠ Certificado vencido</p>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="text-amber-500" size={18} />
              <p className="text-sm text-amber-700 dark:text-amber-400">No hay certificado configurado</p>
            </div>
          )}
          <div className="mt-3">
            <label className="cursor-pointer">
              <input type="file" accept=".p12,.pfx" onChange={handleUploadCert} className="hidden" />
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                <Upload size={16} />{config?.hasCertificate ? 'Reemplazar' : 'Subir'} certificado
              </span>
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Test de Conexión */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Probar Conexión DGII</h3>
              <p className="text-xs text-slate-500 mt-1">Intenta autenticarse con el certificado y ambiente configurados</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing || !config?.hasCertificate}>
              {testing ? <Loader size={14} className="animate-spin mr-1" /> : <Wifi size={14} className="mr-1" />}
              {testing ? 'Probando...' : 'Probar'}
            </Button>
          </div>
          {testResult && (
            <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? <Wifi className="text-emerald-500" size={16} /> : <WifiOff className="text-red-500" size={16} />}
                <span className={`text-sm font-medium ${testResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {testResult.success ? `Conexión exitosa (${testResult.environment})` : `Error: ${testResult.error}`}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Secuencias e-NCF */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Secuencias e-NCF</h3>
            <Button variant="outline" size="sm" onClick={() => setShowAddSeq(!showAddSeq)}><Plus size={14} className="mr-1" />Agregar</Button>
          </div>

          {showAddSeq && (
            <div className="mb-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Tipo e-CF</label>
                  <select value={newSeq.tipoEcf} onChange={e => setNewSeq(s => ({ ...s, tipoEcf: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    <option value="">Seleccionar...</option>
                    {ECF_TYPES.filter(t => !sequences.find(s => s.tipoEcf === t.code)).map(t => (
                      <option key={t.code} value={t.code}>{t.code} — {t.shortName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Vencimiento</label>
                  <input type="date" value={newSeq.fechaVencimiento} onChange={e => setNewSeq(s => ({ ...s, fechaVencimiento: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Rango Desde</label>
                  <input type="number" min={1} value={newSeq.rangoDesde} onChange={e => setNewSeq(s => ({ ...s, rangoDesde: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Rango Hasta (0 = sin límite)</label>
                  <input type="number" min={0} value={newSeq.rangoHasta} onChange={e => setNewSeq(s => ({ ...s, rangoHasta: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddSequence}>Guardar</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddSeq(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {sequences.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No hay secuencias configuradas</p>
          ) : (
            <div className="space-y-2">
              {sequences.map(seq => (
                <div key={seq.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="font-medium text-sm text-slate-900 dark:text-slate-100">{seq.tipoEcf}</span>
                    <span className="text-sm text-slate-500 ml-2">{seq.nombre}</span>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Secuencial: #{seq.secuencial} | Rango: {seq.rangoDesde}-{seq.rangoHasta || '∞'}
                      {seq.fechaVencimiento && ` | Vence: ${new Date(seq.fechaVencimiento).toLocaleDateString('es-DO')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: SEQUENCE_STATUSES[seq.estado]?.color, backgroundColor: SEQUENCE_STATUSES[seq.estado]?.color + '20' }}>
                      {SEQUENCE_STATUSES[seq.estado]?.label || seq.estado}
                    </span>
                    <button onClick={() => handleDeleteSequence(seq.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default EcfConfigPanel;
