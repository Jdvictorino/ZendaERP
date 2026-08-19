import React, { useState, useEffect } from 'react';
import { Loader2, Upload, Trash2, Palette } from 'lucide-react';
import { products as productsApi } from '../../api/client.js';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Button from '../ui/Button.jsx';

const VariantModal = ({ product, onClose, companyProfile }) => {
    const [newVariant, setNewVariant] = useState({
        name: '', imageUrl: '', purchasePrice: 0, salePrice: 0, stock: 0,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [variants, setVariants] = useState([]);
    const [variantsLoading, setVariantsLoading] = useState(true);
    const currency = companyProfile?.currency || 'USD';

    // Cargar variantes del producto
    useEffect(() => {
        const loadVariants = async () => {
            if (!product?.id) return;
            setVariantsLoading(true);
            try {
                const result = await productsApi.getVariants(product.id);
                setVariants(result.data || []);
            } catch (error) {
                console.error('Error cargando variantes:', error);
                toast.error('Error cargando variantes');
            } finally {
                setVariantsLoading(false);
            }
        };
        loadVariants();
    }, [product?.id]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setNewVariant(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setNewVariant(prev => ({ ...prev, imageUrl: reader.result }));
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSaveVariant = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const variantData = {
                ...newVariant,
                purchasePrice: parseFloat(newVariant.purchasePrice) || 0,
                salePrice: parseFloat(newVariant.salePrice) || 0,
                stock: parseInt(newVariant.stock, 10) || 0
            };

            const created = await productsApi.createVariant(product.id, variantData);

            toast.success('¡Variante guardada con éxito!');
            setVariants(prev => [created, ...prev]);
            setNewVariant({ name: '', imageUrl: '', purchasePrice: 0, salePrice: 0, stock: 0 });

        } catch (error) {
            console.error("Error guardando variante:", error);
            toast.error('No se pudo guardar la variante.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDeleteVariant = async (variantId) => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar esta variante?")) return;
        try {
            await productsApi.deleteVariant(product.id, variantId);
            toast.success('¡Variante eliminada!');
            setVariants(prev => prev.filter(v => v.id !== variantId));
        } catch (error) {
            console.error("Error eliminando variante:", error);
            toast.error('No se pudo eliminar.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b pb-4">
                    <div>
                        <h3 className="text-2xl font-bold flex items-center gap-2"><Palette /> Gestionar Variantes</h3>
                        <p className="text-gray-600">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-y-auto">
                    {/* Columna del formulario */}
                    <div className="p-4 border rounded-lg">
                        <h4 className="text-lg font-semibold mb-4">Añadir Nueva Variante</h4>
                        <form onSubmit={handleSaveVariant} className="space-y-4">
                            <img src={newVariant.imageUrl || 'https://placehold.co/150x150/e2e8f0/a0aec0?text=Foto'} alt="Previsualización" className="w-32 h-32 object-cover rounded-lg mx-auto mb-2"/>
                            <input type="file" required onChange={handleImageChange} className="text-sm" />
                            <input name="name" value={newVariant.name} onChange={handleChange} placeholder="Nombre (ej. Rojo, Azul)" className="input-base" required />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" name="purchasePrice" value={newVariant.purchasePrice} onChange={handleChange} placeholder="Precio Compra" className="input-base" step="0.01" />
                                <input type="number" name="salePrice" value={newVariant.salePrice} onChange={handleChange} placeholder="Precio Venta" className="input-base" step="0.01" required />
                            </div>
                            <input type="number" name="stock" value={newVariant.stock} onChange={handleChange} placeholder="Stock de esta variante" className="input-base" required />
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? 'Guardando...' : 'Añadir Variante'}
                            </Button>
                        </form>
                    </div>

                    {/* Columna de la lista */}
                    <div className="p-4 border rounded-lg overflow-y-auto">
                        <h4 className="text-lg font-semibold mb-4">Variantes Existentes</h4>
                        {variantsLoading && <p>Cargando variantes...</p>}
                        <div className="space-y-3">
                            {(variants || []).map(variant => (
                                <div key={variant.id} className="flex items-center gap-4 p-2 border rounded-lg">
                                    <img src={variant.imageUrl} alt={variant.name} className="w-16 h-16 object-cover rounded-md" />
                                    <div className="flex-1">
                                        <p className="font-semibold">{variant.name}</p>
                                        <p className="text-sm">Venta: {formatCurrency(variant.salePrice, currency)} | Stock: {variant.stock}</p>
                                    </div>
                                    <Button variant="ghost" onClick={() => handleDeleteVariant(variant.id)} className="text-red-600 hover:text-red-700">
                                        <Trash2 size={18} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VariantModal;