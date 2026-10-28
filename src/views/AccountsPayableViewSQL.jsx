// Versión migrada a PostgreSQL - AccountsPayableView
import React, { useMemo, useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatCurrency.js';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import { badgeClass } from '../components/ui/Badge.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import { CalendarDays, AlertTriangle, Building2, Clock, ChevronDown, Wallet, FileText, X } from 'lucide-react';
import KpiCard from '../components/ui/KpiCard.jsx';
import { useApiCrud } from '../hooks/useApi.js';
import api from '../api/client.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getExpenseTotal = (expense) => {
    const base = Number(expense.totalMontoFacturado ?? expense.montoFacturado ?? 0);
    if (base > 0) return base;
    const goods = Number(expense.montoBienes || 0);
    const services = Number(expense.montoServicios || 0);
    return goods + services;
};

const computeDueDate = (expense) => parseTimestamp(expense.paymentDate || expense.invoiceDate);

const normalizeTableDate = (value) => {
    const parsed = parseTimestamp(value);
    return parsed ? parsed.toLocaleDateString() : 'N/D';
};

const ExpensePaymentModal = ({ expense, currency, onClose, onSubmit }) => {
    const total = getExpenseTotal(expense);
    const paid = Number(expense.paidAmount || 0);
    const balance = Math.max(0, total - paid);
    const [amount, setAmount] = useState(balance.toFixed(2));
    const [method, setMethod] = useState('transferencia');
    const [reference, setReference] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const numeric = parseFloat(amount);
        if (Number.isNaN(numeric) || numeric <= 0) {
            toast.error('El monto del pago debe ser mayor que cero.');
            return;
        }
        if (numeric - balance > 0.01) {
            toast.error('El pago supera el balance pendiente.');
            return;
        }
        onSubmit({ amount: numeric, method, reference });
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center modal-backdrop p-4">
            <div className="w-full max-w-lg modal-panel p-6">
                <div className="mb-4 flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Registrar Pago a Proveedor</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Saldo actual: {formatCurrency(balance, currency)}</p>
                    </div>
                    <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Monto a pagar</label>
                        <input aria-label="Monto a pagar"
                            type="number"
                            className="input-base"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="0"
                            step="0.01"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Método</label>
                        <select aria-label="Método" className="input-base" value={method} onChange={(e) => setMethod(e.target.value)}>
                            <option value="transferencia">Transferencia / Depósito</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="cheque">Cheque</option>
                            <option value="tarjeta">Tarjeta</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Referencia (opcional)</label>
                        <input aria-label="Referencia (opcional)"
                            type="text"
                            className="input-base"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Número de comprobante, banco, etc."
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit">Confirmar Pago</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AccountsPayableViewSQL = ({ companyProfile = {} }) => {
    // Cargar datos desde la API
    const { data: expensesRaw, loading: loadingExpenses, refetch: refetchExpenses } = useApiCrud('/expenses');
    const { data: suppliersRaw, loading: loadingSuppliers } = useApiCrud('/suppliers');
    
    const expenses = expensesRaw || [];
    const suppliers = suppliersRaw || [];
    const loading = loadingExpenses || loadingSuppliers;

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('pendiente');
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'dueDate', direction: 'asc' });
    const [columnFilters, setColumnFilters] = useState({
        ncf: '',
        supplier: '',
        invoiceFrom: '',
        invoiceTo: '',
        paymentFrom: '',
        paymentTo: '',
        minTotal: '',
        maxTotal: '',
        minPaid: '',
        maxPaid: '',
        minBalance: '',
        maxBalance: '',
        minDays: '',
        maxDays: '',
        statuses: [],
    });
    const headerClickTimeout = useRef(null);
    const currency = companyProfile?.currency || 'USD';
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    const supplierIndex = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);

    const payableEntries = useMemo(() => {
        return (expenses || [])
            .filter(exp => exp)
            .map(exp => {
                const total = getExpenseTotal(exp);
                const paid = Number(exp.paidAmount || 0);
                const balance = Math.max(0, total - paid);
                const dueDate = computeDueDate(exp);
                let overdueDays = 0;
                if (dueDate) {
                    const normalizedDue = new Date(dueDate);
                    normalizedDue.setHours(0, 0, 0, 0);
                    overdueDays = Math.round((today - normalizedDue) / (1000 * 60 * 60 * 24));
                }
                const supplier = supplierIndex.get(exp.supplierId);
                const status = exp.paymentStatus || (balance <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente');
                return {
                    expense: exp,
                    total,
                    paid,
                    balance,
                    dueDate,
                    overdueDays,
                    supplier,
                    supplierName: exp.supplierName || supplier?.name || 'Proveedor no definido',
                    status,
                    isCredit: exp.formaPago === '04' || status !== 'Pagado',
                };
            })
            .filter(entry => entry.isCredit && entry.balance > 0.01)
            .sort((a, b) => {
                if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return b.balance - a.balance;
            });
    }, [expenses, supplierIndex, today]);

    const uniqueSuppliers = useMemo(() => {
        const set = new Set();
        payableEntries.forEach(entry => {
            if (entry.supplierName) set.add(entry.supplierName);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [payableEntries]);

    const statusOptions = [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Parcial', value: 'parcial' },
        { label: 'Pagado', value: 'pagado' },
        { label: 'Vencido', value: 'vencido' },
    ];

    const getInvoiceDateValue = (entry) => {
        const date = parseTimestamp(entry.expense.invoiceDate);
        return date ? date.getTime() : 0;
    };

    const getPaymentDateValue = (entry) => {
        const date = parseTimestamp(entry.expense.paymentDate) || entry.dueDate;
        return date ? date.getTime() : 0;
    };

    const filteredEntries = useMemo(() => {
        let entries = payableEntries;

        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            entries = entries.filter(entry => {
                const bySupplier = entry.supplierName.toLowerCase().includes(term);
                const byNCF = `${entry.expense.ncf || ''}`.toLowerCase().includes(term);
                return bySupplier || byNCF;
            });
        }

        switch (statusFilter) {
            case 'parcial':
                entries = entries.filter(entry => entry.paid > 0 && entry.balance > 0);
                break;
            case 'vencido':
                entries = entries.filter(entry => entry.overdueDays > 0);
                break;
            case 'pendiente':
                entries = entries.filter(entry => entry.paid <= 0);
                break;
            case 'todos':
            default:
                break;
        }

        if (columnFilters.ncf.trim()) {
            const query = columnFilters.ncf.trim().toLowerCase();
            entries = entries.filter(entry => `${entry.expense.ncf || ''}`.toLowerCase().includes(query));
        }

        if (columnFilters.supplier) {
            entries = entries.filter(entry => entry.supplierName === columnFilters.supplier);
        }

        if (columnFilters.invoiceFrom) {
            const fromDate = new Date(columnFilters.invoiceFrom);
            if (!Number.isNaN(fromDate.getTime())) {
                entries = entries.filter(entry => getInvoiceDateValue(entry) >= fromDate.getTime());
            }
        }

        if (columnFilters.invoiceTo) {
            const toDate = new Date(columnFilters.invoiceTo);
            if (!Number.isNaN(toDate.getTime())) {
                const toTs = toDate.getTime() + (24 * 60 * 60 * 1000) - 1;
                entries = entries.filter(entry => getInvoiceDateValue(entry) <= toTs);
            }
        }

        if (columnFilters.paymentFrom) {
            const fromDate = new Date(columnFilters.paymentFrom);
            if (!Number.isNaN(fromDate.getTime())) {
                entries = entries.filter(entry => getPaymentDateValue(entry) >= fromDate.getTime());
            }
        }

        if (columnFilters.paymentTo) {
            const toDate = new Date(columnFilters.paymentTo);
            if (!Number.isNaN(toDate.getTime())) {
                const toTs = toDate.getTime() + (24 * 60 * 60 * 1000) - 1;
                entries = entries.filter(entry => getPaymentDateValue(entry) <= toTs);
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

        if (columnFilters.minBalance !== '') {
            entries = entries.filter(entry => entry.balance >= Number(columnFilters.minBalance));
        }

        if (columnFilters.maxBalance !== '') {
            entries = entries.filter(entry => entry.balance <= Number(columnFilters.maxBalance));
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
    }, [payableEntries, searchTerm, statusFilter, columnFilters, sortConfig]);

    const summary = useMemo(() => {
        const totalBalance = filteredEntries.reduce((sum, entry) => sum + entry.balance, 0);
        const totalInvoices = filteredEntries.length;
        const supplierCount = new Set(filteredEntries.map(entry => entry.expense.supplierId || entry.supplierName)).size;
        const overdue = filteredEntries.filter(entry => entry.overdueDays > 0).length;
        return { totalBalance, totalInvoices, supplierCount, overdue };
    }, [filteredEntries]);

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
        if (sortConfig.key !== key) return '↕';
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

    const getSortableValue = (entry, key) => {
        switch (key) {
            case 'ncf':
                return entry.expense.ncf || '';
            case 'supplier':
                return entry.supplierName || '';
            case 'invoiceDate':
                return getInvoiceDateValue(entry);
            case 'dueDate':
                return getPaymentDateValue(entry);
            case 'total':
                return entry.total;
            case 'paid':
                return entry.paid;
            case 'balance':
                return entry.balance;
            case 'status':
                return entry.overdueDays > 0 ? 'Vencido' : (entry.status || '');
            case 'days':
                return entry.overdueDays;
            default:
                return '';
        }
    };

    const handlePaymentSubmit = async ({ amount, method, reference }) => {
        if (!selectedExpense) return;
        const total = getExpenseTotal(selectedExpense);
        const currentPaid = Number(selectedExpense.paidAmount || 0);
        const newPaidAmount = Math.min(total, currentPaid + amount);
        const balance = Math.max(0, total - newPaidAmount);
        const paymentStatus = balance <= 0.01 ? 'Pagado' : 'Parcial';
        const paymentEntry = {
            amount,
            method,
            reference,
            date: new Date().toISOString(),
        };
        
        const promise = api.expenses.update(selectedExpense.id, {
            paidAmount: newPaidAmount,
            balanceAmount: balance,
            paymentStatus,
            payments: [...(selectedExpense.payments || []), paymentEntry],
            lastPaymentDate: new Date().toISOString(),
        });

        await toast.promise(promise, {
            loading: 'Registrando pago... ',
            success: () => {
                playSuccessSound();
                setSelectedExpense(null);
                refetchExpenses();
                return 'Pago registrado.';
            },
            error: () => {
                playErrorSound();
                return 'No se pudo registrar el pago.';
            },
        });
    };

    if (loading) {
        return (
            <PageSkeleton label="Cargando…" />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="page-title">Cuentas por Pagar</h2>
                    <p className="page-subtitle">Controla tus obligaciones con proveedores y registra pagos realizados.</p>
                </div>
            </div>

            <div className="kpi-grid">
                <KpiCard label="Balance Pendiente" value={formatCurrency(summary.totalBalance, currency)} icon={Wallet} tone="brand" />
                <KpiCard label="Facturas Abiertas" value={summary.totalInvoices} icon={FileText} tone="info" />
                <KpiCard label="Proveedores" value={summary.supplierCount} icon={Building2} tone="neutral" />
                <KpiCard label="Vencidas" value={summary.overdue} icon={AlertTriangle} tone="danger" />
            </div>

            <Card>
                <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por proveedor o NCF"
                    />
                    <select aria-label="Estado" className="input-base" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="pendiente">Pendiente</option>
                        <option value="parcial">Pago Parcial</option>
                        <option value="vencido">Vencidas</option>
                        <option value="todos">Todos</option>
                    </select>
                </CardBody>
            </Card>

            <Card>
                <CardBody className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-gray-800 text-xs uppercase tracking-wide text-ink-soft">
                            <tr>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('ncf')}
                                        onDoubleClick={() => handleHeaderDoubleClick('ncf')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        NCF
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('ncf')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'ncf' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'ncf' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Buscar NCF</p>
                                            <input aria-label="Buscar NCF"
                                                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                                placeholder="Ej. B01000001"
                                                value={columnFilters.ncf}
                                                onChange={e => updateColumnFilter('ncf', e.target.value)}
                                            />
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['ncf'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('supplier')}
                                        onDoubleClick={() => handleHeaderDoubleClick('supplier')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        Proveedor
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('supplier')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'supplier' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'supplier' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Selecciona proveedor</p>
                                            <select aria-label="Selecciona proveedor"
                                                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                                value={columnFilters.supplier}
                                                onChange={e => updateColumnFilter('supplier', e.target.value)}
                                            >
                                                <option value="">Todos</option>
                                                {uniqueSuppliers.map(name => (
                                                    <option key={name} value={name}>{name}</option>
                                                ))}
                                            </select>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['supplier'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('invoiceDate')}
                                        onDoubleClick={() => handleHeaderDoubleClick('invoiceDate')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        Fecha factura
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('invoiceDate')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'invoiceDate' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'invoiceDate' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Rango de emisión</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Desde</span>
                                                    <input type="date" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.invoiceFrom} onChange={e => updateColumnFilter('invoiceFrom', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Hasta</span>
                                                    <input type="date" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.invoiceTo} onChange={e => updateColumnFilter('invoiceTo', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['invoiceFrom','invoiceTo'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('dueDate')}
                                        onDoubleClick={() => handleHeaderDoubleClick('dueDate')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        Fecha pago
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('dueDate')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'dueDate' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'dueDate' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Rango de pago</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Desde</span>
                                                    <input type="date" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.paymentFrom} onChange={e => updateColumnFilter('paymentFrom', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Hasta</span>
                                                    <input type="date" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.paymentTo} onChange={e => updateColumnFilter('paymentTo', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['paymentFrom','paymentTo'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('total')}
                                        onDoubleClick={() => handleHeaderDoubleClick('total')}
                                        className="flex w-full items-center justify-end gap-1 text-ink-soft"
                                    >
                                        Total
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('total')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'total' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'total' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Rango total</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.minTotal} onChange={e => updateColumnFilter('minTotal', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.maxTotal} onChange={e => updateColumnFilter('maxTotal', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['minTotal','maxTotal'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('paid')}
                                        onDoubleClick={() => handleHeaderDoubleClick('paid')}
                                        className="flex w-full items-center justify-end gap-1 text-ink-soft"
                                    >
                                        Pagado
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('paid')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'paid' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'paid' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Monto pagado</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.minPaid} onChange={e => updateColumnFilter('minPaid', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.maxPaid} onChange={e => updateColumnFilter('maxPaid', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['minPaid','maxPaid'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('balance')}
                                        onDoubleClick={() => handleHeaderDoubleClick('balance')}
                                        className="flex w-full items-center justify-end gap-1 text-ink-soft"
                                    >
                                        Balance
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('balance')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'balance' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'balance' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Balance pendiente</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Mínimo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.minBalance} onChange={e => updateColumnFilter('minBalance', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Máximo</span>
                                                    <input type="number" min="0" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.maxBalance} onChange={e => updateColumnFilter('maxBalance', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['minBalance','maxBalance'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('status')}
                                        onDoubleClick={() => handleHeaderDoubleClick('status')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        Estado
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('status')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'status' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'status' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Estados</p>
                                            <div className="mt-2 space-y-2 text-sm">
                                                {statusOptions.map(option => (
                                                    <label key={option.value} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                            checked={columnFilters.statuses.includes(option.value)}
                                                            onChange={() => toggleArrayFilterValue('statuses', option.value)}
                                                        />
                                                        <span>{option.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['statuses'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="relative p-3">
                                    <button
                                        type="button"
                                        onClick={() => handleHeaderSortClick('days')}
                                        onDoubleClick={() => handleHeaderDoubleClick('days')}
                                        className="flex items-center gap-1 text-ink-soft"
                                    >
                                        Días
                                        <span className="text-xs leading-none text-ink-muted">{getSortIndicator('days')}</span>
                                        <ChevronDown size={14} className={activeHeaderFilter === 'days' ? 'text-brand-600' : 'text-slate-400'} />
                                    </button>
                                    {activeHeaderFilter === 'days' && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-ink-soft shadow-2xl">
                                            <p className="text-sm font-semibold text-ink">Rango de días</p>
                                            <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Mínimo</span>
                                                    <input type="number" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.minDays} onChange={e => updateColumnFilter('minDays', e.target.value)} />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-ink-muted">Máximo</span>
                                                    <input type="number" className="w-full rounded-lg border border-line px-3 py-2 focus:border-brand-500 focus:outline-none" value={columnFilters.maxDays} onChange={e => updateColumnFilter('maxDays', e.target.value)} />
                                                </label>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm">
                                                <button type="button" className="text-ink-muted hover:text-slate-700" onClick={() => clearFilterGroup(['minDays','maxDays'])}>Limpiar</button>
                                                <button type="button" className="font-semibold text-brand-600 hover:text-brand-500" onClick={() => setActiveHeaderFilter(null)}>Cerrar</button>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-3 text-right sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)] bg-slate-50 dark:bg-gray-800">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntries.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="p-0"><EmptyState icon={Wallet} title="No hay cuentas por pagar" description="No hay facturas de proveedores con los filtros actuales. Prueba con otro estado o búsqueda." /></td>
                                </tr>
                            )}
                            {filteredEntries.map(entry => (
                                <tr key={entry.expense.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                    <td className="p-3 font-mono text-xs">{entry.expense.ncf || 'N/D'}</td>
                                    <td className="p-3">{entry.supplierName}</td>
                                    <td className="p-3">{normalizeTableDate(entry.expense.invoiceDate)}</td>
                                    <td className="p-3">
                                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                            <CalendarDays className="h-4 w-4 text-slate-400" />
                                            {normalizeTableDate(entry.expense.paymentDate)}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatCurrency(entry.total, currency)}</td>
                                    <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(entry.paid, currency)}</td>
                                    <td className="p-3 text-right text-ink font-semibold tabular-nums whitespace-nowrap">{formatCurrency(entry.balance, currency)}</td>
                                    <td className="p-3">
                                        <span className={badgeClass(entry.overdueDays > 0 ? 'danger' : entry.paid > 0 ? 'warning' : 'neutral')}>
                                            {entry.overdueDays > 0 ? 'Vencida' : entry.status}
                                        </span>
                                    </td>
                                    <td className={`p-3 text-sm ${entry.overdueDays > 0 ? 'text-danger-600 dark:text-danger-400 font-medium' : ''}`}>
                                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                            <Clock className="h-4 w-4 text-slate-400" />
                                            {entry.overdueDays > 0 ? `${entry.overdueDays} días` : 'Al día'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)] bg-surface">
                                        <Button size="sm" className="whitespace-nowrap" onClick={() => setSelectedExpense(entry.expense)}>Registrar pago</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardBody>
            </Card>

            {selectedExpense && (
                <ExpensePaymentModal
                    expense={selectedExpense}
                    currency={currency}
                    onClose={() => setSelectedExpense(null)}
                    onSubmit={handlePaymentSubmit}
                />
            )}
        </div>
    );
};

export default AccountsPayableViewSQL;
