import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Layers, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { confirmDialog } from '../../utils/confirmDialog.jsx';
import { Field, formatMoney } from './shared.jsx';

const CYCLES = ['Mensual', 'Trimestral', 'Anual'];
const EMPTY_DRAFT = { name: '', cycle: 'Mensual', price: '', graceDays: '7', description: '' };

export default function PlansSection({ plans, planAssignments, onCreate, onRemove }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const usage = (planId) => Object.values(planAssignments).filter((id) => id === planId).length;

  function submit(event) {
    event.preventDefault();
    const price = Number(draft.price);
    if (!draft.name.trim()) return toast.error('Escribe el nombre del plan');
    if (!Number.isFinite(price) || price < 0) return toast.error('Escribe un precio válido');
    onCreate({
      id: crypto.randomUUID?.() || `plan-${Date.now()}`,
      name: draft.name.trim(),
      cycle: draft.cycle,
      price,
      graceDays: Number(draft.graceDays) || 0,
      description: draft.description.trim(),
    });
    setDraft(EMPTY_DRAFT);
    toast.success('Plan creado');
  }

  async function remove(plan) {
    const count = usage(plan.id);
    const message = count
      ? `${count} ${count === 1 ? 'empresa quedará' : 'empresas quedarán'} sin plan. Su estado de cuenta no cambia.`
      : `Se eliminará el plan "${plan.name}".`;
    if (await confirmDialog(message, { title: 'Eliminar plan', confirmText: 'Eliminar' })) onRemove(plan.id);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <section className="card overflow-hidden xl:col-span-2">
        <header className="px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">Catálogo de planes</h2>
          <p className="text-sm text-ink-muted">Se guardan en este navegador y sirven para estimar el ingreso mensual y prellenar facturas.</p>
        </header>
        {plans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted bg-surface-muted border-b border-line">
                  <th scope="col" className="px-5 py-2 font-medium">Plan</th>
                  <th scope="col" className="px-5 py-2 font-medium">Ciclo</th>
                  <th scope="col" className="px-5 py-2 font-medium text-right">Precio</th>
                  <th scope="col" className="px-5 py-2 font-medium text-right">Gracia</th>
                  <th scope="col" className="px-5 py-2 font-medium text-right">Empresas</th>
                  <th scope="col" className="px-5 py-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{plan.name}</p>
                      {plan.description && <p className="text-xs text-ink-muted max-w-sm">{plan.description}</p>}
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{plan.cycle}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-ink whitespace-nowrap">{formatMoney(plan.price)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft whitespace-nowrap">{plan.graceDays} d</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{usage(plan.id)}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => remove(plan)} aria-label={`Eliminar ${plan.name}`} title="Eliminar" className="p-1.5 rounded-md text-ink-muted hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Layers} title="Sin planes" description="Crea un plan para asignarlo a las empresas." />}
      </section>

      <form onSubmit={submit} className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Nuevo plan</h2>
        <Field label="Nombre" htmlFor="plan-name"><input id="plan-name" value={draft.name} onChange={set('name')} placeholder="Ej: Mensual Pyme" className="input-base" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ciclo" htmlFor="plan-cycle">
            <select id="plan-cycle" value={draft.cycle} onChange={set('cycle')} className="input-base">{CYCLES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Precio (DOP)" htmlFor="plan-price"><input id="plan-price" type="number" min="0" step="0.01" value={draft.price} onChange={set('price')} className="input-base tabular-nums" /></Field>
        </div>
        <Field label="Días de gracia" htmlFor="plan-grace"><input id="plan-grace" type="number" min="0" value={draft.graceDays} onChange={set('graceDays')} className="input-base tabular-nums" /></Field>
        <Field label="Descripción" htmlFor="plan-desc"><textarea id="plan-desc" rows={3} value={draft.description} onChange={set('description')} className="input-base" /></Field>
        <Button type="submit" className="w-full">Crear plan</Button>
      </form>
    </div>
  );
}
