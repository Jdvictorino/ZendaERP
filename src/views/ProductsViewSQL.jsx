/**
 * ProductsView - Versión migrada a PostgreSQL API
 * 
 * Este archivo muestra cómo migrar desde Firebase a la nueva API REST.
 * Reemplaza las operaciones de Firestore por llamadas al backend.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Trash2, AlertTriangle, History, Loader2, Package, PlusCircle, Palette, Settings, Download, Printer, PackagePlus, Power, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { formatCurrency } from '../utils/formatCurrency.js';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import ProductModal from '../components/modals/ProductModal.jsx';
import StockModal from '../components/modals/StockModal.jsx';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import InventoryLogModal from '../components/modals/InventoryLogModal.jsx';
import VariantModal from '../components/modals/VariantModal.jsx';
import ProductsImportView from './ProductsImportViewSQL.jsx';
import { loadScript } from '../utils/loadScript.js';
import { isValidEAN13, generateUniqueEAN13 } from '../utils/ean.js';
import { generateUniqueSKU } from '../utils/sku.js';
import Button from '../components/ui/Button.jsx';
import Card, { CardHeader, CardBody } from '../components/ui/Card.jsx';
import { getInventoryAlerts, summarizeByLocation } from '../utils/inventory.js';

// ============================================
// NUEVAS IMPORTACIONES - API PostgreSQL
// ============================================
import { useApiCrud } from '../hooks/useApi.js';
import api from '../api/client.js';

const ProductsViewSQL = ({ companyProfile, isMasterUser }) => {
    // ============================================
    // CAMBIO PRINCIPAL: Usar useApiCrud en lugar de props de Firebase
    // ============================================
    const {
        data: products,
        loading,
        error,
        create,
        update,
        remove,
        refetch
    } = useApiCrud('/products');

    // Los suppliers y categories también vienen de la API ahora
    const { data: suppliers, refetch: refetchSuppliers } = useApiCrud('/suppliers');
    const { data: categories, refetch: refetchCategories } = useApiCrud('/categories');

    const [editingProduct, setEditingProduct] = useState(null);
    const [showStockModal, setShowStockModal] = useState(null);
    const [showInactive, setShowInactive] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [filterLowStock, setFilterLowStock] = useState(false);
    const [viewingHistory, setViewingHistory] = useState(null);
    const [showImportView, setShowImportView] = useState(false);
    const [editingVariants, setEditingVariants] = useState(null);
    const [showImportPanel, setShowImportPanel] = useState(false);
    const [isAssigningCodes, setIsAssigningCodes] = useState(false);
    const currency = companyProfile?.currency || 'USD';

    // ============================================
    // FUNCIONES AUXILIARES (sin cambios)
    // ============================================
    const generateRandomSuffix = (length = 3) => {
        const nums = '0123456789';
        let out = '';
        for (let i = 0; i < length; i++) out += nums.charAt(Math.floor(Math.random() * nums.length));
        return out;
    };

    const initialsPrefix = (name) => {
        if (!name) return 'PRD';
        const parts = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
        let letters = parts.slice(0, 4).map(p => p[0]).join('');
        if (letters.length < 4) {
            const flat = parts.join('');
            letters = (flat.substring(0, 4)).padEnd(4, 'X');
        }
        return letters;
    };

    const generateUniqueCode = useCallback((name) => {
        const prefix = initialsPrefix(name);
        const existing = new Set((products || []).map(p => (p.code || '').toString().toUpperCase()));
        
        for (let digits = 3; digits <= 6; digits++) {
            for (let n = 1; n < Math.pow(10, digits); n++) {
                const suffix = String(n).padStart(digits, '0');
                const candidate = `${prefix}${suffix}`;
                if (!existing.has(candidate)) return candidate;
            }
        }
        return `${prefix}${generateRandomSuffix(5)}`;
    }, [products]);

    const ensureEANAndSKU = useCallback((p) => {
        const existingBarcodes = new Set((products || []).map(x => (x.barcode || x.code || '').toString()));
        const existingSkus = new Set((products || []).map(x => (x.sku || '').toString()));
        let ean = (p.barcode || p.code || '').toString();
        if (!isValidEAN13(ean)) {
            ean = generateUniqueEAN13(existingBarcodes);
        }
        let sku = p.sku;
        if (!sku || !sku.trim()) {
            sku = generateUniqueSKU(p.name || 'PRD', existingSkus);
        }
        return { ...p, code: ean, barcode: ean, sku };
    }, [products]);

    const generateBarcodeDataUrl = async (code) => {
        await loadScript('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js');
        const canvas = document.createElement('canvas');
        try {
            window.JsBarcode(canvas, String(code), { format: 'ean13', displayValue: true, fontSize: 12, height: 64, width: 2, margin: 4 });
            return canvas.toDataURL('image/png');
        } catch (err) {
            console.error('Barcode generation error', err);
            return null;
        }
    };

    const printLabel = async (product) => {
        const p = ensureEANAndSKU(product);
        const barcodeDataUrl = await generateBarcodeDataUrl(p.barcode);
        const html = `
            <html>
            <head>
                <title>Etiqueta - ${p.name}</title>
                <style>body{font-family: Arial, Helvetica, sans-serif;padding:8px} .label{width:204px;height:72px;padding:8px;border:1px solid #ddd;box-sizing:border-box} .title{font-weight:700;font-size:12px} .price{font-size:12px;margin-top:4px} .meta{font-size:11px;color:#444;margin-top:4px} img{max-width:100%;height:auto;display:block;margin-top:6px}</style>
            </head>
            <body>
                <div class="label">
                    <div class="title">${p.name}</div>
                    <div class="meta">Código: ${p.code}</div>
                    <div class="meta">SKU: ${p.sku || ''}</div>
                    <div class="price">Precio: ${formatCurrency(p.salePrice || 0, currency)}</div>
                    <div style="margin-top:6px">${barcodeDataUrl ? `<img src="${barcodeDataUrl}" alt="${p.barcode}"/>` : '<div style="color:#c00">No se pudo generar barcode</div>'}</div>
                </div>
            </body>
            </html>
        `;
        const w = window.open('', '_blank', 'width=420,height=400');
        if (!w) { toast.error('Permita popups para imprimir etiquetas.'); return; }
        w.document.write(html);
        w.document.close();
        w.onload = () => { setTimeout(() => w.print(), 300); };
    };

    // ============================================
    // OPERACIONES CRUD - MIGRADAS A API REST
    // ============================================

    const handleSave = async (productData) => {
        const toSave = ensureEANAndSKU(productData);
        
        try {
            if (editingProduct && editingProduct.id) {
                // ANTES (Firebase):
                // await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/products`, editingProduct.id), toSave);
                
                // AHORA (API REST):
                await update(editingProduct.id, toSave);
            } else {
                // ANTES (Firebase):
                // await addDoc(collection(db, `artifacts/${appId}/users/${userId}/products`), { ...toSave, status: 'active' });
                
                // AHORA (API REST):
                await create({ ...toSave, status: 'active' });
            }
            
            playSuccessSound();
            toast.success('¡Producto guardado con éxito!');
            setEditingProduct(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo guardar el producto.');
            console.error('Error guardando producto:', err);
        }
    };

    const addStock = async (productId, currentStock, amount, reason = 'Ajuste manual de stock') => {
        if (!amount) return;
        
        try {
            // ANTES (Firebase): usaba writeBatch con update y set
            // AHORA (API REST): endpoint dedicado para ajuste de stock
            await api.products.adjustStock(productId, Number(amount), reason);
            
            playSuccessSound();
            toast.success('¡Stock actualizado!');
            refetch(); // Recargar datos
            setShowStockModal(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo actualizar el stock.');
            console.error('Error ajustando stock:', err);
        }
    };

    const toggleStatus = async (product) => {
        const newStatus = product.status === 'active' ? 'inactive' : 'active';
        
        try {
            // ANTES (Firebase):
            // await updateDoc(doc(db, `...`, product.id), { status: newStatus });
            
            // AHORA (API REST):
            await update(product.id, { status: newStatus });
            
            playSuccessSound();
            toast.success('¡Estado actualizado!');
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo actualizar el estado.');
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        
        try {
            // ANTES (Firebase):
            // await deleteDoc(doc(db, `...`, confirmDelete.id));
            
            // AHORA (API REST):
            await remove(confirmDelete.id);
            
            playSuccessSound();
            toast.success('¡Producto eliminado permanentemente!');
            setConfirmDelete(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo eliminar el producto.');
        }
    };

    // ============================================
    // CÁLCULOS Y FILTROS (sin cambios)
    // ============================================
    const inventoryAlerts = useMemo(() => getInventoryAlerts(products || [], companyProfile), [products, companyProfile]);
    const locationSummary = useMemo(() => summarizeByLocation(products || []), [products]);
    const locationImbalanceIds = useMemo(() => new Set((inventoryAlerts.locationImbalances || []).map(p => p.id)), [inventoryAlerts.locationImbalances]);

    // ============================================
    // ESTADOS DE CARGA Y ERROR
    // ============================================
    if (loading) {
        return (
            <div className="flex justify-center items-center h-full p-12">
                <Loader2 className="animate-spin text-gray-400" size={48} />
                <p className="ml-4 text-gray-500">Cargando productos...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-full p-12">
                <AlertTriangle className="text-red-500" size={48} />
                <p className="ml-4 text-red-500">Error: {error}</p>
                <Button variant="primary" onClick={refetch} className="ml-4">Reintentar</Button>
            </div>
        );
    }

    if (editingProduct) {
        return (
            <div>
                <ProductModal
                    product={editingProduct}
                    suppliers={suppliers || []}
                    categories={categories || []}
                    onSave={handleSave}
                    onClose={() => { setEditingProduct(null); refetch(); }}
                    onCategoryAdded={refetchCategories}
                    onSupplierAdded={refetchSuppliers}
                    isMasterUser={isMasterUser}
                    fullPage
                />
            </div>
        );
    }
    
    const filteredProducts = (products || []).filter(p => {
        const statusMatch = showInactive ? p.status === 'inactive' : p.status !== 'inactive';
        const lowStockMatch = filterLowStock ? (p.stock <= (p.minStock || 0)) : true;
        return statusMatch && lowStockMatch;
    });

    // ============================================
    // RENDER (igual que antes)
    // ============================================
    return (
        <div>
            <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center mb-6 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Inventario de productos
                </h2>
                <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2 w-full md:w-auto">
                    <Button variant={filterLowStock ? 'danger' : 'secondary'} size="md" className="w-full md:w-auto justify-center" onClick={() => setFilterLowStock(!filterLowStock)}>
                        <AlertTriangle size={16} className="mr-2" /> {filterLowStock ? 'Bajo Stock' : 'Filtrar Stock'}
                    </Button>
                    <Button variant="secondary" size="md" className="w-full md:w-auto justify-center" onClick={() => setShowInactive(!showInactive)}>
                        {showInactive ? 'Ver Activos' : 'Ver Inactivos'}
                    </Button>
                    <Button variant="secondary" size="md" className="w-full md:w-auto justify-center" onClick={() => setShowImportView(true)}>
                        <Upload size={16} className="mr-2" /> Importar Excel
                    </Button>
                    <Button variant="primary" size="md" className="col-span-2 md:col-span-1 w-full md:w-auto justify-center shadow-lg shadow-brand-500/20" onClick={() => setEditingProduct({})}>
                        <PlusCircle size={16} className="mr-2" /> Añadir productos
                    </Button>
                </div>
            </div>

            {/* Lista de productos */}
            <Card>
                <CardBody>
                    {filteredProducts.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Package size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No hay productos para mostrar</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {/* Desktop Table View */}
                            <table className="hidden lg:table min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">Img</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                                    {filteredProducts.map(product => (
                                        <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <td className="px-4 py-3 text-center">
                                                {product.imageUrl || product.photoUrl || product.image || product.photoURL ? (
                                                    <img src={product.imageUrl || product.photoUrl || product.image || product.photoURL} alt={product.name} className="w-10 h-10 object-cover rounded-md border inline-block" />
                                                ) : (
                                                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700">
                                                        <Package size={20} className="text-gray-400" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">{product.sku || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{product.code || product.barcode}</td>
                                            <td className="px-4 py-3 text-right text-sm font-medium dark:text-gray-100">{formatCurrency(product.salePrice || 0, currency)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    product.stock <= (product.minStock || 0) ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                                }`}>
                                                    {product.stock || 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingProduct(product)} title="Editar">
                                                        <Settings size={16} />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setShowStockModal(product)} title="Ajustar Stock">
                                                        <PackagePlus size={16} />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => printLabel(product)} title="Imprimir Etiqueta">
                                                        <Printer size={16} />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(product)} title={product.status === 'active' ? 'Desactivar' : 'Activar'}>
                                                        <Power size={16} className={product.status === 'active' ? 'text-green-500' : 'text-gray-400'} />
                                                    </Button>
                                                    {isMasterUser && (
                                                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(product)} title="Eliminar">
                                                            <Trash2 size={16} className="text-red-500" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Mobile Card View */}
                            <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-800">
                                {filteredProducts.map(product => (
                                    <div key={product.id} className="p-4 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
                                        <div className="flex gap-4">
                                            {/* Imagen del producto */}
                                            <div className="flex-shrink-0">
                                                {product.imageUrl || product.photoUrl || product.image || product.photoURL ? (
                                                    <img src={product.imageUrl || product.photoUrl || product.image || product.photoURL} alt={product.name} className="w-16 h-16 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm" />
                                                ) : (
                                                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700">
                                                        <Package size={28} className="text-gray-300 dark:text-gray-600" />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Info principal */}
                                            <div className="flex-grow min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate">{product.name}</h4>
                                                    <span className="font-bold text-brand-600 dark:text-brand-400">
                                                        {formatCurrency(product.salePrice || 0, currency)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                        {product.sku || product.code || 'S/C'}
                                                    </span>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                                        product.stock <= (product.minStock || 0) ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        Stock: {product.stock || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Acciones móviles */}
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-50 dark:border-gray-800">
                                            <div className="flex gap-1">
                                                <button onClick={() => setShowStockModal(product)} className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                                                    <PackagePlus size={18} />
                                                </button>
                                                <button onClick={() => printLabel(product)} className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                                                    <Printer size={18} />
                                                </button>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="secondary" onClick={() => setEditingProduct(product)}>
                                                    <Settings size={14} className="mr-1.5" /> Gestionar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* Modales */}
            {showStockModal && (
                <StockModal
                    product={showStockModal}
                    onSave={(amount, reason) => addStock(showStockModal.id, showStockModal.stock, amount, reason)}
                    onClose={() => setShowStockModal(null)}
                />
            )}

            {confirmDelete && (
                <ConfirmationModal
                    show={!!confirmDelete}
                    title="Eliminar Producto"
                    message={`¿Estás seguro de eliminar "${confirmDelete.name}"? Esta acción no se puede deshacer.`}
                    onConfirm={handleDelete}
                    onClose={() => setConfirmDelete(null)}
                />
            )}

            {/* Modal de importación de productos desde Excel */}
            {showImportView && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="text-xl font-bold">Importar Productos desde Excel</h3>
                            <button 
                                onClick={() => setShowImportView(false)} 
                                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4">
                            <ProductsImportView onImportComplete={() => { refetch(); setShowImportView(false); }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductsViewSQL;
