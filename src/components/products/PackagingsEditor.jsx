import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { PACKAGE_TYPES, roundQty } from '../../utils/units.js';

const money = (n) => n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lista controlada de empaques de un producto. Precio vacío = automático (base × equivalencia).
const PackagingsEditor = ({ value = [], onChange, baseUnitAbbr = 'und', basePrice = 0 }) => {
    const setRow = (i, patch) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    return (
        <div className="space-y-3">
            {value.map((row, i) => {
                const suggestion = money(roundQty((Number(basePrice) || 0) * (Number(row.factor) || 0)));
                const n = i + 1;
                return (
                    <div key={row.id ?? `new-${i}`} className="p-3 border border-line rounded-lg bg-surface-muted space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label htmlFor={`pk-name-${i}`} className="block text-sm text-ink-soft mb-1">Nombre</label>
                                <input id={`pk-name-${i}`} className="input-base" value={row.name} placeholder="Ej: Caja de 24"
                                    onChange={(e) => setRow(i, { name: e.target.value })} />
                            </div>
                            <div>
                                <label htmlFor={`pk-type-${i}`} className="block text-sm text-ink-soft mb-1">Tipo</label>
                                <select id={`pk-type-${i}`} className="input-base" value={row.unitCode}
                                    onChange={(e) => setRow(i, { unitCode: Number(e.target.value) })}>
                                    {PACKAGE_TYPES.map((t) => <option key={t.dgii} value={t.dgii}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`pk-factor-${i}`} className="block text-sm text-ink-soft mb-1">Equivale a ({baseUnitAbbr})</label>
                                <input id={`pk-factor-${i}`} type="number" min="0.001" step="0.001" className="input-base" value={row.factor}
                                    onChange={(e) => setRow(i, { factor: e.target.value })} />
                            </div>
                            <div>
                                <label htmlFor={`pk-barcode-${i}`} className="block text-sm text-ink-soft mb-1">Código de barras</label>
                                <input id={`pk-barcode-${i}`} className="input-base" value={row.barcode ?? ''}
                                    onChange={(e) => setRow(i, { barcode: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label htmlFor={`pk-price-${i}`} className="block text-sm text-ink-soft mb-1">Precio de venta (vacío = automático)</label>
                                <input id={`pk-price-${i}`} type="number" min="0" step="0.01" className="input-base" value={row.salePrice ?? ''}
                                    placeholder={suggestion} onChange={(e) => setRow(i, { salePrice: e.target.value })} />
                            </div>
                            <Button type="button" variant="danger" size="sm" aria-label={`Quitar empaque ${n}`}
                                onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
                        </div>
                    </div>
                );
            })}
            <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, { name: '', factor: 1, unitCode: 6 }])}>
                <Plus size={16} /> Agregar empaque
            </Button>
        </div>
    );
};

export default PackagingsEditor;
