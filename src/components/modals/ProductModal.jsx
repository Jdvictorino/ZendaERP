import React, { useState, useEffect } from 'react';
import { Loader2, Check, X, Settings, Trash2, ArrowLeft } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SupplierModal from './SupplierModal.jsx';
import toast from 'react-hot-toast';
import ConfirmationModal from './ConfirmationModal.jsx';
import api from '../../api/client.js';

// --- Componente: Modal para Gestionar Categorías ---
const ManageCategoriesModal = ({ onClose, categories, handleDeleteCategory, isMasterUser }) => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-md">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">Gestionar Categorías</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
                {(categories || []).map(cat => (
                    <div key={cat.id} className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-2 bg-gray-50 rounded-lg gap-2">
                        <span>{cat.name}</span>
                        {isMasterUser && (
                            <Button variant="danger" size="sm" onClick={() => handleDeleteCategory(cat)} aria-label="Eliminar Categoría"><Trash2 size={16} /></Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
);


const ProductModal = ({ product, onClose, onSave, suppliers, categories, isMasterUser, onCategoryAdded, onSupplierAdded, fullPage = false }) => {
    const [formData, setFormData] = useState({ 
        name: '', salePrice: 0, purchasePrice: 0, stock: 0, stockThreshold: 5,
        code: '', imageUrl: '', supplierId: '', supplierName: '',
        categoryId: '', categoryName: '',
        taxStatus: 'Gravado (18%)'
    });
    const [showAddSupplier, setShowAddSupplier] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showManageCategories, setShowManageCategories] = useState(false);
    const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const suppliersAvailable = Array.isArray(suppliers) && suppliers.length > 0;

    useEffect(() => {
        if (product && product.id) {
            setFormData({
                name: product.name || '', salePrice: product.salePrice || 0,
                purchasePrice: product.purchasePrice || 0, stock: product.stock || 0,
                stockThreshold: product.stockThreshold || 5, code: product.code || '',
                imageUrl: product.imageUrl || '', supplierId: product.supplierId || '',
                supplierName: product.supplierName || '', categoryId: product.categoryId || '',
                categoryName: product.categoryName || '',
                taxStatus: product.taxStatus || 'Gravado (18%)',
            });
        }
    }, [product]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === "supplierId") {
            if (value === "add_new") setShowAddSupplier(true);
            else {
                const selectedSupplier = (suppliers || []).find(s => s && s.id === value);
                setFormData(prev => ({ ...prev, supplierId: value, supplierName: selectedSupplier ? selectedSupplier.name : '' }));
            }
        } else if (name === "categoryId") {
            if (value === "add_new") setShowAddCategory(true);
            else {
                const selectedCategory = (categories || []).find(c => c && c.id === value);
                setFormData(prev => ({ ...prev, categoryId: value, categoryName: selectedCategory ? selectedCategory.name : '' }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData(prev => ({ ...prev, imageUrl: reader.result }));
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { id, ...dataToSave } = formData;
            await onSave(dataToSave);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewSupplierSave = async (supplierData) => {
        try {
            const result = await api.post('/suppliers', { ...supplierData, status: 'active' });
            setFormData(prev => ({ ...prev, supplierId: result.id, supplierName: supplierData.name }));
            setShowAddSupplier(false);
            onSupplierAdded?.();
        } catch (error) {
            console.error('Error al crear proveedor:', error);
            toast.error('No se pudo crear el proveedor');
        }
    };

    const handleNewCategorySave = async () => {
        if (!newCategoryName.trim()) return;
        const newCategory = { name: newCategoryName.trim() };
        
        const promise = api.post('/categories', newCategory).then((result) => {
            setFormData(prev => ({ ...prev, categoryId: result.id, categoryName: newCategory.name }));
            setShowAddCategory(false);
            setNewCategoryName('');
            onCategoryAdded?.();
        });

        toast.promise(promise, {
            loading: 'Guardando categoría...',
            success: '¡Categoría guardada!',
            error: 'No se pudo guardar.'
        });
    };

    const handleDeleteCategory = async () => {
        if (!confirmDeleteCategory) return;
        const promise = api.delete(`/categories/${confirmDeleteCategory.id}`);

        await toast.promise(promise, {
            loading: 'Eliminando categoría...',
            success: '¡Categoría eliminada!',
            error: 'No se pudo eliminar.'
        });
        setConfirmDeleteCategory(null);
    };

    return (
        <>
            <div className={fullPage ? 'w-full' : 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'}>
                <div className={fullPage ? 'bg-white rounded-2xl shadow-card p-6 w-full' : 'bg-white rounded-2xl shadow-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto'}>
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                        <div className="flex items-center gap-2">
                            {fullPage && (
                                <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Salir">
                                    <ArrowLeft size={22} strokeWidth={2.5} />
                                </button>
                            )}
                            <h3 className="text-lg md:text-2xl font-semibold text-gray-900">{product?.id ? 'Modificar Producto' : 'Nuevo Producto Base'}</h3>
                        </div>
                        {!fullPage && <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>}
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-gray-700 mb-1">Nombre</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-base" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-gray-700 mb-1">Precio Compra</label><input type="number" name="purchasePrice" value={formData.purchasePrice} onChange={handleChange} className="input-base" required min="0" step="0.01" /></div>
                            <div>
                                <label className="block text-gray-700 mb-1">Precio Venta</label>
                                <input type="number" name="salePrice" value={formData.salePrice} onChange={handleChange} className="input-base" required min="0" step="0.01" />
                                <p className="text-xs text-gray-500 mt-1">Precio final (ITBIS incluido).</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-gray-700 mb-1">Stock Inicial</label>
                                <input type="number" name="stock" value={formData.stock} onChange={handleChange} className="input-base" required min="0" />
                            </div>
                            <div>
                                <label className="block text-gray-700 mb-1">Alerta Stock Mínimo</label>
                                <input type="number" name="stockThreshold" value={formData.stockThreshold} onChange={handleChange} className="input-base" required min="0" />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-gray-700 mb-1">Estado Fiscal</label>
                            <select name="taxStatus" value={formData.taxStatus} onChange={handleChange} className="input-base">
                                <option>Gravado (18%)</option>
                                <option>Exento</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-700 mb-1">Categoría</label>
                            <div className="flex items-center gap-2">
                                <select name="categoryId" value={formData.categoryId} onChange={handleChange} className="input-base">
                                    <option value="">-- Sin Categoría --</option>
                                    {(categories || []).filter(c => c && c.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    <option value="add_new" className="font-bold text-indigo-600">+ Añadir Nueva Categoría</option>
                                </select>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setShowManageCategories(true)} title="Gestionar Categorías"><Settings size={20} /></Button>
                            </div>
                        </div>
                        
                        {showAddCategory && (
                            <div className="p-3 border rounded-lg bg-gray-50">
                                <label className="block text-sm font-medium text-gray-700">Nombre de la Nueva Categoría</label>
                                <div className="mt-1 flex gap-2">
                                    <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="input-base" placeholder="Ej: Tazas Personalizadas"/>
                                    <Button type="button" variant="primary" size="sm" onClick={handleNewCategorySave}><Check size={20}/></Button>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddCategory(false)}><X size={20}/></Button>
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-gray-700 mb-1">Proveedor</label>
                            <select name="supplierId" value={formData.supplierId} onChange={handleChange} className="input-base">
                                <option value="">-- Sin Proveedor --</option>
                                {(suppliers || []).filter(s => s && s.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                <option value="add_new" className="font-bold text-indigo-600">+ Añadir Nuevo Proveedor</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="imageUrl" className="block text-gray-700 mb-1">Imagen de Muestra</label>
                            <input type="file" id="imageUrl" name="imageUrl" onChange={handleImageChange} className="input-base" accept="image/*" />
                            {formData.imageUrl && <img src={formData.imageUrl} alt="Preview" className="mt-4 w-24 h-24 object-cover rounded-md"/>}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-4">
                            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                            <Button type="submit" disabled={isLoading} className="w-28">
                                {isLoading ? <Loader2 className="animate-spin" /> : 'Guardar'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {showManageCategories && !confirmDeleteCategory && <ManageCategoriesModal 
                onClose={() => setShowManageCategories(false)} 
                categories={categories}
                handleDeleteCategory={(cat) => setConfirmDeleteCategory(cat)}
                isMasterUser={isMasterUser}
            />}
            
            <ConfirmationModal 
                show={!!confirmDeleteCategory}
                onClose={() => setConfirmDeleteCategory(null)}
                onConfirm={handleDeleteCategory}
                title="Eliminar Categoría"
                message={`¿Estás seguro de que quieres eliminar la categoría "${confirmDeleteCategory?.name}"? Esta acción es permanente.`}
            />

            {showAddSupplier && <SupplierModal onSave={handleNewSupplierSave} isQuickAdd={true} onClose={() => setShowAddSupplier(false)} supplier={{}} />}
        </>
    );
};

export default ProductModal;
