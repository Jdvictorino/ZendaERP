/**
 * Vista de Facturas y Pedidos - Versión SQL
 * Migrada de Firebase a PostgreSQL API
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Archive, ChevronRight, Mail } from 'lucide-react';
import Card, { CardBody } from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import InvoiceDetailModal from '../components/modals/InvoiceDetailModal';
import BillingTypeModal from '../components/modals/BillingTypeModal';
import SendEmailModal from '../components/modals/SendEmailModal';
import toast from 'react-hot-toast';
import { generatePDF } from '../utils/pdfGenerator';

import { formatCurrency } from '../utils/formatCurrency';
import api from '../api/client';
import { useApiCrud, useApi } from '../hooks/useApi';

const InvoicesViewSQL = ({ companyProfile, isMasterUser, currentUserProfile }) => {
    const appId = 'zenda-erp';
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [billingOrder, setBillingOrder] = useState(null);


    // Datos desde API
    const { data: invoicesData, loading: loadingInvoices, refetch: refetchInvoices } = useApiCrud('/invoices');
    const { data: customersData } = useApiCrud('/customers');

    
    // La API devuelve arrays directamente (el hook ya extrae .data de la respuesta)
    const invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data || []);
    const customers = Array.isArray(customersData) ? customersData : (customersData?.data || []);


    const safeCustomers = customers || [];

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailModalData, setEmailModalData] = useState({ docName: '', filename: '', base64Attachment: '', defaultEmail: '' });

    const handleOpenEmailModal = async (docType, docObject) => {
        const client = safeCustomers.find(c => c.id === docObject.customerId) || {};
        const clientEmail = client.email || '';
        
        let docName = '';
        let filename = '';
        let defaultSubject = '';
        let defaultBody = '';

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
        }

        const smtpSettings = companyProfile?.settings?.smtp || {};
        const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

        const emitterInfoForPDF = docObject.emitterInfo || (currentUserProfile ? {
            fullName: `${currentUserProfile.firstName} ${currentUserProfile.lastName}`,
            employeeId: currentUserProfile.employeeId,
            cargo: currentUserProfile.cargo
        } : null);

        if (hasSmtpConfig) {
            try {
                toast.loading('Generando documento PDF...', { id: 'pdf-gen' });
                const dataUrl = await generatePDF(
                    docObject,
                    docType,
                    companyProfile,
                    client,
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
                    base64Attachment,
                    defaultEmail: clientEmail
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
                    client,
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

    // Facturar pedido
    const handleFacturar = async (ncfType, customerRnc) => {
        if (!billingOrder) return;
        
        try {
            await api.invoices.bill(billingOrder.id, ncfType, customerRnc);
            refetchInvoices();
            setBillingOrder(null);
        } catch (error) {
            console.error('Error al facturar:', error);
            alert(`Error al facturar: ${error.message}`);
        }
    };

    const formatDate = (date) => {
        if (!date) return '-';
        const d = date?.seconds ? new Date(date.seconds * 1000) : new Date(date);
        return d.toLocaleDateString('es-DO');
    };

    const getStatusColor = (status) => ({
        'Pendiente': 'bg-yellow-100 text-yellow-800',
        'En Proceso': 'bg-blue-100 text-blue-800',
        'Listo para Recoger': 'bg-indigo-100 text-indigo-800',
        'Completado': 'bg-green-100 text-green-800',
        'Cancelado': 'bg-red-100 text-red-800',
        'Anulado': 'bg-gray-500 text-white'
    }[status] || 'bg-gray-100 text-gray-800');

    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [columnFilters, setColumnFilters] = useState({
        orderNumber: '',
        customer: '',
        invoiceStatuses: [],
        orderStatuses: [],
        minTotal: '',
        maxTotal: '',
        dateFrom: '',
        dateTo: '',
    });
    const headerClickTimeout = useRef(null);

    useEffect(() => {
        return () => {
            if (headerClickTimeout.current) {
                clearTimeout(headerClickTimeout.current);
            }
        };
    }, []);

    const safeInvoices = invoices || [];
    
    const uniqueCustomers = useMemo(() => {
        const set = new Set();
        safeInvoices.forEach(inv => { if (inv.customerName) set.add(inv.customerName); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [safeInvoices]);

    const uniqueOrderStatuses = useMemo(() => {
        const set = new Set();
        safeInvoices.forEach(inv => { if (inv.status) set.add(inv.status); });
        return Array.from(set);
    }, [safeInvoices]);

    const invoiceStatusOptions = [
        { label: 'Facturado', value: 'facturado' },
        { label: 'Sin Facturar', value: 'sin_facturar' },
    ];

    const getInvoiceDateValue = (inv) => {
        if (inv.date?.seconds) return inv.date.seconds * 1000;
        if (inv.date) {
            const parsed = new Date(inv.date);
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        return 0;
    };

    const toggleFilterDropdown = (key) => {
        setActiveHeaderFilter(prev => (prev === key ? null : key));
    };

    const handleHeaderSortClick = (columnKey) => {
        if (headerClickTimeout.current) return;
        headerClickTimeout.current = setTimeout(() => {
            headerClickTimeout.current = null;
            setActiveHeaderFilter(null);
            setSortConfig(prev => {
                if (prev.key === columnKey) {
                    return { key: columnKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                }
                return { key: columnKey, direction: 'asc' };
            });
        }, 180);
    };

    const handleHeaderDoubleClick = (columnKey) => {
        if (headerClickTimeout.current) {
            clearTimeout(headerClickTimeout.current);
            headerClickTimeout.current = null;
        }
        toggleFilterDropdown(columnKey);
    };

    const getSortIndicator = (columnKey) => {
        if (sortConfig.key !== columnKey) return '↕';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    const updateColumnFilter = (key, value) => {
        setColumnFilters(prev => ({ ...prev, [key]: value }));
    };

    const toggleArrayFilterValue = (key, value) => {
        setColumnFilters(prev => {
            const next = prev[key]?.includes(value)
                ? prev[key].filter(v => v !== value)
                : [...prev[key], value];
            return { ...prev, [key]: next };
        });
    };

    const clearFilterGroup = (keys) => {
        setColumnFilters(prev => {
            const clone = { ...prev };
            keys.forEach(key => {
                clone[key] = Array.isArray(prev[key]) ? [] : '';
            });
            return clone;
        });
    };

    const getSortableValue = (invoice, key) => {
        switch (key) {
            case 'orderNumber':
                return invoice.orderNumber || '';
            case 'customer':
                return invoice.customerName || '';
            case 'date':
                return getInvoiceDateValue(invoice);
            case 'total':
                return Number(invoice.total || 0);
            case 'invoiceStatus':
                return invoice.isBilled ? 1 : 0;
            case 'orderStatus':
                return invoice.status || '';
            default:
                return '';
        }
    };

    const filteredInvoices = useMemo(() => {
        let rows = [...safeInvoices];
        if (q.trim()) {
            const t = q.trim().toLowerCase();
            rows = rows.filter(inv => `${inv.orderNumber}`.toLowerCase().includes(t) || (inv.customerName || '').toLowerCase().includes(t));
        }
        if (statusFilter) {
            rows = rows.filter(inv => (inv.status || '').toLowerCase() === statusFilter.toLowerCase());
        }
        if (fromDate) {
            const fromTs = new Date(fromDate).getTime();
            rows = rows.filter(inv => getInvoiceDateValue(inv) >= fromTs);
        }
        if (toDate) {
            const toTs = new Date(toDate).getTime() + 24*60*60*1000 - 1;
            rows = rows.filter(inv => getInvoiceDateValue(inv) <= toTs);
        }
        if (columnFilters.orderNumber.trim()) {
            const query = columnFilters.orderNumber.trim().toLowerCase();
            rows = rows.filter(inv => (inv.orderNumber || '').toLowerCase().includes(query));
        }
        if (columnFilters.customer) {
            rows = rows.filter(inv => (inv.customerName || '') === columnFilters.customer);
        }
        if (columnFilters.invoiceStatuses.length > 0) {
            rows = rows.filter(inv => {
                const key = inv.isBilled ? 'facturado' : 'sin_facturar';
                return columnFilters.invoiceStatuses.includes(key);
            });
        }
        if (columnFilters.orderStatuses.length > 0) {
            rows = rows.filter(inv => columnFilters.orderStatuses.includes(inv.status));
        }
        if (columnFilters.minTotal) {
            rows = rows.filter(inv => Number(inv.total || 0) >= Number(columnFilters.minTotal));
        }
        if (columnFilters.maxTotal) {
            rows = rows.filter(inv => Number(inv.total || 0) <= Number(columnFilters.maxTotal));
        }
        if (columnFilters.dateFrom) {
            const fromTs = new Date(columnFilters.dateFrom).getTime();
            rows = rows.filter(inv => getInvoiceDateValue(inv) >= fromTs);
        }
        if (columnFilters.dateTo) {
            const toTs = new Date(columnFilters.dateTo).getTime() + 24*60*60*1000 - 1;
            rows = rows.filter(inv => getInvoiceDateValue(inv) <= toTs);
        }
        rows.sort((a, b) => {
            const aVal = getSortableValue(a, sortConfig.key);
            const bVal = getSortableValue(b, sortConfig.key);

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            const aText = `${aVal || ''}`;
            const bText = `${bVal || ''}`;
            const comparison = aText.localeCompare(bText, 'es', { numeric: true, sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
        return rows;
    }, [safeInvoices, q, statusFilter, fromDate, toDate, columnFilters, sortConfig]);

    if (loadingInvoices) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-6 gap-2">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Seguimiento de Pedidos y Facturas</h2>
                {/* Botones de control de caja movidos a POSBillingOrdersView */}
            </div>
            <Card className="mb-4">
                <CardBody className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input placeholder="Buscar #pedido o cliente" value={q} onChange={e => setQ(e.target.value)} />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-base">
                        <option value="">Todos los estados</option>
                        <option>Pendiente</option>
                        <option>En Proceso</option>
                        <option>Listo para Recoger</option>
                        <option>Completado</option>
                        <option>Cancelado</option>
                        <option>Anulado</option>
                    </select>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-base" />
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-base" />
                </CardBody>
            </Card>
            {!selectedInvoice ? (
            <Card>
                <CardBody className="p-0 sm:p-6">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                        <thead>
                            <tr className="border-b bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('orderNumber')}
                                        onDoubleClick={() => handleHeaderDoubleClick('orderNumber')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        N° Pedido / Factura
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('orderNumber')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'orderNumber' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'orderNumber' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Filtrar por pedido</p>
                                            <input
                                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                                placeholder="Ej. PED-123"
                                                value={columnFilters.orderNumber}
                                                onChange={e => updateColumnFilter('orderNumber', e.target.value)}
                                            />
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['orderNumber'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('customer')}
                                        onDoubleClick={() => handleHeaderDoubleClick('customer')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        Cliente
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('customer')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'customer' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'customer' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Selecciona cliente</p>
                                            <select
                                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                                                value={columnFilters.customer}
                                                onChange={e => updateColumnFilter('customer', e.target.value)}
                                            >
                                                <option value="">Todos</option>
                                                {uniqueCustomers.map(name => (
                                                    <option key={name} value={name}>{name}</option>
                                                ))}
                                            </select>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['customer'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('date')}
                                        onDoubleClick={() => handleHeaderDoubleClick('date')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        Fecha
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('date')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'date' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'date' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Rango de fechas</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Desde</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.dateFrom} onChange={e => updateColumnFilter('dateFrom', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Hasta</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.dateTo} onChange={e => updateColumnFilter('dateTo', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['dateFrom','dateTo'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('total')}
                                        onDoubleClick={() => handleHeaderDoubleClick('total')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        Total
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('total')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'total' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'total' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Rango de montos</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.minTotal} onChange={e => updateColumnFilter('minTotal', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.maxTotal} onChange={e => updateColumnFilter('maxTotal', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['minTotal','maxTotal'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('invoiceStatus')}
                                        onDoubleClick={() => handleHeaderDoubleClick('invoiceStatus')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        Estado Factura
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('invoiceStatus')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'invoiceStatus' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'invoiceStatus' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Filtrar estado</p>
                                            <div className="mt-2 space-y-2 text-sm">
                                                {invoiceStatusOptions.map(option => (
                                                    <label key={option.value} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={columnFilters.invoiceStatuses.includes(option.value)}
                                                            onChange={() => toggleArrayFilterValue('invoiceStatuses', option.value)}
                                                        />
                                                        <span>{option.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['invoiceStatuses'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('orderStatus')}
                                        onDoubleClick={() => handleHeaderDoubleClick('orderStatus')}
                                        className="flex items-center gap-1 text-gray-600"
                                    >
                                        Estado Pedido
                                        <span className="text-[10px] leading-none text-gray-500">{getSortIndicator('orderStatus')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'orderStatus' ? 'text-indigo-600' : 'text-gray-400'} />
                                    </button>
                                    {activeHeaderFilter === 'orderStatus' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Selecciona estados</p>
                                            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
                                                {uniqueOrderStatuses.map(status => (
                                                    <label key={status} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={columnFilters.orderStatuses.includes(status)}
                                                            onChange={() => toggleArrayFilterValue('orderStatuses', status)}
                                                        />
                                                        <span>{status}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['orderStatuses'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-3 text-gray-600 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map(inv => (
                                <tr key={inv.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    <td className="p-3 font-mono text-sm">{inv.orderNumber}</td>
                                    <td className="p-3 font-medium">{inv.customerName}</td>
                                    <td className="p-3">{formatDate(inv.date)}</td>
                                    <td className="p-3 font-bold">{formatCurrency(inv.total, companyProfile?.currency)}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${inv.isBilled ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                            {inv.isBilled ? 'Facturado' : 'Sin Facturar'}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${getStatusColor(inv.status)}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="p-3 flex gap-2 justify-end">
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            onClick={() => handleOpenEmailModal(inv.isBilled ? 'invoice' : 'quote', inv)}
                                            title={inv.isBilled ? "Enviar Factura por Correo" : "Enviar Cotización por Correo"}
                                            className="flex items-center gap-1.5"
                                        >
                                            <Mail size={14} /> Enviar
                                        </Button>
                                        {!inv.isBilled && (
                                            <Button size="sm" onClick={() => setBillingOrder(inv)}>Facturar</Button>
                                        )}
                                        <Button variant="secondary" size="sm" onClick={() => setSelectedInvoice(inv)}>Gestionar</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredInvoices.map(inv => (
                        <div 
                            key={inv.id} 
                            className="p-4 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
                            onClick={() => setSelectedInvoice(inv)}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col">
                                    <span className="text-xs font-mono text-gray-500">#{inv.orderNumber}</span>
                                    <span className="font-bold text-gray-900 dark:text-gray-100">{inv.customerName || 'Cliente General'}</span>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-lg text-brand-600 dark:text-brand-400">
                                        {formatCurrency(inv.total, companyProfile?.currency)}
                                    </div>
                                    <span className="text-[10px] text-gray-400 uppercase tracking-tighter">{formatDate(inv.date)}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-3">
                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${getStatusColor(inv.status)}`}>
                                    {inv.status}
                                </span>
                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${inv.isBilled ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                    {inv.isBilled ? 'Facturado' : 'Sin Facturar'}
                                </span>
                                
                                <div className="ml-auto flex gap-1 items-center">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleOpenEmailModal(inv.isBilled ? 'invoice' : 'quote', inv); }}
                                        className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"
                                        title="Enviar por Correo"
                                    >
                                        <Mail size={18} />
                                    </button>
                                    {!inv.isBilled && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setBillingOrder(inv); }}
                                            className="p-2 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg"
                                            title="Facturar"
                                        >
                                            <Archive size={18} />
                                        </button>
                                    )}
                                    <ChevronRight size={18} className="text-gray-300" />
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredInvoices.length === 0 && (
                        <div className="p-8 text-center text-gray-500">No se encontraron registros</div>
                    )}
                </div>
                </CardBody>
            </Card>
            ) : (
                <InvoiceDetailModal 
                    invoice={selectedInvoice} 
                    companyProfile={companyProfile} 
                    customers={customers}
                    onClose={() => { setSelectedInvoice(null); refetchInvoices(); }}
                    onRefresh={refetchInvoices}
                    isMasterUser={isMasterUser}
                    currentUserProfile={currentUserProfile}
                    fullPage
                />
            )}
            {billingOrder && (
                <BillingTypeModal
                    onClose={() => setBillingOrder(null)}
                    onConfirm={handleFacturar}
                    customer={safeCustomers.find(c => c.id === billingOrder.customerId)}
                    companyProfile={companyProfile}
                />
            )}
            {showEmailModal && (
                <SendEmailModal
                    isOpen={showEmailModal}
                    onClose={() => setShowEmailModal(false)}
                    docName={emailModalData.docName}
                    filename={emailModalData.filename}
                    base64Attachment={emailModalData.base64Attachment}
                    defaultEmail={emailModalData.defaultEmail}
                    companyProfile={companyProfile}
                />
            )}
        </div>
    );
};

export default InvoicesViewSQL;
