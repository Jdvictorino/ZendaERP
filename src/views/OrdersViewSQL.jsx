/**
 * Vista de Pedidos - Versión SQL
 * Migrada de Firebase a PostgreSQL API
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { XCircle, UserPlus, Plus, Minus, ShoppingCart, Loader2, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatCurrency.js';
import { generatePDF } from '../utils/pdfGenerator.js';
import { generateThermalReceiptHTML } from '../utils/escposGenerator.js';
import { printEscPosReceipt } from '../utils/printer.js';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import notificationService from '../utils/notificationService.js';
import CustomizeItemModal from '../components/modals/CustomizeItemModal.jsx';
import CustomerModal from '../components/modals/CustomerModal.jsx';
import PostOrderActionsModal from '../components/modals/PostOrderActionsModal.jsx';
import BillingTypeModal from '../components/modals/BillingTypeModal.jsx';
import PaymentModal from '../components/modals/PaymentModal.jsx';
import ScannerLinkModal from '../components/modals/ScannerLinkModal.jsx';
import { v4 as uuidv4 } from 'uuid';
import Button from '../components/ui/Button.jsx';
import Segmented from '../components/ui/Segmented.jsx';
import api from '../api/client.js';
import { useApiCrud } from '../hooks/useApi.js';
import { useScanner } from '../context/ScannerContext.jsx';
import { PLACEHOLDER_IMG } from '../utils/placeholderImage.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';

const getColorClass = (colorName) => {
    const colors = {
        rojo: 'bg-red-500', azul: 'bg-blue-500', verde: 'bg-success-500',
        amarillo: 'bg-yellow-400', negro: 'bg-black', blanco: 'bg-white border border-gray-300',
        gris: 'bg-gray-400', morado: 'bg-purple-500', naranja: 'bg-orange-500', rosado: 'bg-pink-400',
    };
    return colors[colorName?.toLowerCase()] || 'bg-gray-200';
};

const parseDiscountNumber = (value) => {
    if (value == null || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const resolveCategoryDiscount = (category, discounts = {}) => {
    if (!category || !discounts) return undefined;
    if (Object.prototype.hasOwnProperty.call(discounts, category)) {
        return parseDiscountNumber(discounts[category]);
    }
    const matchKey = Object.keys(discounts).find(key => key?.toLowerCase?.() === category.toLowerCase());
    return matchKey ? parseDiscountNumber(discounts[matchKey]) : undefined;
};

const formatCustomerLabel = (customer) => {
    if (!customer) return '';
    const pieces = [
        customer.name || 'Cliente sin nombre',
        customer.customerCode ? `#${customer.customerCode}` : null,
        customer.identificationNumber || customer.rnc || null,
    ].filter(Boolean);
    return pieces.join(' · ');
};

const OrdersViewSQL = ({ companyProfile, currentUserProfile, setView }) => {
    const [cart, setCart] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [barcodeScan, setBarcodeScan] = useState('');
    const [showScannerModal, setShowScannerModal] = useState(false);
    
    // Escáner Context
    const { 
        isConnected, 
        linkedDeviceName, 
        scannerSessionId, 
        disconnectDevice, 
        registerScanHandler, 
        unregisterScanHandler,
        initSession
    } = useScanner();

    const [customizingItem, setCustomizingItem] = useState(null);
    const [editingCartItem, setEditingCartItem] = useState(null);
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState('percentage');
    const [customerType, setCustomerType] = useState('existing');
    const [guestCustomer, setGuestCustomer] = useState({ name: '', phone: '' });
    const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
    const [createdOrder, setCreatedOrder] = useState(null);
    const [deliveryType, setDeliveryType] = useState('pickup');
    const [guestAddress, setGuestAddress] = useState({ street: '', city: '', postalCode: '', phone: '' });
    const [billingOrder, setBillingOrder] = useState(null);
    const [paymentForOrder, setPaymentForOrder] = useState(null);
    const [isBillAndPayFlow, setIsBillAndPayFlow] = useState(false);
    const [displayImages, setDisplayImages] = useState({});
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [automaticDiscountInfo, setAutomaticDiscountInfo] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const dropdownBlurTimeout = useRef(null);

    // Cargar datos desde API
    const { data: productsData, loading: loadingProducts } = useApiCrud('/products');
    const { data: customersData, loading: loadingCustomers, refetch: refetchCustomers } = useApiCrud('/customers');

    // La API devuelve arrays directamente (el hook ya extrae .data de la respuesta)
    const rawProducts = Array.isArray(productsData) ? productsData : (productsData?.data || []);
    const customers = Array.isArray(customersData) ? customersData : (customersData?.data || []);
    const safeCustomers = customers || [];
    
    // Transformar productos para agregar taxStatus basado en taxRate/isTaxable
    const products = rawProducts.map(p => ({
        ...p,
        taxStatus: p.taxStatus || (p.isTaxable || p.taxRate > 0 ? `Gravado (${p.taxRate || 18}%)` : 'Exento'),
    }));
    const safeProducts = products || [];
    
    const normalizedRole = (currentUserProfile?.role || '').toLowerCase();
    const canEditManualDiscount = normalizedRole === 'admin' || normalizedRole === 'manager';

    const activeCustomers = useMemo(() => safeCustomers.filter(c => c.status !== 'inactive'), [safeCustomers]);
    const activeProducts = useMemo(() => safeProducts.filter(p => p.status !== 'inactive' && p.stock > 0), [safeProducts]);
    const filteredProducts = useMemo(() => activeProducts.filter(p => p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())), [activeProducts, searchTerm]);

    useEffect(() => {
        if (selectedCustomer) {
            const customer = safeCustomers.find(c => c.id === selectedCustomer);
            if (customer) {
                const categoryLabel = customer.category && customer.category.trim() ? customer.category : 'Sin categoría';
                const categoryDiscounts = companyProfile?.pricing?.categoryDiscounts || {};
                const fallbackCategoryDiscount = resolveCategoryDiscount(categoryLabel, categoryDiscounts);
                const customerSpecificDiscount = parseDiscountNumber(customer.defaultDiscount);
                const hasCustomerSpecific = customerSpecificDiscount > 0;
                const applied = hasCustomerSpecific ? customerSpecificDiscount : (fallbackCategoryDiscount ?? 0);
                setDiscountType('percentage');
                setDiscount(applied || 0);
                if (applied > 0) {
                    setAutomaticDiscountInfo({
                        value: applied,
                        source: hasCustomerSpecific ? 'cliente' : 'categoría',
                        detail: hasCustomerSpecific ? customer.name : categoryLabel,
                    });
                } else {
                    setAutomaticDiscountInfo(null);
                }
                setCustomerSearchTerm(formatCustomerLabel(customer));
                return;
            }
        }
        setAutomaticDiscountInfo(null);
        if (!selectedCustomer) {
            setDiscount(0);
        }
    }, [selectedCustomer, safeCustomers, companyProfile]);

    useEffect(() => {
        if (customerType === 'guest') {
            setSelectedCustomer('');
            setCustomerSearchTerm('');
        }
    }, [customerType]);

    useEffect(() => {
        return () => {
            if (dropdownBlurTimeout.current) {
                clearTimeout(dropdownBlurTimeout.current);
            }
        };
    }, []);

    const handleCartUpdate = (cartId, newQuantity) => {
        setCart(currentCart => {
            if (newQuantity <= 0) return currentCart.filter(item => item.cartId !== cartId);
            
            const itemToUpdate = currentCart.find(item => item.cartId === cartId);
            if (!itemToUpdate) return currentCart;
            
            const productStock = itemToUpdate.source?.product?.stock || 0;
            const otherCartItemsQty = currentCart
                .filter(item => item.cartId !== cartId && item.productId === itemToUpdate.productId)
                .reduce((sum, item) => sum + item.quantity, 0);
                
            if (otherCartItemsQty + newQuantity > productStock) {
                toast.error(`Stock insuficiente. Solo quedan ${productStock} unidades disponibles.`);
                const maxAllowed = Math.max(1, productStock - otherCartItemsQty);
                if (itemToUpdate.quantity === maxAllowed) return currentCart;
                return currentCart.map(item => item.cartId === cartId ? { ...item, quantity: maxAllowed } : item);
            }
            
            return currentCart.map(item => item.cartId === cartId ? { ...item, quantity: newQuantity } : item);
        });
    };

    const handleAddToCart = (customizedItem) => {
        const { product, variant } = customizedItem.source;
        const requestedQuantity = customizedItem.quantity || 1;
        
        // Verificar stock usando el carrito actual
        const currentQty = cart.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
        if (currentQty + requestedQuantity > product.stock) {
            toast.error(`No hay stock suficiente. Tienes ${currentQty} en el carrito y solo quedan ${product.stock} disponibles.`);
            return;
        }

        const finalPrice = customizedItem.price;
        let basePrice = finalPrice;
        let itbisAmount = 0;
        const taxStatus = variant?.taxStatus || product.taxStatus;
        const taxRate = variant?.taxRate ?? product.taxRate ?? 18;
        const isTaxable = variant?.isTaxable ?? product.isTaxable ?? (taxStatus && taxStatus.includes('Gravado'));
        const categoryId = customizedItem.categoryId || product.categoryId || product.category || null;
        
        // Calcular base e ITBIS si está gravado
        if (isTaxable && taxRate > 0) {
            basePrice = finalPrice / (1 + taxRate / 100);
            itbisAmount = finalPrice - basePrice;
        }
        const itemToAdd = { ...customizedItem, basePrice, itbisAmount, taxStatus, taxRate, isTaxable, categoryId, cartId: Date.now() };
        setCart(currentCart => [...currentCart, itemToAdd]);
        setCustomizingItem(null);
    };

    const processScannedBarcode = useCallback((rawCode) => {
        if (!rawCode) return;
        const codeOriginal = String(rawCode).trim();
        const codeNumeric = codeOriginal.replace(/\D/g, ''); // Solo números por si trae fantasmas
        
        // Buscar el producto en safeProducts
        const found = safeProducts.find(p => {
            const pb = p.barcode ? String(p.barcode).trim() : '';
            const pc = p.code ? String(p.code).trim() : '';
            return pb === codeOriginal || pc === codeOriginal || 
                   (codeNumeric && (pb === codeNumeric || pc === codeNumeric));
        });
        
        if (found) {
            // Verificar si ya está en el carrito para aumentar cantidad
            setCart(currentCart => {
                const currentTotalQty = currentCart
                    .filter(item => item.productId === found.id || item.source?.product?.id === found.id)
                    .reduce((sum, item) => sum + item.quantity, 0);
                
                if (currentTotalQty + 1 > found.stock) {
                    toast.error(`Stock insuficiente de ${found.name}. Máximo ${found.stock} en inventario.`);
                    return currentCart;
                }

                const existingItem = currentCart.find(item => item.source.product.id === found.id);
                if (existingItem) {
                    toast.success(`+1 ${found.name}`);
                    return currentCart.map(item => 
                        item.cartId === existingItem.cartId 
                            ? { ...item, quantity: item.quantity + 1 } 
                            : item
                    );
                }

                // Si no está, agregarlo nuevo
                toast.success(`Agregado: ${found.name}`);
                const finalPrice = found.salePrice || 0;
                let basePrice = finalPrice;
                let itbisAmount = 0;
                const taxRate = found.taxRate ?? 18;
                const taxStatus = found.taxStatus || 'Exento';
                const isTaxable = found.isTaxable ?? (taxStatus && taxStatus.includes('Gravado'));
                
                if (isTaxable && taxRate > 0) {
                    basePrice = finalPrice / (1 + taxRate / 100);
                    itbisAmount = finalPrice - basePrice;
                }

                const newItem = {
                    name: found.name,
                    productId: found.id,
                    imageUrl: found.imageUrl,
                    price: finalPrice,
                    basePrice,
                    itbisAmount,
                    taxStatus,
                    taxRate,
                    isTaxable,
                    quantity: 1,
                    categoryId: found.categoryId || found.category || null,
                    source: { product: found, variant: null },
                    uploadedImageFiles: [],
                    customImageUrls: [],
                    variantInfo: null,
                    cartId: Date.now()
                };
                return [...currentCart, newItem];
            });
            setBarcodeScan('');
        } else {
            console.warn("Código escaneado no encontrado:", codeOriginal);
            toast.error(`Producto con código ${codeOriginal} no encontrado.`);
        }
    }, [safeProducts, setCart, setBarcodeScan]);

    useEffect(() => {
        registerScanHandler(processScannedBarcode);
        return () => {
            unregisterScanHandler();
        };
    }, [processScannedBarcode, registerScanHandler, unregisterScanHandler]);

    const taxSummary = useMemo(() => {
        const montoGravado = cart.reduce((sum, item) => (item.isTaxable || (item.taxStatus && item.taxStatus.includes('Gravado'))) ? sum + (item.basePrice * item.quantity) : sum, 0);
        const montoExento = cart.reduce((sum, item) => (!item.isTaxable && (!item.taxStatus || item.taxStatus === 'Exento')) ? sum + (item.basePrice * item.quantity) : sum, 0);
        const subtotal = montoGravado + montoExento;
        const itbis = cart.reduce((sum, item) => sum + (item.itbisAmount * item.quantity), 0);
        const discountAmount = discountType === 'percentage' ? subtotal * (discount / 100) : Math.min(subtotal, discount);
        const total = subtotal - discountAmount + itbis;
        return { montoGravado, montoExento, subtotal, itbis, discountAmount, total };
    }, [cart, discount, discountType]);

    const orderTotal = Math.max(0, taxSummary.total);

    const normalizedCustomerSearch = customerSearchTerm.trim().toLowerCase();
    const customerOptions = useMemo(() => {
        if (customerType !== 'existing') return [];
        const list = activeCustomers.filter((customer) => {
            if (!normalizedCustomerSearch) return true;
            const haystack = [
                customer.name,
                customer.rnc,
                customer.customerCode,
                customer.email,
                customer.phone,
            ].filter(Boolean).map(value => value.toString().toLowerCase());
            return haystack.some(entry => entry.includes(normalizedCustomerSearch));
        });
        return list.slice(0, 25);
    }, [activeCustomers, normalizedCustomerSearch, customerType]);

    const handleCustomerSearchChange = (value) => {
        setCustomerSearchTerm(value);
        setIsCustomerDropdownOpen(true);
        if (selectedCustomer) {
            setSelectedCustomer('');
            setAutomaticDiscountInfo(null);
            setDiscount(0);
        }
    };

    const handleCustomerSelect = (customer) => {
        if (!customer) return;
        setSelectedCustomer(customer.id);
        setCustomerType('existing');
        setCustomerSearchTerm(formatCustomerLabel(customer));
        setIsCustomerDropdownOpen(false);
    };

    const clearCustomerSelection = () => {
        setSelectedCustomer('');
        setCustomerSearchTerm('');
        setAutomaticDiscountInfo(null);
        setDiscount(0);
    };

    const handleVariantClick = (productId, imageUrl) => {
        setDisplayImages(prevImages => ({ ...prevImages, [productId]: imageUrl }));
    };

    const handleQuickAddCustomer = async (customerData) => {
        try {
            const payload = {
                ...customerData,
                status: customerData.status || 'active',
                customerCode: customerData.customerCode && customerData.customerCode.trim() ? customerData.customerCode : `CLI-${Date.now()}`,
            };
            const result = await api.customers.create(payload);
            toast.success("Cliente añadido con éxito.");
            setShowAddCustomerModal(false);
            setCustomerType('existing');
            setSelectedCustomer(result.id);
            refetchCustomers();
        } catch (error) {
            console.error('Error al crear cliente:', error);
            toast.error('No se pudo crear el cliente');
        }
    };

    const submitOrder = async () => {
        if ((customerType === 'existing' && !selectedCustomer) || (customerType === 'guest' && !guestCustomer.name)) {
            toast.error("Por favor, seleccione o ingrese la información del cliente.");
            playErrorSound();
            return;
        }
        if (cart.length === 0) {
            toast.error("El carrito está vacío.");
            playErrorSound();
            return;
        }

        setIsSubmitting(true);

        try {
            // Verificar stock antes de enviar
            for (const item of cart) {
                const product = safeProducts.find(p => p.id === item.productId);
                if (product && product.stock < item.quantity) {
                    toast.error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`);
                    playErrorSound();
                    setIsSubmitting(false);
                    return;
                }
            }

            const customerName = customerType === 'guest' ? guestCustomer.name : safeCustomers.find(c => c.id === selectedCustomer)?.name;
            const customerId = customerType === 'guest' || !selectedCustomer ? null : selectedCustomer;

            // Preparar items para el API
            const items = cart.map(item => ({
                productId: item.productId || undefined,
                variantId: item.variantInfo?.id || item.source?.variant?.id || null,
                productName: item.name,
                quantity: parseInt(item.quantity, 10),
                unitPrice: parseFloat(item.price) || 0,
                discountPercent: 0,
                taxRate: parseFloat(item.taxRate) || (item.isTaxable ? 18 : 0),
                customizationNotes: item.customizationNotes || '',
                customImageUrls: Array.isArray(item.customImageUrls) ? item.customImageUrls : [],
                variantInfo: item.variantInfo || null,
            }));

            const orderData = {
                customerId,
                customerName,
                items,
                paymentMethod: 'pendiente',
                amountPaid: 0,
                deliveryType,
                notes: '',
                status: 'Pendiente',
            };

            const result = await api.invoices.create(orderData);
            playSuccessSound();
            toast.success('¡Pedido creado con éxito!');

            const finalOrder = { ...result, customerName };
            setCreatedOrder(finalOrder);

            notificationService.notify('ORDER_CREATED', {
                title: 'Nuevo Pedido',
                message: `Pedido #${result.orderNumber} creado - ${formatCurrency(result.total)}`,
            }, ['desktop']);

            // Limpiar estado
            setCart([]);
            setSelectedCustomer('');
            setGuestCustomer({ name: '', phone: '' });
        } catch (error) {
            console.error('Error al crear pedido:', error);
            playErrorSound();
            toast.error(error.message || 'No se pudo crear el pedido.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDocumentPrint = async (orderData, type, customerDetails) => {
        const printMode = companyProfile?.cash?.printing?.mode;
        if (printMode === 'escpos') {
            const htmlString = generateThermalReceiptHTML(orderData, type, companyProfile, customerDetails, null);
            const printerName = companyProfile?.cash?.printing?.printerName || '';
            const success = await printEscPosReceipt(htmlString, printerName);
            if (!success) toast.error('Impresión de ticket fallida.');
        } else {
            generatePDF(orderData, type, companyProfile, customerDetails, null, type === 'quote' ? 'view' : 'download');
        }
    };

    const handleQuoteAction = () => {
        const customerDetails = customers.find(c => c.id === createdOrder.customerId);
        handleDocumentPrint(createdOrder, 'quote', customerDetails);
        setCreatedOrder(null);
        setView('invoices');
    };

    const handleBillAction = (andPay = false) => {
        setIsBillAndPayFlow(andPay);
        setBillingOrder(createdOrder);
        setCreatedOrder(null);
    };

    const handleFacturar = async (billingType, rnc) => {
        if (!billingOrder) return;
        
        try {
            await api.invoices.bill(billingOrder.id, billingType, rnc);
            playSuccessSound();
            toast.success('¡Pedido facturado!');

            notificationService.notify('ORDER_BILLED', {
                title: 'Pedido Facturado',
                message: `Pedido #${billingOrder.orderNumber} facturado`,
            }, ['desktop']);

            if (isBillAndPayFlow) {
                // Recargar la factura con los datos actualizados
                const updatedInvoice = await api.invoices.get(billingOrder.id);
                setPaymentForOrder(updatedInvoice);
            } else {
                const customerDetails = customers.find(c => c.id === billingOrder.customerId);
                handleDocumentPrint(billingOrder, 'invoice', customerDetails);
            }
        } catch (error) {
            console.error('Error al facturar:', error);
            playErrorSound();
            toast.error(error.message || 'No se pudo facturar.');
        }

        setBillingOrder(null);
        setIsBillAndPayFlow(false);
    };

    const handlePaymentSuccess = () => {
        setPaymentForOrder(null);
        setView('invoices');
    };

    if (loadingProducts || loadingCustomers) {
        return (
            <PageSkeleton kpis={0} label="Cargando datos de pedidos..." />
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                        <h2 className="page-title">Crear Nuevo Pedido</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mb-4">
                        <input aria-label="Buscar productos" 
                            type="text" 
                            placeholder="Buscar productos..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="input-base sm:flex-1 h-11"  
                        />
                        <input aria-label="Escanear código" 
                            type="text" 
                            placeholder="Escanear código..." 
                            value={barcodeScan} 
                            onChange={e => setBarcodeScan(e.target.value)} 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        processScannedBarcode(barcodeScan.trim());
                                    }
                                }} 
                                className="input-base sm:w-56 h-11"  
                            />
                            {isConnected ? (
                                <div className="flex items-center bg-success-100 text-success-800 rounded-lg overflow-hidden shadow-sm shrink-0">
                                    <button
                                        onClick={() => setShowScannerModal(true)}
                                        className="flex items-center gap-2 px-3 py-3 hover:bg-success-200 transition-colors"
                                        title="Escáner remoto activo"
                                    >
                                        <Smartphone size={20} />
                                        <span className="font-semibold">{linkedDeviceName || 'Conectado'}</span>
                                    </button>
                                    <button
                                        onClick={() => disconnectDevice()}
                                        className="px-3 py-3 hover:bg-success-200 text-success-900 transition-colors border-l border-success-200/50"
                                        title="Desvincular"
                                    >
                                        <XCircle size={20} />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => {
                                        initSession(); // Asegurar inicialización de sesión
                                        setShowScannerModal(true);
                                    }}
                                    className="flex items-center gap-2 h-11 px-4 rounded-lg border border-line bg-surface text-ink font-semibold text-sm shadow-sm hover:bg-surface-muted transition-colors shrink-0"
                                >
                                    <Smartphone size={20} />
                                    <span>Vincular Celular</span>
                                </button>
                            )}
                        </div>
                    <div className="card p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
                            {filteredProducts.map(p => {
                                const productVariants = p.variants || [];
                                const currentImage = displayImages[p.id] || p.imageUrl;
                                return (
                                    <div key={p.id} className="rounded-lg border border-line p-4 flex flex-col items-center text-center min-h-[18rem] hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
                                        <img 
                                            src={currentImage || PLACEHOLDER_IMG} 
                                            alt={p.name} 
                                            className="w-28 h-28 object-cover rounded-lg mb-3"
                                        />
                                        <h4 className="font-semibold text-sm text-ink break-words">{p.name}</h4>
                                        <p className="text-ink text-sm font-medium tabular-nums">{formatCurrency(p.salePrice, companyProfile?.currency)}</p>
                                        {productVariants.length > 0 && (
                                            <div className="flex justify-center gap-2 mt-2">
                                                <div 
                                                    onClick={() => handleVariantClick(p.id, p.imageUrl)} 
                                                    className="w-5 h-5 rounded-full cursor-pointer bg-surface border border-line" 
                                                    title="Default"
                                                />
                                                {productVariants.map(variant => (
                                                    <div 
                                                        key={variant.id} 
                                                        onClick={() => handleVariantClick(p.id, variant.imageUrl)} 
                                                        className={`w-5 h-5 rounded-full cursor-pointer ${getColorClass(variant.name)}`} 
                                                        title={variant.name}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-ink-muted mt-1">Disponibles: {p.stock}</p>
                                        <div className="mt-auto pt-3 flex gap-2 w-full">
                                            {companyProfile?.allowCustomization !== false && (
                                                <Button size="sm" variant="secondary" className="flex-1"
                                                    onClick={() => setCustomizingItem({ product: p, variants: productVariants })}
                                                >
                                                    Personalizar
                                                </Button>
                                            )}
                                            <Button size="sm" className="flex-1 gap-1.5"
                                                onClick={() => {
                                                    const quickItem = {
                                                        name: p.name,
                                                        productId: p.id,
                                                        imageUrl: currentImage,
                                                        price: p.salePrice,
                                                        quantity: 1,
                                                        categoryId: p.categoryId || p.category || null,
                                                        source: { product: p, variant: null },
                                                        uploadedImageFiles: [],
                                                        customImageUrls: [],
                                                        variantInfo: null
                                                    };
                                                    handleAddToCart(quickItem);
                                                }}
                                            >
                                                <ShoppingCart size={16} />
                                                <span>Añadir</span>
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="card p-6 sticky top-8">
                        <h3 className="text-lg font-semibold text-ink border-b border-line pb-4 mb-4">Resumen del Pedido</h3>

                        <div className="mb-4">
                            <Segmented
                                label="Tipo de cliente"
                                className="mb-3"
                                value={customerType}
                                onChange={setCustomerType}
                                options={[{ value: 'existing', label: 'Cliente registrado' }, { value: 'guest', label: 'Cliente temporal' }]}
                            />
                            {customerType === 'existing' ? (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input aria-label="Buscar por nombre, cédula/RNC o código"
                                            type="text"
                                            value={customerSearchTerm}
                                            onChange={(e) => handleCustomerSearchChange(e.target.value)}
                                            onFocus={() => setIsCustomerDropdownOpen(true)}
                                            onBlur={() => {
                                                dropdownBlurTimeout.current = setTimeout(() => setIsCustomerDropdownOpen(false), 150);
                                            }}
                                            placeholder="Buscar por nombre, cédula/RNC o código"
                                            className="input-base pr-10"
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                        {customerSearchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (dropdownBlurTimeout.current) clearTimeout(dropdownBlurTimeout.current);
                                                    clearCustomerSelection();
                                                }}
                                                className="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-600"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        )}
                                        {isCustomerDropdownOpen && customerOptions.length > 0 && (
                                            <ul
                                                className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-surface border border-line rounded-md shadow-lg"
                                                onMouseDown={(e) => e.preventDefault()}
                                            >
                                                {customerOptions.map((customer) => (
                                                    <li key={customer.id}>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                if (dropdownBlurTimeout.current) clearTimeout(dropdownBlurTimeout.current);
                                                                handleCustomerSelect(customer);
                                                            }}
                                                            className="w-full text-left px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                                                        >
                                                            <p className="font-medium text-ink">{customer.name || 'Cliente sin nombre'}</p>
                                                            <p className="text-xs text-ink-muted">
                                                                {(customer.customerCode && `Código: ${customer.customerCode}`) || 'Sin código'}
                                                                {customer.rnc ? ` · RNC: ${customer.rnc}` : ''}
                                                            </p>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {isCustomerDropdownOpen && customerOptions.length === 0 && (
                                            <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-line rounded-md shadow-md px-3 py-2 text-sm text-ink-muted">
                                                No se encontraron clientes.
                                            </div>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setShowAddCustomerModal(true)} 
                                        aria-label="Nuevo cliente" title="Nuevo cliente"
                                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:text-brand-600 hover:bg-surface-muted"
                                    >
                                        <UserPlus size={18}/>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input aria-label="Nombre del cliente" 
                                        type="text" 
                                        placeholder="Nombre del cliente" 
                                        value={guestCustomer.name} 
                                        onChange={e => setGuestCustomer({...guestCustomer, name: e.target.value})} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                    <input aria-label="Teléfono (opcional)" 
                                        type="tel" 
                                        placeholder="Teléfono (opcional)" 
                                        value={guestCustomer.phone} 
                                        onChange={e => setGuestCustomer({...guestCustomer, phone: e.target.value})} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mb-4 border-t border-line pt-4">
                            <p className="text-sm font-medium text-ink mb-2">Tipo de entrega</p>
                            <Segmented
                                label="Tipo de entrega"
                                value={deliveryType}
                                onChange={setDeliveryType}
                                options={[{ value: 'pickup', label: 'Entrega en tienda' }, { value: 'shipping', label: 'Envío a domicilio' }]}
                            />
                            {deliveryType === 'shipping' && customerType === 'guest' && (
                                <div className="mt-3 space-y-2">
                                    <input aria-label="Dirección (calle)" 
                                        type="text" 
                                        placeholder="Dirección (calle)" 
                                        value={guestAddress.street} 
                                        onChange={e => setGuestAddress(prev => ({ ...prev, street: e.target.value }))} 
                                        className="input-base"  
                                    />
                                    <div className="flex gap-2">
                                        <input aria-label="Ciudad" 
                                            type="text" 
                                            placeholder="Ciudad" 
                                            value={guestAddress.city} 
                                            onChange={e => setGuestAddress(prev => ({ ...prev, city: e.target.value }))} 
                                            className="input-base flex-1"  
                                        />
                                        <input aria-label="Código postal" 
                                            type="text" 
                                            placeholder="Código postal" 
                                            value={guestAddress.postalCode} 
                                            onChange={e => setGuestAddress(prev => ({ ...prev, postalCode: e.target.value }))} 
                                            className="input-base w-36"  
                                        />
                                    </div>
                                    <input aria-label="Teléfono" 
                                        type="tel" 
                                        placeholder="Teléfono" 
                                        value={guestAddress.phone} 
                                        onChange={e => setGuestAddress(prev => ({ ...prev, phone: e.target.value }))} 
                                        className="input-base"  
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 mb-4 pr-2" style={{ maxHeight: `${Math.min(400 + cart.length * 70, 600)}px`, overflowY: 'auto' }}>
                            {cart.length === 0 && (
                                <div className="flex flex-col items-center gap-2 py-8 text-center">
                                    <ShoppingCart size={28} className="text-gray-300 dark:text-gray-600" />
                                    <p className="text-sm text-ink-muted">El carrito está vacío. Añade productos desde el catálogo.</p>
                                </div>
                            )}
                            {cart.map(item => (
                                <div key={item.cartId} className="flex justify-between items-start bg-surface-muted p-3 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <img
                                            src={
                                                item.variantInfo?.imageUrl ||
                                                (item.customImageUrls && item.customImageUrls[0]) ||
                                                item.imageUrl ||
                                                PLACEHOLDER_IMG
                                            }
                                            alt={item.name}
                                            className="w-12 h-12 object-cover rounded-md"
                                        />
                                        <div>
                                            <p className="font-semibold">{item.name}</p>
                                            {(companyProfile?.allowCustomization !== false && (item.customImageUrls?.length > 0 || item.uploadedImageFiles?.length > 0 || item.variantInfo)) && (
                                                <p className="text-xs font-medium text-brand-600 dark:text-brand-400">Personalizado</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <button onClick={() => handleCartUpdate(item.cartId, item.quantity - 1)} aria-label="Disminuir cantidad" className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-surface hover:bg-surface-muted"><Minus size={12}/></button>
                                                <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                                                <button onClick={() => handleCartUpdate(item.cartId, item.quantity + 1)} aria-label="Aumentar cantidad" className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-surface hover:bg-surface-muted"><Plus size={12}/></button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <p className="font-semibold tabular-nums">{formatCurrency(item.price * item.quantity, companyProfile?.currency)}</p>
                                        <div className="flex gap-2 mt-1 items-center">
                                            {companyProfile?.allowCustomization !== false && (
                                                <button onClick={() => setEditingCartItem(item)} className="text-brand-600 hover:underline text-sm">Editar</button>
                                            )}
                                            <button onClick={() => handleCartUpdate(item.cartId, 0)} aria-label="Quitar del carrito" className="text-gray-400 hover:text-danger-600 mt-1"><XCircle size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-line pt-4 mt-4 space-y-2 text-sm text-ink-muted tabular-nums">
                            <div className="flex justify-between"><span>Subtotal Gravado:</span><span>{formatCurrency(taxSummary.montoGravado, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between"><span>Subtotal Exento:</span><span>{formatCurrency(taxSummary.montoExento, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between items-center">
                                <label>Descuento:</label>
                                <div className="flex gap-1">
                                    <input aria-label="Descuento"
                                        type="number"
                                        value={discount}
                                        onChange={e => {
                                            if (!canEditManualDiscount) return;
                                            setDiscount(parseFloat(e.target.value) || 0);
                                        }}
                                        className="input-base w-20 h-8 text-right"
                                        disabled={!canEditManualDiscount}
                                    />
                                    <select aria-label="Tipo de descuento"
                                        value={discountType}
                                        onChange={e => {
                                            if (!canEditManualDiscount) return;
                                            setDiscountType(e.target.value);
                                        }}
                                        className="input-base w-16 h-8 px-2"
                                        disabled={!canEditManualDiscount}
                                    >
                                        <option value="percentage">%</option>
                                        <option value="fixed">$</option>
                                    </select>
                                </div>
                            </div>
                            {automaticDiscountInfo && (
                                <p className="text-xs text-ink-muted">
                                    Descuento automático: {automaticDiscountInfo.value}% {automaticDiscountInfo.source === 'categoría' ? `por la categoría ${automaticDiscountInfo.detail}` : 'definido para el cliente'}.
                                </p>
                            )}
                            {!canEditManualDiscount && (
                                <p className="text-xs text-gray-400">Solo administradores o gerentes pueden ajustar el descuento manual.</p>
                            )}
                            {taxSummary.discountAmount > 0 && (
                                <div className="flex justify-between text-danger-600">
                                    <span>Ahorro:</span>
                                    <span>-{formatCurrency(taxSummary.discountAmount, companyProfile?.currency)}</span>
                                </div>
                            )}
                            <div className="flex justify-between"><span>ITBIS (18%):</span><span>{formatCurrency(taxSummary.itbis, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between items-baseline text-ink font-semibold text-2xl pt-3 mt-1 border-t border-line"><span className="text-base">Total</span><span>{formatCurrency(orderTotal, companyProfile?.currency)}</span></div>
                        </div>
                        <Button size="lg" className="mt-5 w-full" onClick={submitOrder} disabled={cart.length === 0 || isSubmitting}>
                            {isSubmitting ? 'Procesando…' : 'Procesar pedido'}
                        </Button>
                        {cart.length === 0 && <p className="mt-2 text-xs text-center text-ink-muted">Añade al menos un producto para continuar.</p>}
                    </div>
                </div>
            </div>
            {customizingItem && (
                <CustomizeItemModal 
                    productData={customizingItem} 
                    onClose={() => setCustomizingItem(null)} 
                    onSave={handleAddToCart} 
                    companyProfile={companyProfile}
                />
            )}
            {editingCartItem && (
                <CustomizeItemModal
                    productData={{ 
                        product: editingCartItem.source?.product || { id: editingCartItem.productId, imageUrl: editingCartItem.imageUrl, name: editingCartItem.name }, 
                        variants: editingCartItem.source?.product?.variants || [] 
                    }}
                    onClose={() => setEditingCartItem(null)}
                    onSave={(updatedItem) => {
                        setCart(curr => curr.map(it => it.cartId === editingCartItem.cartId ? { ...it, ...updatedItem } : it));
                        setEditingCartItem(null);
                    }}
                    companyProfile={companyProfile}
                />
            )}
            {showAddCustomerModal && (
                <CustomerModal 
                    customer={{}} 
                    onClose={() => setShowAddCustomerModal(false)} 
                    onSave={handleQuickAddCustomer} 
                    companyProfile={companyProfile}
                    useApi={true}
                />
            )}
            {createdOrder && (
                <PostOrderActionsModal 
                    orderNumber={createdOrder.orderNumber}
                    onClose={() => { setCreatedOrder(null); setView('invoices'); }}
                    onQuote={handleQuoteAction}
                    onBill={() => handleBillAction(false)}
                    onBillAndPay={() => handleBillAction(true)}
                />
            )}
            {billingOrder && (
                <BillingTypeModal
                    onClose={() => setBillingOrder(null)}
                    onConfirm={handleFacturar}
                    customer={customers.find(c => c.id === billingOrder.customerId)}
                    companyProfile={companyProfile}
                />
            )}
            {paymentForOrder && (
                <PaymentModal 
                    invoice={paymentForOrder} 
                    customers={customers} 
                    companyProfile={companyProfile} 
                    onClose={() => setPaymentForOrder(null)} 
                    onSuccess={handlePaymentSuccess}
                    useApi={true}
                />
            )}
            {showScannerModal && (
                <ScannerLinkModal 
                    onClose={() => setShowScannerModal(false)}
                />
            )}
        </>
    );
};

export default OrdersViewSQL;
