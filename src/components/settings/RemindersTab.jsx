// Pestaña "Recordatorios de cobro" de Configuración: etapas, texto del correo, vista previa y envío automático.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import Card, { CardBody } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { settings as settingsApi } from '../../api/client.js';
import { confirmDialog } from '../../utils/confirmDialog.jsx';
import { todayRD } from '../../utils/tax.js';
import { DEFAULT_REMINDERS, remindersOf, validateReminders, renderReminder } from '../../utils/collectionReminders.js';

const MARKERS = ['{cliente}', '{empresa}', '{factura}', '{monto}', '{vence}', '{dias}', '{saldo}', '{vencido}', '{telefono}', '{correo}'];
// Vacío => NaN para que la validación lo rechace en vez de guardarlo como 0.
const toNum = (v) => (v === '' || v == null ? NaN : Number(v));

const RemindersTab = ({ companyProfile, canEdit, onProfileUpdate }) => {
    const [r, setR] = useState(() => remindersOf(companyProfile));
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    // El GET de settings no manda la clave: solo hasPassword.
    const s = companyProfile?.smtp;
    const smtpOk = !!(s?.host && s?.user && s?.hasPassword);

    const change = (patch) => { setError(null); setR((x) => ({ ...x, ...patch })); };
    const setStage = (i, v) => change({ stages: r.stages.map((x, j) => (j === i ? v : x)) });

    const restore = async () => {
        if (!(await confirmDialog('Se restaurarán las etapas y el texto iniciales. Los cambios sin guardar se pierden.', { title: 'Restaurar valores iniciales', confirmText: 'Restaurar' }))) return;
        setError(null);
        setR({ ...DEFAULT_REMINDERS, auto: r.auto, autoHour: r.autoHour, stages: [...DEFAULT_REMINDERS.stages] });
    };

    const save = async () => {
        const rules = { ...r, auto: !!r.auto, autoHour: toNum(r.autoHour), stages: r.stages.map(toNum), subject: r.subject.trim(), body: r.body.trim() };
        const problem = validateReminders(rules);
        if (problem) { setError(problem); return; }
        setSaving(true);
        try {
            const saved = await settingsApi.updateCollectionReminders(rules);
            if (onProfileUpdate) onProfileUpdate(saved);
            toast.success('Recordatorios de cobro guardados');
        } catch (e) {
            toast.error(e?.message || 'No se pudieron guardar los recordatorios de cobro.');
        } finally {
            setSaving(false);
        }
    };

    const today = todayRD();
    const due = todayRD(new Date(Date.now() + 3 * 86400e3));
    const preview = renderReminder(
        { subject: r.subject, body: r.body },
        { customerName: 'Cliente de ejemplo', invoiceNumber: 'B0100000001', dueDate: due, amount: 5000, balance: 10000, overdueTotal: 0 },
        companyProfile, today,
    );

    return (
        <Card>
            <CardBody className="space-y-4">
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recordatorios de cobro</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Días respecto al vencimiento: negativo es antes de vencer, 0 el día que vence, positivo es de atraso.</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-medium">Etapas (días)</p>
                    <div className="flex flex-wrap items-center gap-2">
                        {r.stages.map((st, i) => (
                            <span key={i} className="flex items-center gap-1">
                                <input type="number" step="1" min="-60" max="365" className="input-base w-20" aria-label={`Etapa ${i + 1}`} value={Number.isNaN(st) ? '' : st} disabled={!canEdit} onChange={(e) => setStage(i, e.target.value)} />
                                {canEdit && r.stages.length > 1 && <button type="button" aria-label={`Quitar etapa ${i + 1}`} onClick={() => change({ stages: r.stages.filter((_, j) => j !== i) })}><X size={14} /></button>}
                            </span>
                        ))}
                        {canEdit && <Button variant="secondary" onClick={() => change({ stages: [...r.stages, 30] })}><Plus size={16} /> Agregar etapa</Button>}
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium" htmlFor="rem-subject">Asunto</label>
                    <input id="rem-subject" className="input-base" value={r.subject} disabled={!canEdit} onChange={(e) => change({ subject: e.target.value })} />
                    <label className="block text-sm font-medium" htmlFor="rem-body">Mensaje</label>
                    <textarea id="rem-body" className="input-base" rows={9} value={r.body} disabled={!canEdit} onChange={(e) => change({ body: e.target.value })} />
                    <p className="text-xs text-slate-500">Marcadores: {MARKERS.join(' ')}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid="reminder-preview">
                    <p className="mb-1 text-xs uppercase text-slate-500">Vista previa (factura de ejemplo)</p>
                    <p className="font-semibold">{preview.subject}</p>
                    <pre className="whitespace-pre-wrap font-sans">{preview.text}</pre>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" aria-label="Enviar automáticamente" checked={!!r.auto} disabled={!canEdit || !smtpOk} onChange={(e) => change({ auto: e.target.checked })} /> Enviar automáticamente
                    </label>
                    <label className="flex items-center gap-2 text-sm">Hora
                        <input type="number" step="1" min="0" max="23" className="input-base w-20" aria-label="Hora del envío automático" value={Number.isNaN(r.autoHour) ? '' : r.autoHour} disabled={!canEdit} onChange={(e) => change({ autoHour: e.target.value })} />
                    </label>
                </div>
                {!smtpOk && <p className="text-sm text-slate-500">Configura el correo de la empresa para activar el envío automático.</p>}
                {!smtpOk && r.auto && <p className="text-sm text-amber-600">El envío automático está encendido, pero no se enviará nada hasta que configures el correo de la empresa.</p>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={restore}>Restaurar valores iniciales</Button>
                        <Button onClick={save} disabled={saving}>Guardar recordatorios</Button>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Solo un administrador puede editar los recordatorios.</p>
                )}
            </CardBody>
        </Card>
    );
};

export default RemindersTab;
