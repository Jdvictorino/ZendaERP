import React, { useState, useMemo } from 'react';
import { FileText, Download, FileSignature, XCircle, Trash2, Edit, Save, X, Printer, ArrowLeft, Mail } from 'lucide-react';
import { getCouponByCode, validateCoupon, applyCouponToCart, redeemCouponTransaction } from '../../utils/offers.js';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { generatePDF } from '../../utils/pdfGenerator.js';
import { generateThermalReceiptHTML } from '../../utils/escposGenerator.js';
import { printEscPosReceipt } from '../../utils/printer.js';
import api from '../../api/client.js';
import PaymentModal from './PaymentModal.jsx';
import CreditNoteModal from './CreditNoteModal.jsx';
import DebitNoteModal from './DebitNoteModal.jsx';
import ConfirmationModal from './ConfirmationModal.jsx';
import ImageViewerModal from './ImageViewerModal.jsx';
import BillingTypeModal from './BillingTypeModal.jsx';
import SendEmailModal from './SendEmailModal.jsx';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import Button from '../ui/Button.jsx';

const InvoiceDetailModal = ({ invoice, companyProfile, customers, creditNotes, debitNotes, onClose, isMasterUser, currentUserProfile, couponRedemptionPolicy = 'both', onRefresh, fullPage = false }) => {
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
    const [showDebitNoteModal, setShowDebitNoteModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [editingNotes, setEditingNotes] = useState({ itemId: null, text: '' });
    const [viewingImage, setViewingImage] = useState(null);
    const [showBillingModal, setShowBillingModal] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [appliedCoupon, setAppliedCoupon] = useState(invoice.appliedCoupon || null);
    const [appliedCouponFull, setAppliedCouponFull] = useState(invoice.appliedCouponFull || null);
    const [perLineDiscounts, setPerLineDiscounts] = useState({});
    const [couponRedemptionPolicyState, setCouponRedemptionPolicyState] = useState(couponRedemptionPolicy);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailModalData, setEmailModalData] = useState({ docName: '', filename: '', base64Attachment: '' });

    const handleOpenEmailModal = async (docType, docObject = invoice) => {
        let docName = '';
        let filename = '';
        let defaultSubject = '';
        let defaultBody = '';

        const clientEmail = customerDetails?.email || '';

        if (docType === 'invoice') {
            const num = docObject.invoiceNumber || docObject.orderNumber || 'N/A';
            docName = `Factura ${num}`;
            filename = `factura-${num}.pdf`;
            defaultSubject = `[Zenda ERP] Factura ${num}`;
            defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su factura correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;
        } else if (docType === 'quote') {
            const num = docObject.orderNumber || 'N/A';
            docName = `Cotización ${num}`;
            filename = `cotizacion-${num}.pdf`;
            defaultSubject = `[Zenda ERP] Cotización ${num}`;
            defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su cotización correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;
        } else if (docType === 'credit-note') {
            const num = docObject.creditNoteNumber || 'N/A';
            docName = `Nota de Crédito ${num}`;
            filename = `nota-credito-${num}.pdf`;
            defaultSubject = `[Zenda ERP] Nota de Crédito ${num}`;
            defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su nota de crédito correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;
        } else if (docType === 'debit-note') {
            const num = docObject.debitNoteNumber || 'N/A';
            docName = `Nota de Débito ${num}`;
            filename = `nota-debito-${num}.pdf`;
            defaultSubject = `[Zenda ERP] Nota de Débito ${num}`;
            defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su nota de débito correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;
        }

        const smtpSettings = companyProfile?.settings?.smtp || {};
        const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

        if (hasSmtpConfig) {
            try {
                toast.loading('Generando documento PDF...', { id: 'pdf-gen' });
                const dataUrl = await generatePDF(
                    docObject,
                    docType,
                    companyProfile,
                    customerDetails,
                    emitterInfoForPDF,
                    'dataurl'
                );
                toast.dismiss('pdf-gen');

                if (!dataUrl) {
                    toast.error('No se pudo generar el documento PDF.');
                    return;
                }

                const base64Attachment = dataUrl.split(',')[1];
                setEmailModalData({
                    docName,
                    filename,
                    base64Attachment
                });
                setShowEmailModal(true);
            } catch (error) {
                toast.dismiss('pdf-gen');
                console.error('Error al preparar email:', error);
                toast.error('Error al generar el PDF para adjuntar.');
            }
        } else {
            toast.success('Abriendo cliente de correo nativo... ¡Descarga y adjunta el PDF!');
            try {
                generatePDF(
                    docObject,
                    docType,
                    companyProfile,
                    customerDetails,
                    emitterInfoForPDF,
                    'download'
                );
            } catch (err) {
                console.error('Auto-download PDF failed:', err);
            }

            const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
            window.location.href = mailtoUrl;
        }
    };

    const customerDetails = useMemo(() => (customers || []).find(c => c.id === invoice.customerId), [customers, invoice.customerId]);
    const associatedCreditNote = useMemo(() => (creditNotes || []).find(cn => cn.originalInvoiceId === invoice.id), [creditNotes, invoice.id]);
    const associatedDebitNote = useMemo(() => (debitNotes || []).find(dn => dn.originalInvoiceId === invoice.id), [debitNotes, invoice.id]);

    const emitterInfoForPDF = invoice.emitterInfo || (currentUserProfile ? {
        fullName: `${currentUserProfile.firstName} ${currentUserProfile.lastName}`,
        employeeId: currentUserProfile.employeeId,
        cargo: currentUserProfile.cargo
    } : null);

    const updateStatus = async (newStatus) => {
        const promise = api.patch(`/invoices/${invoice.id}/status`, { status: newStatus });
        await toast.promise(promise, {
            loading: 'Actualizando estado...',
            success: () => { playSuccessSound(); onRefresh?.(); return '¡Estado actualizado!'; },
            error: () => { playErrorSound(); return 'No se pudo actualizar el estado.'; }
        });
        onClose();
    };

    const handleFacturar = async (billingType, rnc) => {
        setShowBillingModal(false);
        const promise = api.invoices.bill(invoice.id, billingType, rnc).then(async (updatedInvoice) => {
            const updatedOrderData = { ...invoice, ...updatedInvoice };
            
            const printMode = companyProfile?.cash?.printing?.mode;
            if (printMode === 'escpos') {
                const htmlString = generateThermalReceiptHTML(updatedOrderData, 'invoice', companyProfile, customerDetails, updatedOrderData.emitterInfo);
                const printerName = companyProfile?.cash?.printing?.printerName || '';
                const success = await printEscPosReceipt(htmlString, printerName);
                if (!success) toast.error('Facturado, pero la impresión térmica falló.');
            } else {
                generatePDF(updatedOrderData, 'invoice', companyProfile, customerDetails, updatedOrderData.emitterInfo, 'download');
            }
            // If there is an applied coupon, attempt to redeem it now (billing time)
            try {
                const couponId = invoice.appliedCoupon?.id || appliedCoupon?.id;
                const userIdentifier = currentUserProfile?.id || null;
                // Respect policy: only redeem on billing if policy allows
                if ((couponRedemptionPolicyState === 'onBilling' || couponRedemptionPolicyState === 'both') && couponId && userIdentifier) {
                    await redeemCouponTransaction(couponId, userIdentifier, userIdentifier);
                }
            } catch (err) {
                console.error('Error redimiendo cupón al facturar:', err);
                toast.error('No se pudo registrar el uso del cupón al facturar.');
            }
            onRefresh?.();
        });
        await toast.promise(promise, {
            loading: 'Facturando...',
            success: () => { playSuccessSound(); return '¡Pedido facturado con éxito!'; },
            error: () => { playErrorSound(); return 'No se pudo facturar el pedido.'; }
        });
        onClose();
    };

    const handleSaveNotes = async () => {
        const newItems = invoice.items.map(item => {
            const itemId = item.id || item.cartId;
            return itemId === editingNotes.itemId
                ? { ...item, customizationNotes: editingNotes.text }
                : item;
        });
        const promise = api.invoices.update(invoice.id, { items: newItems });
        await toast.promise(promise, {
            loading: 'Guardando notas...',
            success: () => { playSuccessSound(); onRefresh?.(); return '¡Notas actualizadas!'; },
            error: () => { playErrorSound(); return 'No se pudieron guardar las notas.'; }
        });
        invoice.items = newItems;
        setEditingNotes({ itemId: null, text: '' });
    };

    const handleActionConfirm = async () => {
        if (!confirmAction) return;
        const { action, payload: order } = confirmAction;
        let promise;
        if (action === 'cancel') {
            promise = api.invoices.cancel(order.id, 'Cancelado por usuario');
        } else if (action === 'forceDelete') {
            promise = api.invoices.delete(order.id);
        }
        if (promise) {
            await toast.promise(promise, {
                loading: 'Procesando...',
                success: () => { playSuccessSound(); onRefresh?.(); return '¡Acción completada con éxito!'; },
                error: () => { playErrorSound(); return 'No se pudo completar la acción.'; }
            });
            onClose();
        }
        setConfirmAction(null);
    };

    const handleApplyCoupon = async () => {
        if (!couponCode || !couponCode.trim()) return toast.error('Introduce el código del cupón');
        setCouponLoading(true);
        try {
            const userIdentifier = currentUserProfile?.id || null;
            const coupon = await getCouponByCode(couponCode.trim(), userIdentifier);
            if (!coupon) return toast.error('Cupón no encontrado');
            const cart = (invoice.items || []).map(i => ({ cartId: i.cartId || i.id, productId: i.productId, categoryId: i.categoryId, price: i.unitPrice || i.price, quantity: i.quantity }));
            const valid = await validateCoupon(coupon, { cart, userId: userIdentifier, ownerId: userIdentifier });
            if (!valid.valid) return toast.error(valid.reason || 'Cupón no válido');
            const res = applyCouponToCart(coupon, cart);
            // compute per-line discounts (map by cartId)
            const discounts = {};
            if (res.applicableAmount > 0) {
                const totalDiscount = res.discount || 0;
                if (coupon.type === 'percentage') {
                    // percentage per applicable line
                    cart.forEach((it) => {
                        const lineAmount = Number(it.price || 0) * Number(it.quantity || 1);
                        if (res.appliedTo.includes(it.productId)) {
                            const lineDiscount = +(lineAmount * (Number(coupon.value || 0) / 100));
                            discounts[it.cartId] = lineDiscount;
                        } else {
                            discounts[it.cartId] = 0;
                        }
                    });
                } else {
                    // fixed: distribute proportionally among applicable items
                    cart.forEach((it) => {
                        const lineAmount = Number(it.price || 0) * Number(it.quantity || 1);
                        if (res.appliedTo.includes(it.productId)) {
                            const prop = lineAmount / res.applicableAmount || 0;
                            discounts[it.cartId] = +(prop * totalDiscount);
                        } else {
                            discounts[it.cartId] = 0;
                        }
                    });
                    // ensure rounding does not exceed totalDiscount
                    const sumAssigned = Object.values(discounts).reduce((a,b) => a + (Number(b)||0), 0);
                    const diff = +(totalDiscount - sumAssigned);
                    if (Math.abs(diff) >= 0.01) {
                        // adjust first applicable item
                        for (const it of cart) {
                            if (res.appliedTo.includes(it.productId)) {
                                discounts[it.cartId] = +(Number(discounts[it.cartId] || 0) + diff);
                                break;
                            }
                        }
                    }
                }
            }
            const promise = api.invoices.update(invoice.id, { discountAmount: res.discount, total: res.newTotal, appliedCoupon: { id: coupon.id, code: coupon.code } });
            await toast.promise(promise, { loading: 'Aplicando cupón...', success: 'Cupón aplicado', error: 'No se pudo aplicar el cupón' });
            // update local view
            invoice.discountAmount = res.discount;
            invoice.total = res.newTotal;
            setAppliedCoupon({ id: coupon.id, code: coupon.code });
            setAppliedCouponFull(coupon);
            setPerLineDiscounts(discounts);
            onRefresh?.();
        } catch (err) {
            console.error(err);
            toast.error('Error al aplicar el cupón');
        } finally {
            setCouponLoading(false);
        }
    };

    const handleRemoveCoupon = async () => {
        try {
            const promise = api.invoices.update(invoice.id, { discountAmount: 0, total: invoice.subtotal, appliedCoupon: null });
            await toast.promise(promise, { loading: 'Removiendo cupón...', success: 'Cupón removido', error: 'No se pudo remover el cupón' });
            invoice.discountAmount = 0;
            invoice.total = invoice.subtotal;
            setAppliedCoupon(null);
            setAppliedCouponFull(null);
            setPerLineDiscounts({});
            onRefresh?.();
        } catch (err) {
            console.error(err);
            toast.error('Error al remover el cupón');
        }
    };

    const handlePaymentSuccess = async () => {
        // After successful payment, redeem coupon if applied
        try {
            const userIdentifier = currentUserProfile?.id || null;
            // Respect policy: only redeem on payment if policy allows
            if (couponRedemptionPolicyState === 'onPayment' || couponRedemptionPolicyState === 'both') {
                if (invoice.appliedCoupon?.id) {
                    await redeemCouponTransaction(invoice.appliedCoupon.id, userIdentifier, userIdentifier);
                } else if (appliedCoupon?.id) {
                    await redeemCouponTransaction(appliedCoupon.id, userIdentifier, userIdentifier);
                }
            }
        } catch (err) {
            console.error('Error redimiendo cupón:', err);
            // Do not block payment success, just notify
            toast.error('No se pudo registrar el uso del cupón.');
        }
        onRefresh?.();
        onClose();
    };
    const handleCreditNoteSuccess = () => { setShowCreditNoteModal(false); onClose(); };
    const handleDebitNoteSuccess = () => { setShowDebitNoteModal(false); onClose(); };

    return (
        <>
            <div className={fullPage ? 'w-full' : 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'}>
                <div className={fullPage ? 'bg-white rounded-2xl shadow-card p-6 md:p-8 w-full' : 'bg-white rounded-2xl shadow-card p-6 md:p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto'}>
                    {/* Encabezado */}
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                        <div>
                            {fullPage && (
                                <p className="text-sm text-gray-500 mb-1">Pedidos/Facturas &gt; Gestionar {invoice.orderNumber}</p>
                            )}
                            <div className="flex items-center gap-2">
                                {fullPage && (
                                    <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Salir">
                                        <ArrowLeft size={22} strokeWidth={2.5} />
                                    </button>
                                )}
                                <h3 className="text-2xl font-bold">Gestionar Pedido {invoice.orderNumber}</h3>
                            </div>
                            {invoice.isBilled && <p className="text-lg font-semibold text-green-600">Factura: {invoice.invoiceNumber}</p>}
                        </div>
                        {!fullPage && <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>}
                    </div>

                    {/* Botones principales */}
                    <div className="flex flex-wrap gap-2 mb-4 border-b pb-4">
                        <Button variant="secondary" onClick={() => generatePDF(invoice, 'quote', companyProfile, customerDetails, emitterInfoForPDF, 'view')}><FileText size={18} className="mr-2"/> Ver Cotización</Button>
                        <Button variant="secondary" onClick={() => handleOpenEmailModal('quote')}><Mail size={18} className="mr-2"/> Enviar por Correo</Button>
                        {invoice.isBilled && (
                            <>
                                <Button onClick={() => generatePDF(invoice, 'invoice', companyProfile, customerDetails, emitterInfoForPDF, 'view')}><FileText size={18} className="mr-2"/> Ver Factura (Carta)</Button>
                                <Button onClick={() => generatePDF(invoice, 'invoice', companyProfile, customerDetails, emitterInfoForPDF, 'download')}><Download size={18} className="mr-2"/> Descargar Factura (Carta)</Button>
                                <Button variant="secondary" onClick={() => handleOpenEmailModal('invoice')}><Mail size={18} className="mr-2"/> Enviar por Correo</Button>
                                <Button variant="secondary" onClick={async () => {
                                    const htmlString = generateThermalReceiptHTML(invoice, 'invoice', companyProfile, customerDetails, emitterInfoForPDF);
                                    const printerName = companyProfile?.cash?.printing?.printerName || '';
                                    const ok = await printEscPosReceipt(htmlString, printerName);
                                    if(!ok) toast.error('Impresión térmica fallida. Configura el nombre correcto en Perfil.');
                                }}>
                                    <Printer size={18} className="mr-2"/> Imprimir Ticket Térmico
                                </Button>
                            </>
                        )}
                        {associatedCreditNote && (
                            <>
                                <Button variant="secondary" onClick={() => generatePDF(associatedCreditNote, 'credit-note', companyProfile, customerDetails, emitterInfoForPDF, 'view')}>
                                    <FileText size={18} className="mr-2"/> Ver Nota de Crédito
                                </Button>
                                <Button variant="secondary" onClick={() => handleOpenEmailModal('credit-note', associatedCreditNote)}>
                                    <Mail size={18} className="mr-2"/> Enviar por Correo
                                </Button>
                            </>
                        )}
                        {associatedDebitNote && (
                            <>
                                <Button variant="secondary" onClick={() => generatePDF(associatedDebitNote, 'debit-note', companyProfile, customerDetails, emitterInfoForPDF, 'view')}>
                                    <FileText size={18} className="mr-2"/> Ver Nota de Débito
                                </Button>
                                <Button variant="secondary" onClick={() => handleOpenEmailModal('debit-note', associatedDebitNote)}>
                                    <Mail size={18} className="mr-2"/> Enviar por Correo
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Información del cliente, estado y pago */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b py-4 mb-4">
                        <div><h4 className="font-bold">Cliente:</h4><p>{invoice.customerName}</p></div>
                        <div>
                            <h4 className="font-bold">Estado del Pedido:</h4>
                            <select defaultValue={invoice.status} onChange={(e) => updateStatus(e.target.value)} className="input-base mt-1" disabled={!invoice.isBilled}>
                                <option>Pendiente</option>
                                <option>En Proceso</option>
                                <option>Listo para Recoger</option>
                                <option>Completado</option>
                            </select>
                            {!invoice.isBilled && <p className="text-xs text-gray-500 mt-1">Debes facturar para cambiar el estado.</p>}
                        </div>
                        <div>
                            <h4 className="font-bold">Estado del Pago:</h4>
                            <p>{invoice.paymentStatus} ({formatCurrency(invoice.paidAmount, companyProfile.currency)})</p>
                            <Button onClick={() => setShowPaymentModal(true)} className="mt-1 w-full" disabled={!invoice.isBilled || invoice.paymentStatus === 'Pagado'}>Registrar Pago</Button>
                        </div>
                    </div>

                    {/* Artículos */}
                    <h4 className="font-bold mb-2">Artículos del Pedido:</h4>
                    <div className="overflow-y-auto flex-1 space-y-4">
                        {(invoice.items || []).map((item, index) => {
                            const itemKey = item.id || item.cartId || `item-${index}`;
                            const lineDiscount = Number(perLineDiscounts[itemKey] || 0);
                            const isDiscounted = lineDiscount > 0;
                            return (
                            <div key={itemKey} className={`rounded-lg p-4 ${isDiscounted ? 'bg-yellow-50 border-l-4 border-yellow-300' : 'bg-gray-50'}`}>
                                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2">
                                            <h5 className="font-bold text-lg">{item.productName} ({item.quantity}x)</h5>
                                            {isDiscounted ? (
                                                <div className="text-right">
                                                    <p className="text-sm text-gray-500 line-through">{formatCurrency(item.quantity * (item.unitPrice ?? item.price ?? 0), companyProfile.currency)}</p>
                                                    <p className="font-bold text-lg">{formatCurrency((item.quantity * (item.unitPrice ?? item.price ?? 0)) - lineDiscount, companyProfile.currency)}</p>
                                                </div>
                                            ) : (
                                                <p className="font-bold text-lg">{formatCurrency(item.quantity * (item.unitPrice ?? item.price ?? 0), companyProfile.currency)}</p>
                                            )}
                                </div>
                                <div className="mt-2 pl-4 border-l-2 border-indigo-200">
                                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2">
                                        <p className="font-semibold text-sm">Notas:</p>
                                        {editingNotes.itemId !== itemKey && (
                                            <button onClick={() => setEditingNotes({ itemId: itemKey, text: item.customizationNotes || '' })} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Edit size={12}/> Editar</button>
                                        )}
                                    </div>
                                    {editingNotes.itemId === itemKey ? (
                                        <div className="mt-1">
                                            <textarea value={editingNotes.text} onChange={(e) => setEditingNotes({ ...editingNotes, text: e.target.value })} className="input-base text-sm" rows="3" />
                                            <div className="flex gap-2 mt-1">
                                                <Button size="sm" onClick={handleSaveNotes}><Save size={12} className="mr-1"/> Guardar</Button>
                                                <Button size="sm" variant="secondary" onClick={() => setEditingNotes({ itemId: null, text: '' })}><X size={12} className="mr-1"/> Cancelar</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{item.customizationNotes || "Ninguna"}</p>
                                    )}

                                    {/* Mostrar descuento por línea si aplica */}
                                    {isDiscounted && (
                                        <div className="mt-3 flex items-center justify-between bg-white/60 rounded-md p-2">
                                            <div>
                                                <p className="text-sm font-semibold text-yellow-800">Descuento aplicado</p>
                                                <p className="text-xs text-gray-600">Este artículo recibe un descuento del cupón</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-red-600 font-bold">-{formatCurrency(lineDiscount, companyProfile.currency)}</p>
                                                <p className="text-xs text-gray-500">Total: {formatCurrency(((item.unitPrice ?? item.price ?? 0) * item.quantity) - lineDiscount, companyProfile.currency)}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* --- LÓGICA DE VISUALIZACIÓN ACTUALIZADA --- */}
                                    {item.customImageUrls && item.customImageUrls.length > 0 && (
                                        <>
                                            <p className="font-semibold text-sm mt-2">Imágenes de Diseño:</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {item.customImageUrls.map((url, idx) => (
                                                    <div key={idx} onClick={() => setViewingImage(url)} className="w-16 h-16 border rounded-md p-1 cursor-pointer hover:border-indigo-500">
                                                        <img src={url} alt={`Diseño ${idx + 1}`} className="w-full h-full object-contain"/>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                    </div>

                    {/* Acciones finales */}
                    <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mt-6 border-t pt-4 gap-2">
                        <div className="flex flex-wrap gap-2">
                            {!invoice.isBilled ? (
                                <>
                                    <Button onClick={() => setShowBillingModal(true)}><FileSignature size={18} className="mr-2"/> Facturar Pedido</Button>
                                    <Button variant="secondary" onClick={() => setConfirmAction({ action: 'cancel', payload: invoice })}><XCircle size={18} className="mr-2"/> Cancelar Pedido</Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={() => setShowCreditNoteModal(true)} disabled={!!associatedCreditNote}><FileSignature size={18} className="mr-2"/> Nota de Crédito</Button>
                                    <Button onClick={() => setShowDebitNoteModal(true)} disabled={!!associatedDebitNote}><FileSignature size={18} className="mr-2"/> Nota de Débito</Button>
                                </>
                            )}
                            {isMasterUser && (
                                <Button variant="danger" onClick={() => setConfirmAction({ action: 'forceDelete', payload: invoice })}><Trash2 size={18} className="mr-2"/> Eliminar (Admin)</Button>
                            )}
                            <div className="flex items-center gap-2">
                                <select value={couponRedemptionPolicyState} onChange={(e) => setCouponRedemptionPolicyState(e.target.value)} className="input-base">
                                    <option value="both">Redimir: Ambos</option>
                                    <option value="onPayment">Redimir: Al pagar</option>
                                    <option value="onBilling">Redimir: Al facturar</option>
                                </select>
                                <input placeholder="Código cupón" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="input-base" />
                                <Button onClick={handleApplyCoupon} disabled={couponLoading}>{couponLoading ? 'Aplicando...' : 'Aplicar'}</Button>
                                {appliedCoupon && <Button variant="secondary" onClick={handleRemoveCoupon}>Quitar</Button>}
                            </div>
                        </div>
                                <div className="text-right">
                           <p>Subtotal (sin ITBIS): {formatCurrency(invoice.subtotal, companyProfile.currency)}</p>
                           {invoice.taxAmount > 0 && <p className="text-gray-600">ITBIS: +{formatCurrency(invoice.taxAmount, companyProfile.currency)}</p>}
                           {invoice.discountAmount > 0 && <p className="text-red-600">Descuento: -{formatCurrency(invoice.discountAmount, companyProfile.currency)}</p>}
                           <p className="text-2xl font-bold mt-2">Total del Pedido: <span className="text-indigo-600">{formatCurrency(invoice.total, companyProfile.currency)}</span></p>
                        </div>
                    </div>
                </div>
            </div>
            
            {showBillingModal && <BillingTypeModal 
                onClose={() => setShowBillingModal(false)}
                onConfirm={handleFacturar}
                customer={customerDetails}
                companyProfile={companyProfile}
            />}

            {viewingImage && <ImageViewerModal imageUrl={viewingImage} onClose={() => setViewingImage(null)} />}
            
            <ConfirmationModal 
                show={!!confirmAction} 
                onClose={() => setConfirmAction(null)} 
                onConfirm={handleActionConfirm}
                title={confirmAction?.action.includes('Delete') ? 'Eliminación Permanente' : 'Confirmar Cancelación'}
                message={`¿Estás seguro? Esta acción es irreversible.`}
                confirmColor={confirmAction?.action.includes('Delete') ? "bg-red-700 hover:bg-red-800" : "bg-yellow-500 hover:bg-yellow-600"}
            />
            {showPaymentModal && <PaymentModal invoice={invoice} customers={customers} companyProfile={companyProfile} onClose={() => setShowPaymentModal(false)} onSuccess={handlePaymentSuccess} />}
            {showCreditNoteModal && <CreditNoteModal invoice={invoice} onClose={() => setShowCreditNoteModal(false)} onSuccess={handleCreditNoteSuccess} companyProfile={companyProfile} customers={customers} />}
            {showDebitNoteModal && <DebitNoteModal invoice={invoice} onClose={() => setShowDebitNoteModal(false)} onSuccess={handleDebitNoteSuccess} companyProfile={companyProfile} customers={customers} />}
            {showEmailModal && <SendEmailModal 
                 isOpen={showEmailModal} 
                 onClose={() => setShowEmailModal(false)} 
                 defaultEmail={customerDetails?.email || ''} 
                 docName={emailModalData.docName} 
                 filename={emailModalData.filename} 
                 base64Attachment={emailModalData.base64Attachment} 
             />}
        </>
    );
};

export default InvoiceDetailModal;
