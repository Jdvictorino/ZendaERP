/**
 * Vista del Dashboard - Versión SQL
 * Migrada de Firebase a PostgreSQL API
 */
import React, { useMemo } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';
import { DollarSign, CreditCard, BarChart as BarChartIcon, ShoppingCart, AlertTriangle, Sun, CalendarDays, UserPlus, Ticket, TrendingUp, Award, Target, Loader2 } from 'lucide-react';
import { getInventoryAlerts } from '../utils/inventory.js';
import { useApiCrud } from '../hooks/useApi.js';
import KpiCard from '../components/ui/KpiCard.jsx';
import PageSkeleton from '../components/ui/Skeleton.jsx';

// Las tarjetas de indicadores usan el componente único KpiCard
const StatCard = ({ title, ...rest }) => <KpiCard label={title} {...rest} />;

const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getCustomerCreatedDate = (customer) => {
    if (!customer) return null;
    const source = customer.createdAt
        ?? customer.createdDate
        ?? customer.created_at
        ?? customer.registrationDate
        ?? customer.registeredAt
        ?? customer.createdOn
        ?? customer.created
        ?? customer.date;
    return parseTimestamp(source);
};

const normalizeAmount = (value) => {
    if (value == null) return 0;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const DashboardViewSQL = ({ setView, companyProfile }) => {
    // Cargar datos desde API
    const { data: invoicesData, loading: loadingInvoices } = useApiCrud('/invoices');
    const { data: productsData, loading: loadingProducts } = useApiCrud('/products');
    const { data: customersData, loading: loadingCustomers } = useApiCrud('/customers');
    const { data: expensesData, loading: loadingExpenses } = useApiCrud('/expenses');
    
    // La API devuelve arrays directamente (el hook ya extrae .data de la respuesta)
    const invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data || []);
    const products = Array.isArray(productsData) ? productsData : (productsData?.data || []);
    const customers = Array.isArray(customersData) ? customersData : (customersData?.data || []);
    const expenses = Array.isArray(expensesData) ? expensesData : (expensesData?.data || []);
    const creditNotes = []; // TODO: Añadir endpoint de creditNotes

    const loading = loadingInvoices || loadingProducts || loadingCustomers || loadingExpenses;

    const safeInvoices = invoices || [];
    const safeExpenses = expenses || [];
    const safeCreditNotes = creditNotes || [];
    const safeProducts = products || [];
    const inventoryAlerts = useMemo(() => getInventoryAlerts(safeProducts, companyProfile), [safeProducts, companyProfile]);
    const safeCustomers = customers || [];
    const currency = companyProfile?.currency || 'USD';

    const totalRevenue = useMemo(() => safeInvoices.reduce((sum, inv) => sum + normalizeAmount(inv.total ?? inv.paidAmount ?? inv.amount), 0), [safeInvoices]);
    const totalExpenses = useMemo(() => safeExpenses.reduce((sum, exp) => sum + normalizeAmount(exp.totalMontoFacturado ?? exp.total ?? exp.amount), 0), [safeExpenses]);
    const totalRefunds = useMemo(() => safeCreditNotes.reduce((sum, cn) => sum + normalizeAmount(cn.amount ?? cn.total ?? cn.value), 0), [safeCreditNotes]);
    const netProfit = useMemo(() => totalRevenue - totalExpenses - totalRefunds, [totalRevenue, totalExpenses, totalRefunds]);
    const pendingOrders = useMemo(() => safeInvoices.filter(inv => inv.status !== 'Completado' && inv.status !== 'Cancelado').length, [safeInvoices]);
    const lowStockCount = inventoryAlerts?.lowStock?.length || 0;
    
    const todayRevenue = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return safeInvoices.reduce((sum, inv) => {
            if (inv.status === 'Cancelado') return sum;
            const invDate = parseTimestamp(inv.date);
            if (invDate && invDate >= todayStart) {
                return sum + normalizeAmount(inv.total ?? inv.paidAmount ?? inv.amount);
            }
            return sum;
        }, 0);
    }, [safeInvoices]);

    const weeklyRevenue = useMemo(() => {
        const start = new Date();
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return safeInvoices.reduce((sum, inv) => {
            if (inv.status === 'Cancelado') return sum;
            const invDate = parseTimestamp(inv.date);
            if (invDate && invDate >= start) {
                return sum + normalizeAmount(inv.total ?? inv.paidAmount ?? inv.amount);
            }
            return sum;
        }, 0);
    }, [safeInvoices]);

    const averageTicket = useMemo(() => {
        const validInvoices = safeInvoices.filter(inv => inv.status !== 'Cancelado');
        const total = validInvoices.reduce((sum, inv) => sum + normalizeAmount(inv.total ?? inv.paidAmount ?? inv.amount), 0);
        return validInvoices.length ? total / validInvoices.length : 0;
    }, [safeInvoices]);

    const newCustomers30 = useMemo(() => {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 30);
        threshold.setHours(0, 0, 0, 0);
        return safeCustomers.filter(customer => {
            const created = getCustomerCreatedDate(customer);
            return created ? created >= threshold : false;
        }).length;
    }, [safeCustomers]);

    const topProducts = useMemo(() => {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 30);
        threshold.setHours(0, 0, 0, 0);
        const map = new Map();
        safeInvoices.forEach(inv => {
            if (inv.status === 'Cancelado') return;
            const invDate = parseTimestamp(inv.date);
            if (!invDate || invDate < threshold) return;
            (inv.items || []).forEach(item => {
                const key = item.productId || item.name;
                const current = map.get(key) || { name: item.name || item.productName || 'Producto', revenue: 0, quantity: 0 };
                const quantity = Number(item.quantity) || 0;
                const price = normalizeAmount(item.unitPrice || item.price);
                current.quantity += quantity;
                current.revenue += price * quantity;
                map.set(key, current);
            });
        });
        return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    }, [safeInvoices]);

    const recentMovements = useMemo(() => {
        const combined = [
            ...safeInvoices.map(inv => ({
                id: inv.id,
                type: 'income',
                label: inv.customerName ? `Venta a ${inv.customerName}` : `Pedido #${inv.orderNumber || inv.id}`,
                amount: normalizeAmount(inv.total ?? inv.paidAmount),
                date: parseTimestamp(inv.date),
            })),
            ...safeExpenses.map(exp => ({
                id: exp.id,
                type: 'expense',
                label: exp.supplierName ? `Compra a ${exp.supplierName}` : 'Gasto registrado',
                amount: normalizeAmount(exp.totalMontoFacturado ?? exp.total ?? exp.amount),
                date: parseTimestamp(exp.invoiceDate || exp.date),
            })),
        ].filter(entry => entry.date);

        return combined.sort((a, b) => b.date - a.date).slice(0, 6);
    }, [safeInvoices, safeExpenses]);

    if (loading) {
        return (
            <PageSkeleton label="Cargando dashboard..." />
        );
    }

    return (
        <div>
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="page-title">Dashboard</h2>
                    <p className="page-subtitle">Un resumen de la actividad reciente de tu negocio.</p>
                </div>
            </div>
            <div className="kpi-grid">
                <StatCard 
                    title="Ingresos Brutos" 
                    value={formatCurrency(totalRevenue, currency)} 
                    icon={DollarSign}
                    tone="brand"
                />
                <StatCard 
                    title="Gastos y Reembolsos" 
                    value={formatCurrency(totalExpenses + totalRefunds, currency)} 
                    icon={CreditCard}
                    tone="danger"
                />
                <StatCard 
                    title="Ganancia Neta" 
                    value={formatCurrency(netProfit, currency)} 
                    icon={TrendingUp}
                    tone={netProfit >= 0 ? "success" : "danger"}
                />
                <StatCard 
                    title="Ticket Promedio" 
                    value={formatCurrency(averageTicket, currency)} 
                    icon={Target}
                    tone="brand"
                />
            </div>

            <div className="kpi-grid mt-4">
                <StatCard 
                    title="Ventas Hoy" 
                    value={formatCurrency(todayRevenue, currency)} 
                    icon={Sun}
                    tone="warning"
                />
                <StatCard 
                    title="Ventas 7 días" 
                    value={formatCurrency(weeklyRevenue, currency)} 
                    icon={CalendarDays}
                    tone="info"
                />
                <StatCard 
                    title="Pedidos Activos" 
                    value={pendingOrders} 
                    icon={ShoppingCart}
                    tone="info"
                    onClick={() => setView('invoices')}
                />
                <StatCard 
                    title="Productos con Bajo Stock" 
                    value={lowStockCount} 
                    icon={AlertTriangle}
                    tone="warning"
                    onClick={() => setView('products')}
                />
                <StatCard 
                    title="Clientes Nuevos (30 días)" 
                    value={newCustomers30} 
                    icon={UserPlus}
                    tone="success"
                    onClick={() => setView('customers')}
                />
                <div className="card p-6">
                    <h3 className="font-bold text-sm mb-4 text-ink dark:text-gray-100 flex items-center gap-2">
                        <TrendingUp size={18} className="text-brand-600" />
                        Acciones Rápidas
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        <button 
                            onClick={() => setView('orders')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 active:scale-90 transition-all"
                        >
                            <ShoppingCart size={20} />
                            <span className="text-xs font-bold">Venta</span>
                        </button>
                        <button 
                            onClick={() => setView('finance-expenses')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 active:scale-90 transition-all"
                        >
                            <CreditCard size={20} />
                            <span className="text-xs font-bold">Gasto</span>
                        </button>
                        <button 
                            onClick={() => setView('finance-sales-reports')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 active:scale-90 transition-all"
                        >
                            <BarChartIcon size={20} />
                            <span className="text-xs font-bold">Reporte</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24 lg:pb-8">
                <div className="card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/30">
                            <ShoppingCart className="text-brand-600 dark:text-brand-400" size={20} />
                        </div>
                        <h3 className="font-bold text-lg text-ink dark:text-gray-100">Top Productos</h3>
                    </div>
                    <ul className="space-y-3">
                        {topProducts.length === 0 && <p className="text-sm text-ink-muted dark:text-gray-400 text-center py-4 italic">Sin ventas recientes.</p>}
                        {topProducts.map((product, idx) => (
                            <li key={product.name} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 dark:bg-gray-800/40 hover:bg-surface-muted dark:hover:bg-gray-800 transition-all group">
                                <div className="flex items-center gap-3 flex-1">
                                    <span className="font-bold text-xs w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-sm shadow-brand-500/30">{idx + 1}</span>
                                    <div>
                                        <p className="font-bold text-sm text-ink dark:text-gray-200">{product.name}</p>
                                        <p className="text-xs font-medium text-ink-muted dark:text-gray-400">{product.quantity} unidades vendidas</p>
                                    </div>
                                </div>
                                <span className="font-bold text-brand-600 dark:text-brand-400 text-sm tracking-tight">{formatCurrency(product.revenue, currency)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 rounded-xl bg-success-50 dark:bg-success-900/30">
                            <TrendingUp className="text-success-600 dark:text-success-400" size={20} />
                        </div>
                        <h3 className="font-bold text-lg text-ink dark:text-gray-100">Últimos Movimientos</h3>
                    </div>
                    <ul className="space-y-3">
                        {recentMovements.length === 0 && <p className="text-sm text-ink-muted dark:text-gray-400 text-center py-4 italic">Sin movimientos recientes.</p>}
                        {recentMovements.map(mov => (
                            <li key={`${mov.type}-${mov.id || mov.label}`}
                                className="flex justify-between items-center p-3 rounded-2xl bg-gray-50/50 dark:bg-gray-800/40 hover:bg-surface-muted dark:hover:bg-gray-800 transition-all group active:scale-[0.98]">
                                <div className="flex-1">
                                    <p className="font-bold text-sm text-ink dark:text-gray-200">{mov.label}</p>
                                    <p className="text-xs font-medium text-ink-muted">{mov.date.toLocaleDateString()} • {mov.date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-xs px-3 py-1 rounded-full ${mov.type === 'income' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {mov.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(mov.amount), currency)}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DashboardViewSQL;
