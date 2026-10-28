import React, { useState } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';
import { PLACEHOLDER_IMG } from '../../utils/placeholderImage.js';

const getColorClass = (colorName) => {
    const colors = {
        rojo: 'bg-red-500', azul: 'bg-blue-500', verde: 'bg-success-500',
        amarillo: 'bg-yellow-400', negro: 'bg-black', blanco: 'bg-white border border-gray-300',
        gris: 'bg-gray-400', morado: 'bg-purple-500', naranja: 'bg-orange-500', rosado: 'bg-pink-400',
    };
    return colors[colorName?.toLowerCase()] || 'bg-gray-200';
};

const CustomizeItemModal = ({ productData, onClose, onSave, companyProfile }) => {
    const { product, variants } = productData;
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState('');
    const [imageFiles, setImageFiles] = useState([]);
    const [customImageUrls, setCustomImageUrls] = useState([]);
    const currency = companyProfile?.currency || 'USD';

    const displayImage = selectedVariant ? selectedVariant.imageUrl : product.imageUrl;
    const displayPrice = selectedVariant ? selectedVariant.salePrice : product.salePrice;
    const maxStock = selectedVariant ? selectedVariant.stock : product.stock;

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer una imagen de personalización.'));
        reader.readAsDataURL(file);
    });

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        setImageFiles(files);
        try {
            const urls = await Promise.all(files.map(fileToDataUrl));
            setCustomImageUrls(urls.filter(Boolean));
        } catch (error) {
            console.error(error);
            toast.error('No se pudieron procesar las imágenes seleccionadas.');
            setCustomImageUrls([]);
        }
    };

    const handleSubmit = () => {
        if (quantity > maxStock) {
            toast.error(`Solo hay ${maxStock} unidades disponibles para esta variante.`);
            return;
        }
        
        const itemName = selectedVariant ? `${product.name} (${selectedVariant.name})` : product.name;

        onSave({
            productId: product.id,
            name: itemName,
            price: parseFloat(displayPrice || 0),
            quantity: parseInt(quantity, 10),
            sku: selectedVariant?.sku || selectedVariant?.code || product.sku || product.code || '',
            customizationNotes: notes,
            uploadedImageFiles: imageFiles,
            customImageUrls,
            variantInfo: selectedVariant ? { id: selectedVariant.id, name: selectedVariant.name, imageUrl: selectedVariant.imageUrl, sku: selectedVariant.sku || selectedVariant.code || '' } : null,
            // --- Se pasa el producto y la variante originales para que la siguiente función tenga la info fiscal ---
            source: { product, variant: selectedVariant } 
        });

        onClose();
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <div className="modal-panel p-6 w-full max-w-lg">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-ink">Personalizar: {product.name}</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                
                <div className="flex justify-center mb-4">
                    <img src={displayImage || PLACEHOLDER_IMG} alt="Vista previa" className="w-48 h-48 object-cover rounded-lg shadow-sm"/>
                </div>

                {variants.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-ink-soft mb-2 font-semibold">Seleccionar Variante:</label>
                        <div className="flex flex-wrap gap-3">
                            <div onClick={() => setSelectedVariant(null)} className={`w-8 h-8 rounded-full cursor-pointer bg-surface border-2 border-line ${!selectedVariant ? 'ring-2 ring-offset-2 ring-brand-500' : ''}`} title="Default"></div>
                            {variants.map(variant => (
                                <div key={variant.id} onClick={() => setSelectedVariant(variant)} className={`w-8 h-8 rounded-full cursor-pointer ${getColorClass(variant.name)} ${selectedVariant?.id === variant.id ? 'ring-2 ring-offset-2 ring-brand-500' : ''}`} title={variant.name}></div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-ink-soft mb-1">Cantidad (Disponibles: {maxStock})</label>
                    <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="input-base" min="1" max={maxStock} required />
                </div>
                <div className="mb-4">
                    <label className="block text-ink-soft mb-1">Notas de Personalización</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-base" rows="3" placeholder="Ej: Poner el nombre 'Ana' en la espalda..."/>
                </div>
                <div className="mb-4">
                    <label className="block text-ink-soft mb-1">Cargar Imágenes de Diseño</label>
                    <input type="file" multiple onChange={handleImageUpload} className="input-base" accept="image/*" />
                </div>
                
                <div className="flex justify-end items-center gap-4 mt-6">
                    <span className="text-2xl font-bold">{formatCurrency(displayPrice * quantity, currency)}</span>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="button" onClick={handleSubmit}>Añadir al Pedido</Button>
                </div>
            </div>
        </div>
    );
};

export default CustomizeItemModal;
