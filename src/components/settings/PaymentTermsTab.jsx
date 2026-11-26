// Pestaña "Condiciones de pago" de Configuración: plazos con cuotas y descuento por pronto pago.
// Los plazos guardados nunca se borran (solo se desactivan) para que clientes y facturas no queden apuntando a un id inexistente.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import Card, { CardBody } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { settings as settingsApi } from '../../api/client.js';
import { confirmDialog } from '../../utils/confirmDialog.jsx';
import { DEFAULT_PAYMENT_TERMS, paymentTermsOf, validatePaymentTerms } from '../../utils/paymentTerms.js';

const clone = (t) => ({ ...t, installments: t.installments.map((c) => ({ ...c })), discount: t.discount ? { ...t.discount } : null });
// Vacío => NaN para que la validación lo rechace en vez de guardarlo como 0.
const toNum = (v) => (v === '' || v == null ? NaN : Number(v));
const blank = (v) => v === '' || v == null;

const PaymentTermsTab = ({ companyProfile, canEdit, onProfileUpdate }) => {
    const [rows, setRows] = useState(() => paymentTermsOf(companyProfile).map(clone));
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const change = (id, patch) => { setError(null); setRows((r) => r.map((t) => (t.id === id ? { ...t, ...patch } : t))); };
    const changeInst = (t, i, patch) => change(t.id, { installments: t.installments.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    const changeDisc = (t, patch) => change(t.id, { discount: { percent: '', days: '', ...t.discount, ...patch } });

    const restore = async () => {
        if (!(await confirmDialog('Se reemplazará la tabla por los valores iniciales. Los cambios sin guardar se pierden.', { title: 'Restaurar valores iniciales', confirmText: 'Restaurar' }))) return;
        setError(null);
        setRows(DEFAULT_PAYMENT_TERMS.map(clone));
    };

    const add = () => {
        setError(null);
        // Id fijo desde el alta: no depende del nombre, así renombrar no rompe referencias.
        const id = `plazo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        // isNew: fila aún no guardada, la única que se puede quitar.
        setRows((r) => [...r, { isNew: true, id, name: '', installments: [{ percent: 100, days: 30, fromMonthEnd: false }], discount: null, active: true }]);
    };

    const remove = (id) => setRows((r) => r.filter((t) => t.id !== id));

    const save = async () => {
        const list = rows.map((t) => {
            const d = t.discount && !(blank(t.discount.percent) && blank(t.discount.days))
                ? { percent: toNum(t.discount.percent), days: toNum(t.discount.days) } : null;
            const { isNew, ...rest } = t;
            return { ...rest, name: t.name.trim(), installments: t.installments.map((c) => ({ percent: toNum(c.percent), days: toNum(c.days), fromMonthEnd: !!c.fromMonthEnd })), discount: d };
        });
        const problem = validatePaymentTerms(list);
        if (problem) { setError(problem); return; }
        setSaving(true);
        try {
            const saved = await settingsApi.update({ paymentTerms: list });
            if (onProfileUpdate) onProfileUpdate(saved);
            const ids = new Set(list.map((t) => t.id));
            setRows((r) => r.map((t) => (ids.has(t.id) ? { ...t, isNew: false } : t)));
            toast.success('Condiciones de pago guardadas');
        } catch (e) {
            toast.error(e?.message || 'No se pudieron guardar las condiciones de pago.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardBody className="space-y-4">
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Condiciones de pago</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Los plazos guardados no se borran: desactívalos para que no se ofrezcan. "Contado" siempre queda activo.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-500">
                                <th className="p-1">Nombre</th><th className="p-1">Cuotas</th><th className="p-1">Pronto pago</th><th className="p-1">Activo</th><th className="p-1" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((t) => {
                                const n = t.name || 'plazo nuevo';
                                return (
                                    <tr key={t.id} className="align-top">
                                        <td className="p-1"><input className="input-base" aria-label={`Nombre de ${n}`} value={t.name} disabled={!canEdit} onChange={(e) => change(t.id, { name: e.target.value })} /></td>
                                        <td className="p-1 space-y-1">
                                            {t.installments.map((c, i) => (
                                                <div key={i} className="flex flex-wrap items-center gap-1">
                                                    <input type="number" min="0" max="100" className="input-base w-20" aria-label={`Porcentaje de la cuota ${i + 1} de ${n}`} value={c.percent} disabled={!canEdit} onChange={(e) => changeInst(t, i, { percent: e.target.value })} /> %
                                                    <input type="number" min="0" max="365" className="input-base w-20" aria-label={`Días de la cuota ${i + 1} de ${n}`} value={c.days} disabled={!canEdit} onChange={(e) => changeInst(t, i, { days: e.target.value })} /> días
                                                    <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Desde fin de mes, cuota ${i + 1} de ${n}`} checked={!!c.fromMonthEnd} disabled={!canEdit} onChange={(e) => changeInst(t, i, { fromMonthEnd: e.target.checked })} /> fin de mes</label>
                                                    {canEdit && t.installments.length > 1 && (
                                                        <button type="button" aria-label={`Quitar cuota ${i + 1} de ${n}`} onClick={() => change(t.id, { installments: t.installments.filter((_, j) => j !== i) })}><X size={14} /></button>
                                                    )}
                                                </div>
                                            ))}
                                            {canEdit && <button type="button" className="text-xs text-blue-600" onClick={() => change(t.id, { installments: [...t.installments, { percent: 0, days: 30, fromMonthEnd: false }] })}>+ cuota</button>}
                                        </td>
                                        <td className="p-1">
                                            <div className="flex items-center gap-1">
                                                <input type="number" min="0" max="100" className="input-base w-20" aria-label={`Descuento % de ${n}`} value={t.discount?.percent ?? ''} disabled={!canEdit} onChange={(e) => changeDisc(t, { percent: e.target.value })} /> %
                                                <input type="number" min="0" max="365" className="input-base w-20" aria-label={`Días del descuento de ${n}`} value={t.discount?.days ?? ''} disabled={!canEdit} onChange={(e) => changeDisc(t, { days: e.target.value })} /> días
                                            </div>
                                        </td>
                                        <td className="p-1"><input type="checkbox" aria-label={`Activo: ${n}`} checked={!!t.active} disabled={!canEdit || t.id === 'contado'} onChange={(e) => change(t.id, { active: e.target.checked })} /></td>
                                        <td className="p-1">{canEdit && t.isNew && <button type="button" aria-label={`Quitar ${n}`} onClick={() => remove(t.id)}><X size={16} /></button>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={add}><Plus size={16} /> Agregar plazo</Button>
                        <Button variant="secondary" onClick={restore}>Restaurar valores iniciales</Button>
                        <Button onClick={save} disabled={saving}>Guardar condiciones</Button>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Solo un administrador puede editar esta tabla.</p>
                )}
            </CardBody>
        </Card>
    );
};

export default PaymentTermsTab;
