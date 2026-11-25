// Pestaña "Retenciones" de Configuración: tabla editable de conceptos de retención de ITBIS/ISR.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import Card, { CardBody } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { settings as settingsApi } from '../../api/client.js';
import { confirmDialog } from '../../utils/confirmDialog.jsx';
import { TIPOS_RETENCION_ISR } from '../../utils/isrTypes.js';
import { DEFAULT_WITHHOLDINGS, withholdingsOf, validateWithholdings } from '../../utils/withholdings.js';

const TIPOS_PROVEEDOR = [
    ['persona_fisica', 'Persona física'], ['empresa', 'Empresa'], ['informal', 'Informal'],
    ['exterior', 'Exterior'], ['any', 'Cualquiera'],
];

const WithholdingsTab = ({ companyProfile, canEdit, onProfileUpdate }) => {
    const [rows, setRows] = useState(() => withholdingsOf(companyProfile).map((c) => ({ ...c })));
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const change = (id, patch) => { setError(null); setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c))); };

    const restore = async () => {
        if (!(await confirmDialog('Se reemplazará la tabla por los valores iniciales. Los cambios sin guardar se pierden.', { title: 'Restaurar valores iniciales', confirmText: 'Restaurar' }))) return;
        setError(null);
        setRows(DEFAULT_WITHHOLDINGS.map((c) => ({ ...c })));
    };

    const save = async () => {
        const list = rows.map((c) => ({ ...c, name: c.name.trim(), isrType: Number(c.isrPercent) > 0 ? c.isrType : null }));
        const problem = validateWithholdings(list);
        if (problem) { setError(problem); return; }
        setSaving(true);
        try {
            const saved = await settingsApi.update({ withholdings: list });
            if (onProfileUpdate) onProfileUpdate(saved);
            toast.success('Retenciones guardadas');
        } catch (e) {
            toast.error(e?.message || 'No se pudieron guardar las retenciones.');
        } finally {
            setSaving(false);
        }
    };

    const add = () => {
        setError(null);
        setRows((r) => [...r, { id: `custom-${Date.now()}`, name: '', supplierTypes: ['any'], itbisPercent: 0, isrPercent: 0, isrType: null, active: true }]);
    };

    return (
        <Card>
            <CardBody className="space-y-4">
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Retenciones</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Las tasas cambian con la ley: verifícalas con tu contador.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-500">
                                <th className="p-1">Nombre</th><th className="p-1">Proveedor</th><th className="p-1">% ITBIS</th>
                                <th className="p-1">% ISR</th><th className="p-1">Tipo 606</th><th className="p-1">Activo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => (
                                <tr key={c.id}>
                                    <td className="p-1"><input className="input-base" aria-label={`Nombre de ${c.name || 'retención nueva'}`} value={c.name} disabled={!canEdit} onChange={(e) => change(c.id, { name: e.target.value })} /></td>
                                    <td className="p-1">
                                        <select className="input-base" aria-label={`Tipo de proveedor de ${c.name}`} value={c.supplierTypes[0] || 'any'} disabled={!canEdit} onChange={(e) => change(c.id, { supplierTypes: [e.target.value] })}>
                                            {TIPOS_PROVEEDOR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-1"><input type="number" min="0" max="100" className="input-base w-20" aria-label={`% ITBIS de ${c.name}`} value={c.itbisPercent} disabled={!canEdit} onChange={(e) => change(c.id, { itbisPercent: e.target.value })} /></td>
                                    <td className="p-1"><input type="number" min="0" max="100" className="input-base w-20" aria-label={`% ISR de ${c.name}`} value={c.isrPercent} disabled={!canEdit} onChange={(e) => change(c.id, { isrPercent: e.target.value })} /></td>
                                    <td className="p-1">
                                        <select className="input-base" aria-label={`Tipo de ISR (606) de ${c.name}`} value={c.isrType || ''} disabled={!canEdit} onChange={(e) => change(c.id, { isrType: e.target.value || null })}>
                                            <option value="">—</option>
                                            {TIPOS_RETENCION_ISR.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-1"><input type="checkbox" aria-label={`Activo: ${c.name}`} checked={!!c.active} disabled={!canEdit} onChange={(e) => change(c.id, { active: e.target.checked })} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={add}><Plus size={16} /> Agregar retención</Button>
                        <Button variant="secondary" onClick={restore}>Restaurar valores iniciales</Button>
                        <Button onClick={save} disabled={saving}>Guardar retenciones</Button>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Solo un administrador puede editar esta tabla.</p>
                )}
            </CardBody>
        </Card>
    );
};

export default WithholdingsTab;
