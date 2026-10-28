import React, { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import toast from 'react-hot-toast';
import { createCoupon, updateCoupon } from '../../utils/offers.js';
import { products as productsApi, categories as categoriesApi } from '../../api/client.js';

const emptyModel = {
  code: '',
  type: 'percentage',
  value: 10,
  appliesTo: 'all',
  productIds: [],
  categoryIds: [],
  startAt: '',
  endAt: '',
  usageLimit: '',
  perUserLimit: '',
  active: true
};

const CouponModal = ({ show, onClose, editing = null, fullPage = false }) => {
  const [form, setForm] = useState(emptyModel);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar productos y categorías
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [productsResult, categoriesResult] = await Promise.all([
          productsApi.list(),
          categoriesApi.list()
        ]);
        setProducts(productsResult.data || []);
        setCategories(categoriesResult.data || []);
      } catch (err) {
        console.error('Error cargando datos:', err);
      } finally {
        setLoading(false);
      }
    };
    if (show) loadData();
  }, [show]);

  useEffect(() => {
    if (editing && editing.id) {
      setForm({
        code: editing.code || '',
        type: editing.type || 'percentage',
        value: editing.value || 0,
        appliesTo: editing.appliesTo || 'all',
        productIds: editing.productIds || [],
        categoryIds: editing.categoryIds || [],
        startAt: editing.startAt ? new Date(editing.startAt).toISOString().slice(0, 16) : '',
        endAt: editing.endAt ? new Date(editing.endAt).toISOString().slice(0, 16) : '',
        usageLimit: editing.usageLimit || '',
        perUserLimit: editing.perUserLimit || '',
        active: editing.active !== false
      });
    } else {
      setForm(emptyModel);
    }
  }, [editing]);

  const handleChange = (e) => {
    const { name, value, type, checked, selectedOptions } = e.target;
    if (type === 'select-multiple') {
      const vals = Array.from(selectedOptions).map(o => o.value);
      setForm(prev => ({ ...prev, [name]: vals }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.code) return toast.error('El código es obligatorio');
    if (!form.value || Number(form.value) <= 0) return toast.error('Valor inválido');

    setSaving(true);
    try {
      if (editing && editing.id) {
        await updateCoupon(editing.id, form);
        toast.success('Cupón actualizado');
      } else {
        await createCoupon(form);
        toast.success('Cupón creado');
      }
      onClose(true); // Indicar que hubo cambios para refetch
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el cupón');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className={fullPage ? 'w-full' : 'fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4'}>
      <div className={fullPage ? 'modal-panel p-6 w-full' : 'modal-panel p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto'}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {fullPage && (
              <button type="button" onClick={() => onClose(false)} className="modal-close" aria-label="Salir">
                <ArrowLeft size={22} strokeWidth={2.5} />
              </button>
            )}
            <h3 className="text-lg font-semibold">{editing ? 'Editar Cupón' : 'Nuevo Cupón'}</h3>
          </div>
          {!fullPage && <button  onClick={onClose} aria-label="Cerrar" className="modal-close"><X size={18} /></button>}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm text-ink-soft">Código</label>
            <input name="code" value={form.code} onChange={handleChange} className="input-base" placeholder="EJ: PROMO10" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-soft">Tipo</label>
              <select name="type" value={form.type} onChange={handleChange} className="input-base">
                <option value="percentage">Porcentaje</option>
                <option value="fixed">Importe fijo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-soft">Valor</label>
              <input name="value" type="number" value={form.value} onChange={handleChange} className="input-base" min="0" step="0.01" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-ink-soft">Aplica a</label>
            <select name="appliesTo" value={form.appliesTo} onChange={handleChange} className="input-base">
              <option value="all">Todo el carrito</option>
              <option value="product">Productos específicos</option>
              <option value="category">Categorías específicas</option>
            </select>
            <p className="text-xs text-ink-muted mt-1">Si eliges productos o categorías, introduce una lista separada por comas en los campos correspondientes.</p>
          </div>

          <div>
            <label className="block text-sm text-ink-soft">Productos (selección múltiple)</label>
            {products && products.length > 0 ? (
              <select name="productIds" multiple value={form.productIds} onChange={handleChange} className="input-base h-32">
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.sku || p.code || p.id}</option>
                ))}
              </select>
            ) : (
              <input name="productIds" value={Array.isArray(form.productIds) ? form.productIds.join(',') : form.productIds} onChange={handleChange} className="input-base" />
            )}
            <p className="text-xs text-ink-muted mt-1">También puedes pegar IDs separados por comas si lo prefieres.</p>
          </div>

          <div>
            <label className="block text-sm text-ink-soft">Categorías (selección múltiple)</label>
            {categories && categories.length > 0 ? (
              <select name="categoryIds" multiple value={form.categoryIds} onChange={handleChange} className="input-base h-32">
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.id}</option>
                ))}
              </select>
            ) : (
              <input name="categoryIds" value={Array.isArray(form.categoryIds) ? form.categoryIds.join(',') : form.categoryIds} onChange={handleChange} className="input-base" />
            )}
            <p className="text-xs text-ink-muted mt-1">También puedes pegar IDs separados por comas si lo prefieres.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-soft">Inicio</label>
              <input name="startAt" value={form.startAt} onChange={handleChange} type="datetime-local" className="input-base" />
            </div>
            <div>
              <label className="block text-sm text-ink-soft">Fin</label>
              <input name="endAt" value={form.endAt} onChange={handleChange} type="datetime-local" className="input-base" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-soft">Límite de usos (total)</label>
              <input name="usageLimit" value={form.usageLimit} onChange={handleChange} type="number" className="input-base" />
            </div>
            <div>
              <label className="block text-sm text-ink-soft">Límite por usuario</label>
              <input name="perUserLimit" value={form.perUserLimit} onChange={handleChange} type="number" className="input-base" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="active" checked={!!form.active} onChange={handleChange} />
              <span className="text-sm text-ink-soft">Activo</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CouponModal;
