import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import api from '../../api/client.js';
import notificationService from '../../utils/notificationService.js';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import Button from '../ui/Button.jsx';
import { enqueueInvoicePaymentUpdate } from '../../utils/offlineQueue.js';
import { isGatewayConfigured, createPaymentIntent, fetchPaymentIntentStatus, mapGatewayStatusToPaymentStatus } from '../../utils/paymentGateway.js';
import { useEffect } from 'react';

const PaymentModal = ({ invoice, customers, companyProfile, onClose, onSuccess }) => {
    const amountDue = useMemo(() => invoice.total - (invoice.paidAmount || 0), [invoice]);
    const [payments, setPayments] = useState(() => {
        const initial = { efectivo: 0, chequeTransferencia: 0, tarjeta: 0, credito: 0 };
        const method = invoice.paymentMethod || '';
        if (method === 'Efectivo') initial.efectivo = amountDue;
        else if (method === 'Tarjeta') initial.tarjeta = amountDue;
        else if (method === 'Transferencia') initial.chequeTransferencia = amountDue;
        else if (method === 'Contado') initial.efectivo = amountDue;
        return initial;
    });
    const [gatewayInfo, setGatewayInfo] = useState(invoice.paymentGateway || null);
    const [isGatewayBusy, setIsGatewayBusy] = useState(false);
    const currency = companyProfile?.currency || 'USD';
    const gatewayEnabled = isGatewayConfigured(companyProfile);
    const customerDetails = useMemo(() => (customers || []).find(c => c.id === invoice.customerId), [customers, invoice.customerId]);

    const totalPaid = useMemo(() => 
        Object.values(payments).reduce((sum, val) => sum + (parseFloat(val) || 0), 0),
    [payments]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPayments(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateGatewayIntent = async () => {
        if (!gatewayEnabled) {
            toast.error('Configura primero un gateway de pagos en el perfil de la empresa.');
            return;
        }
        if (amountDue <= 0) {
            toast('La factura ya está saldada.');
            return;
        }
        setIsGatewayBusy(true);
        try {
            const intent = await createPaymentIntent({
                companyProfile,
                invoice,
                amount: amountDue,
                currency,
                customer: customerDetails,
            });

            const now = new Date().toISOString();
            const payload = {
                paymentGateway: {
                    provider: intent.provider,
                    intentId: intent.intentId,
                    paymentUrl: intent.paymentUrl,
                    status: intent.status,
                    createdAt: now,
                    lastSyncedAt: now,
                    history: [...(invoice.paymentGateway?.history || []), { status: intent.status, at: now }],
                }
            };
            await api.invoices.update(invoice.id, payload);
            setGatewayInfo(payload.paymentGateway);
            toast.success('Enlace de cobro generado. Compártelo con tu cliente.');
        } catch (err) {
            console.error('Error creando intento de pago:', err);
            toast.error(err.message || 'No se pudo generar el enlace de pago.');
        } finally {
            setIsGatewayBusy(false);
        }
    };

    const handleSyncGatewayStatus = async () => {
        if (!gatewayInfo?.intentId) {
            toast.error('No existe un intento de pago asociado.');
            return;
        }
        setIsGatewayBusy(true);
        try {
            const gatewayStatus = await fetchPaymentIntentStatus({
                companyProfile,
                intentId: gatewayInfo.intentId,
            });
            const mappedStatus = mapGatewayStatusToPaymentStatus(gatewayStatus.status);
            const now = new Date().toISOString();
            const history = [...(gatewayInfo.history || []), { status: gatewayStatus.status, at: now }];

            const updates = {
                paymentGateway: {
                    ...gatewayInfo,
                    status: gatewayStatus.status,
                    lastSyncedAt: now,
                    history,
                }
            };

            let updatedInvoice = { ...invoice, paymentGateway: updates.paymentGateway };

            if (mappedStatus === 'Pagado' && invoice.paymentStatus !== 'Pagado') {
                const received = Number(gatewayStatus.amountReceived || amountDue || 0);
                const newPaidAmount = Math.min((invoice.paidAmount || 0) + received, invoice.total);
                updates.paidAmount = newPaidAmount;
                updates.paymentStatus = 'Pagado';
                updates.payments = [...(invoice.payments || []), {
                    date: now,
                    efectivo: 0,
                    chequeTransferencia: 0,
                    tarjeta: received,
                    credito: 0,
                    viaGateway: true,
                    gatewayStatus: gatewayStatus.status,
                }];
                updatedInvoice = {
                    ...updatedInvoice,
                    paidAmount: newPaidAmount,
                    paymentStatus: 'Pagado',
                    payments: updates.payments,
                };
            }

            await api.invoices.update(invoice.id, updates);
            setGatewayInfo(updates.paymentGateway);
            toast.success('Estado sincronizado con el gateway.');
            if (updates.paymentStatus === 'Pagado' && onSuccess) {
                onSuccess(updatedInvoice);
            }
        } catch (err) {
            console.error('Error sincronizando gateway:', err);
            toast.error(err.message || 'No se pudo sincronizar el estado del pago.');
        } finally {
            setIsGatewayBusy(false);
        }
    };

    const handleCopyLink = async () => {
        if (!gatewayInfo?.paymentUrl) {
            toast.error('No hay enlace disponible.');
            return;
        }
        try {
            if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
                throw new Error('clipboard API no disponible');
            }
            await navigator.clipboard.writeText(gatewayInfo.paymentUrl);
            toast.success('Enlace copiado al portapapeles.');
        } catch (err) {
            console.error('Clipboard error', err);
            toast.error('No se pudo copiar el enlace.');
        }
    };

    const handlePayment = async () => {
        if (totalPaid <= 0) {
            toast.error("El monto a pagar debe ser mayor que cero.");
            return;
        }
        if (totalPaid > amountDue + 0.01) { // Pequeña tolerancia para errores de redondeo
            toast.error("El monto pagado no puede ser mayor que el monto pendiente.");
            return;
        }
        
        const newPaidAmount = (invoice.paidAmount || 0) + totalPaid;
        const newPaymentStatus = newPaidAmount >= invoice.total ? 'Pagado' : 'Pagado Parcialmente';

        // Guardamos el desglose del pago en la factura
        const paymentBreakdown = {
            date: new Date().toISOString(),
            efectivo: parseFloat(payments.efectivo) || 0,
            chequeTransferencia: parseFloat(payments.chequeTransferencia) || 0,
            tarjeta: parseFloat(payments.tarjeta) || 0,
            credito: parseFloat(payments.credito) || 0,
        };

        try {
            const promise = api.invoices.update(invoice.id, { 
                paidAmount: newPaidAmount, 
                paymentStatus: newPaymentStatus,
                payments: [...(invoice.payments || []), paymentBreakdown]
            });
            await toast.promise(promise, {
                loading: 'Registrando pago...',
                success: () => { playSuccessSound(); return '¡Pago registrado con éxito!'; },
                error: () => { playErrorSound(); return 'No se pudo registrar el pago.'; }
            });
            
            // Notificación del dispositivo - Pago registrado
            notificationService.notify('PAYMENT_RECEIVED', {
                title: 'Pago Recibido',
                message: `Pago de ${formatCurrency(totalPaid)} para pedido #${invoice.invoiceNumber}`,
            }, ['desktop']);
            
            onSuccess({ ...invoice, paidAmount: newPaidAmount, paymentStatus: newPaymentStatus, payments: [...(invoice.payments || []), paymentBreakdown] });
        } catch (err) {
            // Fallback offline: encola la operación y actualiza UI de forma optimista
            enqueueInvoicePaymentUpdate({
                invoiceId: invoice.id,
                paymentBreakdown,
                newPaidAmount,
                newPaymentStatus,
            });
            toast((t) => (
                <span>
                    Sin conexión. Pago encolado para sincronizar. <button onClick={() => toast.dismiss(t.id)} className="underline">OK</button>
                </span>
            ));
            onSuccess({ ...invoice, paidAmount: newPaidAmount, paymentStatus: newPaymentStatus, payments: [...(invoice.payments || []), paymentBreakdown] });
        }
    };

    useEffect(() => {
        const handleKeys = (e) => {
            if (e.key === 'F10') {
                e.preventDefault();
                handlePayment();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [handlePayment, onClose]);

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4">
            <div className="modal-panel p-6 w-full max-w-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-2 gap-2">
                    <h3 className="text-lg font-semibold text-ink">Registrar Pago</h3>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <p className="text-ink-soft mb-4">Pedido: {invoice.invoiceNumber}</p>
                
                <div className="space-y-4">
                    <div className="p-4 bg-surface-muted rounded-lg text-center">
                        <p className="text-ink-soft">Monto Pendiente</p>
                        <p className="text-3xl font-bold text-brand-600">{formatCurrency(amountDue, currency)}</p>
                    </div>
                    
                    <fieldset className="border p-4 rounded-lg">
                        <legend className="font-semibold px-2">Desglose del Pago</legend>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-ink-soft mb-1">Efectivo</label>
                                <input type="number" name="efectivo" value={payments.efectivo} onChange={handleChange} className="input-base" min="0" step="0.01" />
                            </div>
                            <div>
                                <label className="block text-ink-soft mb-1">Cheque/Transf./Depósito</label>
                                <input type="number" name="chequeTransferencia" value={payments.chequeTransferencia} onChange={handleChange} className="input-base" min="0" step="0.01" />
                            </div>
                            <div>
                                <label className="block text-ink-soft mb-1">Tarjeta Débito/Crédito</label>
                                <input type="number" name="tarjeta" value={payments.tarjeta} onChange={handleChange} className="input-base" min="0" step="0.01" />
                            </div>
                            <div>
                                <label className="block text-ink-soft mb-1">Venta a Crédito</label>
                                <input type="number" name="credito" value={payments.credito} onChange={handleChange} className="input-base" min="0" step="0.01" />
                            </div>
                        </div>
                    </fieldset>

                    <div className="p-4 bg-blue-50 rounded-lg text-right">
                        <p className="text-ink-soft">Total Ingresado</p>
                        <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalPaid, currency)}</p>
                    </div>
                </div>

                {gatewayEnabled && (
                    <div className="mt-6 border rounded-lg p-4 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                                <h4 className="font-semibold text-ink">Cobro mediante Gateway</h4>
                                <p className="text-sm text-ink-muted">Genera un enlace de pago o sincroniza el estado con tu pasarela.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" onClick={handleCreateGatewayIntent} disabled={isGatewayBusy}>
                                    Generar enlace
                                </Button>
                                <Button size="sm" variant="secondary" onClick={handleSyncGatewayStatus} disabled={isGatewayBusy || !gatewayInfo?.intentId}>
                                    Actualizar estado
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleCopyLink} disabled={!gatewayInfo?.paymentUrl}>
                                    Copiar enlace
                                </Button>
                            </div>
                        </div>
                        {gatewayInfo ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-surface-muted rounded-md p-3 border border-dashed border-line">
                                <div><span className="font-semibold text-ink-soft">Proveedor:</span> {gatewayInfo.provider || 'N/D'}</div>
                                <div><span className="font-semibold text-ink-soft">Estado:</span> {gatewayInfo.status || 'Sin estado'}</div>
                                <div className="truncate"><span className="font-semibold text-ink-soft">Intento:</span> {gatewayInfo.intentId || 'N/D'}</div>
                                <div><span className="font-semibold text-ink-soft">Última sincronización:</span> {gatewayInfo.lastSyncedAt?.toDate?.().toLocaleString?.() || gatewayInfo.lastSyncedAt || 'N/D'}</div>
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted">Aún no se ha generado ningún intento de cobro mediante el gateway configurado.</p>
                        )}
                        {isGatewayBusy && <p className="text-xs text-blue-600">Comunicando con el gateway...</p>}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="button" onClick={handlePayment}>Confirmar Pago</Button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
