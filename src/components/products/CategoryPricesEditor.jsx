import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';

// Filas sin categoría o sin precio no se envían al guardar; aquí se marcan.
export const isCompletePriceRow = (r, packagings = []) => !!r.category && r.price !== '' && r.price != null
    && Number(r.minQuantity) > 0
    && (!r.packagingId || packagings.some((p) => p.id === r.packagingId));

// Precios por categoría de cliente y escalón de cantidad (lista controlada).
const CategoryPricesEditor = ({ value = [], onChange, categories = [], packagings = [], baseUnitLabel = 'Unidad' }) => {
    const setRow = (i, patch) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const saved = packagings.filter((p) => p.id);
    const hasUnsaved = packagings.some((p) => !p.id);

    return (
        <div className="space-y-3">
            {value.map((row, i) => {
                const n = i + 1;
                const incomplete = !isCompletePriceRow(row, packagings);
                return (
                    <div key={row.id ?? `new-${i}`} className={`p-3 border rounded-lg bg-surface-muted space-y-2 ${incomplete ? 'border-red-400' : 'border-line'}`}>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label htmlFor={`cp-cat-${i}`} className="block text-sm text-ink-soft mb-1">Categoría</label>
                                <select id={`cp-cat-${i}`} aria-label={`Categoría ${n}`} className="input-base" value={row.category}
                                    onChange={(e) => setRow(i, { category: e.target.value })}>
                                    {!categories.includes(row.category) && <option value={row.category}>{row.category || '-- Elegir --'}</option>}
                                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`cp-pk-${i}`} className="block text-sm text-ink-soft mb-1">Empaque</label>
                                <select id={`cp-pk-${i}`} aria-label={`Empaque ${n}`} className="input-base" value={row.packagingId ?? ''}
                                    onChange={(e) => setRow(i, { packagingId: e.target.value || null })}>
                                    <option value="">{baseUnitLabel}</option>
                                    {row.packagingId && !saved.some((p) => p.id === row.packagingId) && <option value={row.packagingId}>(empaque eliminado)</option>}
                                    {saved.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`cp-qty-${i}`} className="block text-sm text-ink-soft mb-1">Desde cantidad</label>
                                <input id={`cp-qty-${i}`} aria-label={`Desde cantidad ${n}`} type="number" min="0.001" step="any" className="input-base" value={row.minQuantity}
                                    onChange={(e) => setRow(i, { minQuantity: e.target.value })} />
                            </div>
                            <div>
                                <label htmlFor={`cp-price-${i}`} className="block text-sm text-ink-soft mb-1">Precio sin ITBIS</label>
                                <input id={`cp-price-${i}`} aria-label={`Precio sin ITBIS ${n}`} type="number" min="0" step="0.01" className="input-base" value={row.price}
                                    onChange={(e) => setRow(i, { price: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-red-600">{incomplete ? 'Fila incompleta (categoría, cantidad, precio o empaque): no se guardará' : ''}</span>
                            <Button type="button" variant="danger" size="sm" aria-label={`Quitar precio ${n}`}
                                onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
                        </div>
                    </div>
                );
            })}
            {hasUnsaved && <p className="text-xs text-ink-muted">Guarda el producto para usar un empaque nuevo</p>}
            <Button type="button" variant="secondary" size="sm"
                onClick={() => onChange([...value, { category: categories[0] ?? '', packagingId: null, minQuantity: 1, price: '' }])}>
                <Plus size={16} /> Agregar precio
            </Button>
        </div>
    );
};

export default CategoryPricesEditor;
