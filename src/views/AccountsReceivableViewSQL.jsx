import React, { useMemo, useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import PaymentModal from '../components/modals/PaymentModal.jsx';
import ReceivableDetailModal from '../components/modals/ReceivableDetailModal.jsx';
import { AlertTriangle, CalendarDays, Clock, Users, ChevronDown, Mail } from 'lucide-react';
import { useApiCrud } from '../hooks/useApi.js';
import toast from 'react-hot-toast';
import { generatePDF, generateAccountStatementPDF } from '../utils/pdfGenerator.js';
import SendEmailModal from '../components/modals/SendEmailModal.jsx';

const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDueDate = (invoice) => {
    const candidates = [invoice.dueDate, invoice.paymentDueDate, invoice.deliveryDate, invoice.date];
    for (const value of candidates) {
        const parsed = parseTimestamp(value);
        if (parsed) return parsed;
    }
    return null;
};

const getDaysBetween = (from, to) => {
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.round((start - end) / (1000 * 60 * 60 * 24));
};

const agingBucketFor = (daysOverdue) => {
    if (daysOverdue <= 0) return 'Al día';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
};

const AccountsReceivableViewSQL = ({ companyProfile = {} }) => {
    // Cargar datos desde la API
    const { data: invoicesRaw, loading: loadingInvoices, refetch: refetchInvoices } = useApiCrud('/invoices');
    const { data: customersRaw, loading: loadingCustomers } = useApiCrud('/customers');
    
    const invoices = invoicesRaw || [];
    const customers = customersRaw || [];
    const loading = loadingInvoices || loadingCustomers;

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'dueDate', direction: 'asc' });
    const [columnFilters, setColumnFilters] = useState({
        invoiceId: '',
        customer: '',
        issueFrom: '',
        issueTo: '',
        dueFrom: '',
        dueTo: '',
        minTotal: '',
        maxTotal: '',
        minPaid: '',
        maxPaid: '',
        minOutstanding: '',
        maxOutstanding: '',
        minDays: '',
        maxDays: '',
        statuses: [],
    });
    const headerClickTimeout = useRef(null);
    const currency = companyProfile?.currency || 'USD';

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailModalData, setEmailModalData] = useState({ docName: '', filename: '', base64Attachment: '', defaultEmail: '' });

    const handleQuickSendInvoice = async (entry) => {
        const invoice = entry?.invoice;
        const customer = entry?.customer || {};
        if (!invoice) return;
        
        const clientEmail = customer.email || '';
        const num = invoice.invoiceNumber || invoice.orderNumber || 'N/A';
        const docName = `Factura ${num}`;
        const filename = `factura-${num}.pdf`;
        const defaultSubject = `[Zenda ERP] Factura ${num}`;
        const defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su factura correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;

        const smtpSettings = companyProfile?.settings?.smtp || {};
        const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

        if (hasSmtpConfig) {
            try {
                toast.loading('Generando documento PDF...', { id: 'pdf-gen' });
                const dataUrl = await generatePDF(
                    invoice,
                    'invoice',
                    companyProfile,
                    customer,
                    invoice?.emitterInfo,
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
                    invoice,
                    'invoice',
                    companyProfile,
                    customer,
                    invoice?.emitterInfo,
                    'download'
                );
            } catch (err) {
                console.error('Auto-download PDF failed:', err);
            }

            const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
            window.location.href = mailtoUrl;
        }
    };

    const handleQuickSendStatement = async (entry) => {
        const customer = entry?.customer || {};
        const customerName = customer.name || entry?.customerName || 'Cliente';
        const clientEmail = customer.email || '';
        
        // Buscar todos los movimientos asociados a este cliente para armar el estado de cuenta
        const statementForCustomer = receivableEntries.filter(candidate => {
            const candidateId = candidate.invoice.customerId || candidate.customer?.id;
            const entryId = entry.invoice.customerId || entry.customer?.id;
            const sameId = candidateId && entryId && candidateId === entryId;
            const sameName = candidate.customerName && entry.customerName && candidate.customerName === entry.customerName;
            return sameId || sameName;
        });

        if (!statementForCustomer.length) {
            toast.error('No hay movimientos pendientes para generar el estado de cuenta.');
            return;
        }

        const docName = `Estado de Cuenta - ${customerName}`;
        const filename = `estado-de-cuenta-${customerName.replace(/\s+/g, '-')}.pdf`;
        const defaultSubject = `[Zenda ERP] Estado de Cuenta - ${customerName}`;
        const defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su estado de cuenta correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;

        const smtpSettings = companyProfile?.settings?.smtp || {};
        const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

        if (hasSmtpConfig) {
            try {
                toast.loading('Generando Estado de Cuenta...', { id: 'pdf-gen' });
                const dataUrl = await generateAccountStatementPDF({
                    entries: statementForCustomer,
                    companyProfile,
                    customer,
                    action: 'dataurl',
                });
                toast.dismiss('pdf-gen');

                if (!dataUrl) {
                    toast.error('No se pudo generar el Estado de Cuenta.');
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
                toast.error('Error al generar el Estado de Cuenta para adjuntar.');
            }
        } else {
            toast.success('Abriendo cliente de correo nativo... ¡Descarga y adjunta el PDF!');
            try {
                generateAccountStatementPDF({
                    entries: statementForCustomer,
                    companyProfile,
                    customer,
                    action: 'download',
                });
            } catch (err) {
                console.error('Auto-download PDF failed:', err);
            }

            const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
            window.location.href = mailtoUrl;
        }
    };

    const customerIndex = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
    const today = useMemo(() => new Date(), []);

    // Listener para abrir modal desde click en alerta (CustomEvent desde AlertCenter)
    useEffect(() => {
        const handleAlertEntity = (event) => {
            const alert = event.detail;
            if (!alert || alert.type !== 'overdue_invoice') return;
            const invoiceId = alert.data?.invoiceId;
            if (!invoiceId) return;

            // Buscar la entrada en la lista de cuentas por cobrar
            // La lista puede no estar cargada aún; esperamos un tick
            setTimeout(() => {
                const targetInvoice = (invoices || []).find(inv => inv.id === invoiceId);
                if (targetInvoice) {
                    setSelectedInvoice(targetInvoice);
                }
            }, 100);
        };

        window.addEventListener('open-alert-entity', handleAlertEntity);
        return () => window.removeEventListener('open-alert-entity', handleAlertEntity);
    }, [invoices]);

    const receivableEntries = useMemo(() => {
        return (invoices || [])
            .filter(inv => inv && inv.total)
            .map(inv => {
                const total = Number(inv.total || 0);
                const paid = Number(inv.paidAmount || 0);
                const outstanding = Math.max(0, total - paid);
                const dueDate = getDueDate(inv);
                const overdueDays = dueDate ? getDaysBetween(today, dueDate) : 0;
                const bucket = agingBucketFor(overdueDays);
                const customer = customerIndex.get(inv.customerId);
                const status = inv.paymentStatus || (paid <= 0 ? 'Pendiente' : outstanding > 0 ? 'Parcial' : 'Pagado');
                return {
                    invoice: inv,
                    total,
                    paid,
                    outstanding,
                    dueDate,
                    overdueDays,
                    bucket,
                    status,
                    customer,
                    customerName: inv.customerName || customer?.name || 'Cliente invitado',
                };
            })
            .filter(entry => entry.outstanding > 0.01 && entry.invoice.status !== 'Cancelado')
            .sort((a, b) => {
                if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return b.outstanding - a.outstanding;
            });
    }, [invoices, customerIndex, today]);

    const uniqueCustomers = useMemo(() => {
        const set = new Set();
        receivableEntries.forEach(entry => {
            if (entry.customerName) set.add(entry.customerName);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [receivableEntries]);

    const statusOptions = [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Parcial', value: 'parcial' },
        { label: 'Pagado', value: 'pagado' },
        { label: 'Vencido', value: 'vencido' },
    ];

    const getIssueDateValue = (entry) => {
        const date = parseTimestamp(entry.invoice.date);
        return date ? date.getTime() : 0;
    };

    const getDueDateValue = (entry) => (entry.dueDate ? entry.dueDate.getTime() : 0);

    const getSortableValue = (entry, key) => {
        switch (key) {
            case 'invoice':
                return entry.invoice.orderNumber || entry.invoice.invoiceNumber || entry.invoice.id || '';
            case 'customer':
                return entry.customerName || '';
            case 'issueDate':
                return getIssueDateValue(entry);
            case 'dueDate':
                return getDueDateValue(entry);
            case 'total':
                return entry.total;
            case 'paid':
                return entry.paid;
            case 'outstanding':
                return entry.outstanding;
            case 'days':
                return entry.overdueDays;
            case 'status':
                return entry.overdueDays > 0 ? 'Vencido' : (entry.status || '');
            default:
                return '';
        }
    };

    const filteredEntries = useMemo(() => {
        let entries = receivableEntries;

        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            entries = entries.filter(entry => {
                const matchesInvoice = `${entry.invoice.orderNumber || entry.invoice.id || ''}`.toLowerCase().includes(term);
                const matchesCustomer = entry.customerName.toLowerCase().includes(term);
                return matchesInvoice || matchesCustomer;
            });
        }

        switch (statusFilter) {
            case 'pendiente':
                entries = entries.filter(entry => entry.paid <= 0);
                break;
            case 'parcial':
                entries = entries.filter(entry => entry.paid > 0 && entry.outstanding > 0);
                break;
            case 'vencido':
                entries = entries.filter(entry => entry.overdueDays > 0);
                break;
            default:
                break;
        }

        if (columnFilters.invoiceId.trim()) {
            const query = columnFilters.invoiceId.trim().toLowerCase();
            entries = entries.filter(entry => `${entry.invoice.orderNumber || entry.invoice.invoiceNumber || entry.invoice.id || ''}`.toLowerCase().includes(query));
        }

        if (columnFilters.customer) {
            entries = entries.filter(entry => entry.customerName === columnFilters.customer);
        }

        if (columnFilters.issueFrom) {
            const fromDate = new Date(columnFilters.issueFrom);
            if (!Number.isNaN(fromDate.getTime())) {
                entries = entries.filter(entry => getIssueDateValue(entry) >= fromDate.getTime());
            }
        }

        if (columnFilters.issueTo) {
            const toDate = new Date(columnFilters.issueTo);
            if (!Number.isNaN(toDate.getTime())) {
                const toTs = toDate.getTime() + (24 * 60 * 60 * 1000) - 1;
                entries = entries.filter(entry => getIssueDateValue(entry) <= toTs);
            }
        }

        if (columnFilters.dueFrom) {
            const fromDate = new Date(columnFilters.dueFrom);
            if (!Number.isNaN(fromDate.getTime())) {
                entries = entries.filter(entry => getDueDateValue(entry) >= fromDate.getTime());
            }
        }

        if (columnFilters.dueTo) {
            const toDate = new Date(columnFilters.dueTo);
            if (!Number.isNaN(toDate.getTime())) {
                const toTs = toDate.getTime() + (24 * 60 * 60 * 1000) - 1;
                entries = entries.filter(entry => getDueDateValue(entry) <= toTs);
            }
        }

        if (columnFilters.minTotal !== '') {
            entries = entries.filter(entry => entry.total >= Number(columnFilters.minTotal));
        }

        if (columnFilters.maxTotal !== '') {
            entries = entries.filter(entry => entry.total <= Number(columnFilters.maxTotal));
        }

        if (columnFilters.minPaid !== '') {
            entries = entries.filter(entry => entry.paid >= Number(columnFilters.minPaid));
        }

        if (columnFilters.maxPaid !== '') {
            entries = entries.filter(entry => entry.paid <= Number(columnFilters.maxPaid));
        }

        if (columnFilters.minOutstanding !== '') {
            entries = entries.filter(entry => entry.outstanding >= Number(columnFilters.minOutstanding));
        }

        if (columnFilters.maxOutstanding !== '') {
            entries = entries.filter(entry => entry.outstanding <= Number(columnFilters.maxOutstanding));
        }

        if (columnFilters.minDays !== '') {
            entries = entries.filter(entry => entry.overdueDays >= Number(columnFilters.minDays));
        }

        if (columnFilters.maxDays !== '') {
            entries = entries.filter(entry => entry.overdueDays <= Number(columnFilters.maxDays));
        }

        if (columnFilters.statuses.length > 0) {
            entries = entries.filter(entry => {
                const statusKey = entry.overdueDays > 0 ? 'vencido' : (entry.status || '').toLowerCase();
                return columnFilters.statuses.includes(statusKey);
            });
        }

        const sorted = [...entries].sort((a, b) => {
            const aVal = getSortableValue(a, sortConfig.key);
            const bVal = getSortableValue(b, sortConfig.key);

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            const comparison = `${aVal || ''}`.localeCompare(`${bVal || ''}`, 'es', { numeric: true, sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [receivableEntries, searchTerm, statusFilter, columnFilters, sortConfig]);

    const summary = useMemo(() => {
        const totalOutstanding = filteredEntries.reduce((sum, entry) => sum + entry.outstanding, 0);
        const totalInvoices = filteredEntries.length;
        const customersWithBalance = new Set(filteredEntries.map(entry => entry.invoice.customerId || entry.customerName)).size;
        const overdueCount = filteredEntries.filter(entry => entry.overdueDays > 0).length;

        const aging = filteredEntries.reduce((acc, entry) => {
            acc[entry.bucket] = (acc[entry.bucket] || 0) + entry.outstanding;
            return acc;
        }, { 'Al día': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });

        return { totalOutstanding, totalInvoices, customersWithBalance, overdueCount, aging };
    }, [filteredEntries]);

    const [detailEntry, setDetailEntry] = useState(null);
    const [detailStatementEntries, setDetailStatementEntries] = useState([]);

    useEffect(() => () => {
        if (headerClickTimeout.current) {
            clearTimeout(headerClickTimeout.current);
        }
    }, []);

    const toggleFilterDropdown = (key) => {
        setActiveHeaderFilter(prev => (prev === key ? null : key));
    };

    const handleHeaderSortClick = (key) => {
        if (headerClickTimeout.current) return;
        headerClickTimeout.current = setTimeout(() => {
            headerClickTimeout.current = null;
            setActiveHeaderFilter(null);
            setSortConfig(prev => {
                if (prev.key === key) {
                    return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                }
                return { key, direction: 'asc' };
            });
        }, 180);
    };

    const handleHeaderDoubleClick = (key) => {
        if (headerClickTimeout.current) {
            clearTimeout(headerClickTimeout.current);
            headerClickTimeout.current = null;
        }
        toggleFilterDropdown(key);
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return 'â†•';
        return sortConfig.direction === 'asc' ? 'â†‘' : 'â†“';
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

    const handleRegisterPayment = (invoice) => {
        setSelectedInvoice(invoice);
        setShowPaymentModal(true);
    };

    const handleViewDetails = (entry) => {
        const statementForCustomer = receivableEntries.filter(candidate => {
            const candidateId = candidate.invoice.customerId || candidate.customer?.id;
            const entryId = entry.invoice.customerId || entry.customer?.id;
            const sameId = candidateId && entryId && candidateId === entryId;
            const sameName = candidate.customerName && entry.customerName && candidate.customerName === entry.customerName;
            return sameId || sameName;
        });

        const targetCustomer = entry.customer || {
            name: entry.customerName,
            email: entry.invoice?.customerEmail,
            contactEmail: entry.invoice?.customerEmail,
            phone: entry.invoice?.customerPhone,
            address: entry.invoice?.customerAddress,
            identificationNumber: entry.invoice?.customerTaxId,
        };

        setDetailEntry({ ...entry, customer: targetCustomer });
        setDetailStatementEntries(statementForCustomer);
    };
    const handlePaymentSuccess = () => {
        setShowPaymentModal(false);
        setSelectedInvoice(null);
        refetchInvoices(); // Refresh data after payment
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Gestión de Cobros</h2>
                    <p className="text-slate-500 dark:text-slate-400">Monitorea tus cuentas por cobrar y registra pagos parciales o totales.</p>
                </div>
            </div>

            <Card>
                <CardBody className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Total por Cobrar</p>
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(summary.totalOutstanding, currency)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Facturas Pendientes</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.totalInvoices}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 flex items-center gap-3">
                        <Users className="h-8 w-8 text-slate-400" />
                        <div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Clientes con Saldo</p>
                            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">{summary.customersWithBalance}</p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">En mora</p>
                            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">{summary.overdueCount}</p>
                        </div>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardBody>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por cliente o # de factura"
                        />
                        <select className="input-base" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="todos">Todos los estados</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="parcial">Pago Parcial</option>
                            <option value="vencido">Vencidos</option>
                        </select>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardBody className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                            <tr>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('invoice')}
                                        onDoubleClick={() => handleHeaderDoubleClick('invoice')}
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Factura
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('invoice')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'invoice' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'invoice' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Buscar factura</p>
                                            <input
                                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                                                placeholder="Ej. PED-045"
                                                value={columnFilters.invoiceId}
                                                onChange={e => updateColumnFilter('invoiceId', e.target.value)}
                                            />
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['invoiceId'])}>Limpiar</button>
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
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Cliente
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('customer')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'customer' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'customer' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
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
                                        onClick={() => handleHeaderSortClick('issueDate')}
                                        onDoubleClick={() => handleHeaderDoubleClick('issueDate')}
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Fecha
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('issueDate')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'issueDate' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'issueDate' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Fecha de emisión</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Desde</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.issueFrom} onChange={e => updateColumnFilter('issueFrom', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Hasta</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.issueTo} onChange={e => updateColumnFilter('issueTo', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['issueFrom','issueTo'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('dueDate')}
                                        onDoubleClick={() => handleHeaderDoubleClick('dueDate')}
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Vence
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('dueDate')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'dueDate' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'dueDate' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Fecha de vencimiento</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Desde</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.dueFrom} onChange={e => updateColumnFilter('dueFrom', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Hasta</span>
                                                    <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.dueTo} onChange={e => updateColumnFilter('dueTo', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['dueFrom','dueTo'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('total')}
                                        onDoubleClick={() => handleHeaderDoubleClick('total')}
                                        className="flex w-full items-center justify-end gap-1 text-slate-600"
                                    >
                                        Total
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('total')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'total' ? 'text-indigo-600' : 'text-slate-400'} />
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
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('paid')}
                                        onDoubleClick={() => handleHeaderDoubleClick('paid')}
                                        className="flex w-full items-center justify-end gap-1 text-slate-600"
                                    >
                                        Pagado
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('paid')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'paid' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'paid' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Rango pagado</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.minPaid} onChange={e => updateColumnFilter('minPaid', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.maxPaid} onChange={e => updateColumnFilter('maxPaid', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['minPaid','maxPaid'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('outstanding')}
                                        onDoubleClick={() => handleHeaderDoubleClick('outstanding')}
                                        className="flex w-full items-center justify-end gap-1 text-slate-600"
                                    >
                                        Saldo
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('outstanding')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'outstanding' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'outstanding' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Saldo pendiente</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.minOutstanding} onChange={e => updateColumnFilter('minOutstanding', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.maxOutstanding} onChange={e => updateColumnFilter('maxOutstanding', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['minOutstanding','maxOutstanding'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('days')}
                                        onDoubleClick={() => handleHeaderDoubleClick('days')}
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Días
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('days')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'days' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'days' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Rango de días</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Mínimo</span>
                                                    <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.minDays} onChange={e => updateColumnFilter('minDays', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-slate-500">Máximo</span>
                                                    <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={columnFilters.maxDays} onChange={e => updateColumnFilter('maxDays', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['minDays','maxDays'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('status')}
                                        onDoubleClick={() => handleHeaderDoubleClick('status')}
                                        className="flex items-center gap-1 text-slate-600"
                                    >
                                        Estado
                                        <span className="text-[10px] leading-none text-slate-500">{getSortIndicator('status')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'status' ? 'text-indigo-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'status' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
                                            <p className="text-sm font-semibold text-slate-900">Estados</p>
                                            <div className="mt-2 space-y-2 text-sm">
                                                {statusOptions.map(option => (
                                                    <label key={option.value} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={columnFilters.statuses.includes(option.value)}
                                                            onChange={() => toggleArrayFilterValue('statuses', option.value)}
                                                        />
                                                        <span>{option.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => clearFilterGroup(['statuses'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntries.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="p-6 text-center text-slate-500">No hay cuentas por cobrar con los filtros seleccionados.</td>
                                </tr>
                            )}
                            {filteredEntries.map(entry => {
                                const { invoice } = entry;
                                const invoiceDate = parseTimestamp(invoice.date);
                                return (
                                    <tr
                                        key={invoice.id}
                                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer"
                                        onDoubleClick={() => handleViewDetails(entry)}
                                    >
                                        <td className="p-3 font-mono">{invoice.orderNumber || invoice.invoiceNumber || invoice.id}</td>
                                        <td className="p-3">{entry.customerName}</td>
                                        <td className="p-3">{invoiceDate ? invoiceDate.toLocaleDateString() : 'N/D'}</td>
                                        <td className="p-3 flex items-center gap-2">
                                            <CalendarDays className="h-4 w-4 text-slate-400" />
                                            {entry.dueDate ? entry.dueDate.toLocaleDateString() : 'Sin fecha'}
                                        </td>
                                        <td className="p-3 text-right font-semibold">{formatCurrency(entry.total, currency)}</td>
                                        <td className="p-3 text-right">{formatCurrency(entry.paid, currency)}</td>
                                        <td className="p-3 text-right text-indigo-600 font-semibold">{formatCurrency(entry.outstanding, currency)}</td>
                                        <td className={`p-3 font-medium flex items-center gap-2 ${entry.overdueDays > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                            <Clock className="h-4 w-4" />
                                            {entry.overdueDays > 0 ? `${entry.overdueDays} días` : 'Al día'}
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${entry.overdueDays > 0 ? 'bg-red-100 text-red-700' : entry.paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {entry.overdueDays > 0 ? 'Vencido' : entry.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-2 justify-end">
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    onClick={() => handleQuickSendInvoice(entry)}
                                                    title="Enviar Factura por Correo"
                                                    className="flex items-center gap-1.5"
                                                >
                                                    <Mail size={14} /> Factura
                                                </Button>
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    onClick={() => handleQuickSendStatement(entry)}
                                                    title="Enviar Estado de Cuentas por Correo"
                                                    className="flex items-center gap-1.5"
                                                >
                                                    <Mail size={14} className="text-amber-500" /> Estado
                                                </Button>
                                                <Button size="sm" onClick={() => handleRegisterPayment(invoice)}>Registrar Pago</Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </CardBody>
            </Card>

            <Card>
                <CardBody className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(summary.aging).map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 p-4 text-center dark:border-slate-700">
                            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(value, currency)}</p>
                        </div>
                    ))}
                </CardBody>
            </Card>

            {showPaymentModal && selectedInvoice && (
                <PaymentModal
                    invoice={selectedInvoice}
                    customers={customers}
                    companyProfile={companyProfile}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setSelectedInvoice(null);
                    }}
                    onSuccess={handlePaymentSuccess}
                    useApi={true}
                />
            )}
            {detailEntry && (
                <ReceivableDetailModal
                    open={Boolean(detailEntry)}
                    onClose={() => { setDetailEntry(null); setDetailStatementEntries([]); }}
                    entry={detailEntry}
                    statementEntries={detailStatementEntries}
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

export default AccountsReceivableViewSQL;
