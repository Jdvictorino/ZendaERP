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
import api from '../api/client.js';
import { useApiCrud } from '../hooks/useApi.js';
import { useScanner } from '../context/ScannerContext.jsx';

const getColorClass = (colorName) => {
    const colors = {
        rojo: 'bg-red-500', azul: 'bg-blue-500', verde: 'bg-green-500',
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
            <div className="flex justify-center items-center h-full p-12">
                <Loader2 className="animate-spin text-gray-400" size={48} />
                <p className="ml-4 text-gray-500">Cargando datos de pedidos...</p>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                        <h2 className="text-3xl font-bold text-gray-800">Crear Nuevo Pedido</h2>
                    </div>
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            placeholder="Buscar productos..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="flex-1 p-3 border rounded-lg shadow-sm" 
                        />
                        <input 
                            type="text" 
                            placeholder="Escanear código..." 
                            value={barcodeScan} 
                            onChange={e => setBarcodeScan(e.target.value)} 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        processScannedBarcode(barcodeScan.trim());
                                    }
                                }} 
                                className="w-56 p-3 border rounded-lg shadow-sm" 
                            />
                            {isConnected ? (
                                <div className="flex items-center bg-green-100 text-green-800 rounded-lg overflow-hidden shadow-sm shrink-0">
                                    <button
                                        onClick={() => setShowScannerModal(true)}
                                        className="flex items-center gap-2 px-3 py-3 hover:bg-green-200 transition-colors"
                                        title="Escáner remoto activo"
                                    >
                                        <Smartphone size={20} />
                                        <span className="font-semibold">{linkedDeviceName || 'Conectado'}</span>
                                    </button>
                                    <button
                                        onClick={() => disconnectDevice()}
                                        className="px-3 py-3 hover:bg-green-200 text-green-900 transition-colors border-l border-green-200/50"
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
                                    className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-3 rounded-lg hover:bg-indigo-200 transition-colors shrink-0"
                                >
                                    <Smartphone size={20} />
                                    <span>Vincular Celular</span>
                                </button>
                            )}
                        </div>
                    <div className="bg-white p-4 rounded-lg shadow-md">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
                            {filteredProducts.map(p => {
                                const productVariants = p.variants || [];
                                const currentImage = displayImages[p.id] || p.imageUrl;
                                return (
                                    <div key={p.id} className="border rounded-lg p-4 flex flex-col items-center text-center min-h-[18rem] shadow-sm hover:shadow-md transition-shadow duration-150">
                                        <img 
                                            src={currentImage || 'https://placehold.co/120x120/e2e8f0/a0aec0?text=Img'} 
                                            alt={p.name} 
                                            className="w-28 h-28 object-cover rounded-md mb-2 shadow-sm"
                                        />
                                        <h4 className="font-semibold text-sm break-words">{p.name}</h4>
                                        <p className="text-gray-600 text-sm">{formatCurrency(p.salePrice, companyProfile?.currency)}</p>
                                        {productVariants.length > 0 && (
                                            <div className="flex justify-center gap-2 mt-2">
                                                <div 
                                                    onClick={() => handleVariantClick(p.id, p.imageUrl)} 
                                                    className="w-5 h-5 rounded-full cursor-pointer bg-white border border-gray-300" 
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
                                        <p className="text-sm text-gray-500 mt-1">Disponibles: {p.stock}</p>
                                        <div className="mt-3 flex gap-2 w-full px-2">
                                            {companyProfile?.allowCustomization !== false && (
                                                <button 
                                                    onClick={() => setCustomizingItem({ product: p, variants: productVariants })} 
                                                    className="flex-1 bg-gray-500 text-white text-sm py-2 rounded-md hover:bg-gray-600"
                                                >
                                                    Personalizar
                                                </button>
                                            )}
                                            <button 
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
                                                className="flex-1 bg-blue-600 text-white text-sm py-2 rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
                                            >
                                                <ShoppingCart size={16} />
                                                <span>Añadir</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-lg shadow-md sticky top-8">
                        <h3 className="text-2xl font-bold border-b pb-4 mb-4">Resumen del Pedido</h3>

                        <div className="mb-4">
                            <div className="flex gap-4 mb-2 border-b pb-2">
                                <label>
                                    <input 
                                        type="radio" 
                                        name="customerType" 
                                        value="existing" 
                                        checked={customerType === 'existing'} 
                                        onChange={(e) => setCustomerType(e.target.value)} 
                                    /> Cliente Registrado
                                </label>
                                <label>
                                    <input 
                                        type="radio" 
                                        name="customerType" 
                                        value="guest" 
                                        checked={customerType === 'guest'} 
                                        onChange={(e) => setCustomerType(e.target.value)} 
                                    /> Cliente Temporal
                                </label>
                            </div>
                            {customerType === 'existing' ? (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={customerSearchTerm}
                                            onChange={(e) => handleCustomerSearchChange(e.target.value)}
                                            onFocus={() => setIsCustomerDropdownOpen(true)}
                                            onBlur={() => {
                                                dropdownBlurTimeout.current = setTimeout(() => setIsCustomerDropdownOpen(false), 150);
                                            }}
                                            placeholder="Buscar por nombre, cédula/RNC o código"
                                            className="w-full p-2 pr-10 border rounded-md"
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
                                                className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg"
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
                                                            className="w-full text-left px-3 py-2 hover:bg-indigo-50"
                                                        >
                                                            <p className="font-medium text-gray-900">{customer.name || 'Cliente sin nombre'}</p>
                                                            <p className="text-xs text-gray-500">
                                                                {(customer.customerCode && `Código: ${customer.customerCode}`) || 'Sin código'}
                                                                {customer.rnc ? ` · RNC: ${customer.rnc}` : ''}
                                                            </p>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {isCustomerDropdownOpen && customerOptions.length === 0 && (
                                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-sm text-gray-500">
                                                No se encontraron clientes.
                                            </div>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setShowAddCustomerModal(true)} 
                                        className="p-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
                                    >
                                        <UserPlus size={20}/>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input 
                                        type="text" 
                                        placeholder="Nombre del cliente" 
                                        value={guestCustomer.name} 
                                        onChange={e => setGuestCustomer({...guestCustomer, name: e.target.value})} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                    <input 
                                        type="tel" 
                                        placeholder="Teléfono (opcional)" 
                                        value={guestCustomer.phone} 
                                        onChange={e => setGuestCustomer({...guestCustomer, phone: e.target.value})} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mb-4 border-t pt-4">
                            <label className="block font-medium mb-2">Tipo de entrega</label>
                            <div className="flex gap-4 items-center">
                                <label>
                                    <input 
                                        type="radio" 
                                        name="deliveryType" 
                                        value="pickup" 
                                        checked={deliveryType === 'pickup'} 
                                        onChange={(e) => setDeliveryType(e.target.value)} 
                                    /> Entrega en tienda
                                </label>
                                <label>
                                    <input 
                                        type="radio" 
                                        name="deliveryType" 
                                        value="shipping" 
                                        checked={deliveryType === 'shipping'} 
                                        onChange={(e) => setDeliveryType(e.target.value)} 
                                    /> Envío a domicilio
                                </label>
                            </div>
                            {deliveryType === 'shipping' && customerType === 'guest' && (
                                <div className="mt-3 space-y-2">
                                    <input 
                                        type="text" 
                                        placeholder="Dirección (calle)" 
                                        value={guestAddress.street} 
                                        onChange={e => setGuestAddress(prev => ({ ...prev, street: e.target.value }))} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Ciudad" 
                                            value={guestAddress.city} 
                                            onChange={e => setGuestAddress(prev => ({ ...prev, city: e.target.value }))} 
                                            className="flex-1 p-2 border rounded-md" 
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Código postal" 
                                            value={guestAddress.postalCode} 
                                            onChange={e => setGuestAddress(prev => ({ ...prev, postalCode: e.target.value }))} 
                                            className="w-36 p-2 border rounded-md" 
                                        />
                                    </div>
                                    <input 
                                        type="tel" 
                                        placeholder="Teléfono" 
                                        value={guestAddress.phone} 
                                        onChange={e => setGuestAddress(prev => ({ ...prev, phone: e.target.value }))} 
                                        className="w-full p-2 border rounded-md" 
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 mb-4 pr-2" style={{ maxHeight: `${Math.min(400 + cart.length * 70, 600)}px`, overflowY: 'auto' }}>
                            {cart.length === 0 && <p className="text-center text-gray-500 py-4">El carrito está vacío.</p>}
                            {cart.map(item => (
                                <div key={item.cartId} className="flex justify-between items-start bg-gray-50 p-2 rounded-md">
                                    <div className="flex items-start gap-3">
                                        <img
                                            src={
                                                item.variantInfo?.imageUrl ||
                                                (item.customImageUrls && item.customImageUrls[0]) ||
                                                item.imageUrl ||
                                                'https://placehold.co/64x64/e2e8f0/a0aec0?text=Img'
                                            }
                                            alt={item.name}
                                            className="w-12 h-12 object-cover rounded-md"
                                        />
                                        <div>
                                            <p className="font-semibold">{item.name}</p>
                                            {(companyProfile?.allowCustomization !== false && (item.customImageUrls?.length > 0 || item.uploadedImageFiles?.length > 0 || item.variantInfo)) && (
                                                <p className="text-sm text-blue-600">Personalizado</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <button onClick={() => handleCartUpdate(item.cartId, item.quantity - 1)} className="p-1 bg-gray-200 rounded-full"><Minus size={12}/></button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => handleCartUpdate(item.cartId, item.quantity + 1)} className="p-1 bg-gray-200 rounded-full"><Plus size={12}/></button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <p className="font-bold">{formatCurrency(item.price * item.quantity, companyProfile?.currency)}</p>
                                        <div className="flex gap-2 mt-1 items-center">
                                            {companyProfile?.allowCustomization !== false && (
                                                <button onClick={() => setEditingCartItem(item)} className="text-indigo-600 hover:underline text-sm">Editar</button>
                                            )}
                                            <button onClick={() => handleCartUpdate(item.cartId, 0)} className="text-red-500 hover:text-red-700 mt-1"><XCircle size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t pt-4 mt-4 space-y-2">
                            <div className="flex justify-between"><span>Subtotal Gravado:</span><span>{formatCurrency(taxSummary.montoGravado, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between"><span>Subtotal Exento:</span><span>{formatCurrency(taxSummary.montoExento, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between items-center">
                                <label>Descuento:</label>
                                <div className="flex gap-1">
                                    <input
                                        type="number"
                                        value={discount}
                                        onChange={e => {
                                            if (!canEditManualDiscount) return;
                                            setDiscount(parseFloat(e.target.value) || 0);
                                        }}
                                        className="w-20 p-1 border rounded-md"
                                        disabled={!canEditManualDiscount}
                                    />
                                    <select
                                        value={discountType}
                                        onChange={e => {
                                            if (!canEditManualDiscount) return;
                                            setDiscountType(e.target.value);
                                        }}
                                        className="p-1 border rounded-md"
                                        disabled={!canEditManualDiscount}
                                    >
                                        <option value="percentage">%</option>
                                        <option value="fixed">$</option>
                                    </select>
                                </div>
                            </div>
                            {automaticDiscountInfo && (
                                <p className="text-xs text-gray-500">
                                    Descuento automático: {automaticDiscountInfo.value}% {automaticDiscountInfo.source === 'categoría' ? `por la categoría ${automaticDiscountInfo.detail}` : 'definido para el cliente'}.
                                </p>
                            )}
                            {!canEditManualDiscount && (
                                <p className="text-xs text-gray-400">Solo administradores o gerentes pueden ajustar el descuento manual.</p>
                            )}
                            {taxSummary.discountAmount > 0 && (
                                <div className="flex justify-between text-red-600">
                                    <span>Ahorro:</span>
                                    <span>-{formatCurrency(taxSummary.discountAmount, companyProfile?.currency)}</span>
                                </div>
                            )}
                            <div className="flex justify-between"><span>ITBIS (18%):</span><span>{formatCurrency(taxSummary.itbis, companyProfile?.currency)}</span></div>
                            <div className="flex justify-between font-bold text-xl pt-2 border-t"><span>Total:</span><span>{formatCurrency(orderTotal, companyProfile?.currency)}</span></div>
                        </div>
                        <button 
                            onClick={submitOrder} 
                            disabled={cart.length === 0 || isSubmitting} 
                            className="mt-4 w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Procesando...' : 'Procesar Pedido'}
                        </button>
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
