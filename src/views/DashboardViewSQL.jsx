/**
 * Vista del Dashboard - Versión SQL
 * Migrada de Firebase a PostgreSQL API
 */
import React, { useMemo } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';
import { DollarSign, CreditCard, BarChart as BarChartIcon, ShoppingCart, AlertTriangle, Sun, CalendarDays, UserPlus, Ticket, TrendingUp, Award, Target, Loader2 } from 'lucide-react';
import { getInventoryAlerts } from '../utils/inventory.js';
import { useApiCrud } from '../hooks/useApi.js';

// --- Componente de Tarjeta de Estadísticas Rediseñado con Gradientes Premium ---
const StatCard = ({ title, value, icon: IconComponent, gradientClass, onClick, trend }) => (
    <div
        onClick={onClick}
        className={`rounded-3xl ${gradientClass} p-5 text-white shadow-lg shadow-indigo-500/10 hover:shadow-2xl transition-all duration-300 relative overflow-hidden active:scale-95 ${onClick ? 'cursor-pointer' : ''}`}
    >
        <div className="absolute -right-6 -top-6 opacity-20 transform rotate-12">
            <IconComponent size={100} />
        </div>
        <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-80">{title}</p>
                <p className="text-2xl font-extrabold mt-1 tracking-tight">{value}</p>
            </div>
            {trend !== undefined && (
                <div className={`inline-flex items-center gap-1 text-[10px] font-bold mt-4 px-2 py-1 rounded-full w-fit ${trend >= 0 ? 'bg-white/20 text-white' : 'bg-white/20 text-white'}`}>
                    {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
                </div>
            )}
        </div>
    </div>
);

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
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-gray-400" size={48} />
                <p className="ml-4 text-gray-500">Cargando dashboard...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
                    <p className="text-slate-500 mt-1 dark:text-slate-400">Un resumen de la actividad reciente de tu negocio.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard 
                    title="Ingresos Brutos" 
                    value={formatCurrency(totalRevenue, currency)} 
                    icon={DollarSign}
                    gradientClass="bg-gradient-to-br from-indigo-600 to-indigo-400"
                />
                <StatCard 
                    title="Gastos y Reembolsos" 
                    value={formatCurrency(totalExpenses + totalRefunds, currency)} 
                    icon={CreditCard}
                    gradientClass="bg-gradient-to-br from-red-600 to-pink-400"
                />
                <StatCard 
                    title="Ganancia Neta" 
                    value={formatCurrency(netProfit, currency)} 
                    icon={TrendingUp}
                    gradientClass={netProfit >= 0 ? "bg-gradient-to-br from-emerald-600 to-teal-400" : "bg-gradient-to-br from-orange-600 to-red-400"}
                />
                <StatCard 
                    title="Ticket Promedio" 
                    value={formatCurrency(averageTicket, currency)} 
                    icon={Target}
                    gradientClass="bg-gradient-to-br from-purple-600 to-fuchsia-400"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
                <StatCard 
                    title="Ventas Hoy" 
                    value={formatCurrency(todayRevenue, currency)} 
                    icon={Sun}
                    gradientClass="bg-gradient-to-br from-amber-600 to-orange-400"
                />
                <StatCard 
                    title="Ventas 7 días" 
                    value={formatCurrency(weeklyRevenue, currency)} 
                    icon={CalendarDays}
                    gradientClass="bg-gradient-to-br from-indigo-600 to-sky-400"
                />
                <StatCard 
                    title="Pedidos Activos" 
                    value={pendingOrders} 
                    icon={ShoppingCart}
                    gradientClass="bg-gradient-to-br from-sky-600 to-cyan-400"
                    onClick={() => setView('invoices')}
                />
                <StatCard 
                    title="Productos con Bajo Stock" 
                    value={lowStockCount} 
                    icon={AlertTriangle}
                    gradientClass="bg-gradient-to-br from-orange-600 to-red-400"
                    onClick={() => setView('products')}
                />
                <StatCard 
                    title="Clientes Nuevos (30 días)" 
                    value={newCustomers30} 
                    icon={UserPlus}
                    gradientClass="bg-gradient-to-br from-teal-600 to-emerald-400"
                    onClick={() => setView('customers')}
                />
                <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-sm mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <TrendingUp size={18} className="text-brand-600" />
                        Acciones Rápidas
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        <button 
                            onClick={() => setView('orders')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 active:scale-90 transition-all"
                        >
                            <ShoppingCart size={20} />
                            <span className="text-[10px] font-bold">Venta</span>
                        </button>
                        <button 
                            onClick={() => setView('finance-expenses')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 active:scale-90 transition-all"
                        >
                            <CreditCard size={20} />
                            <span className="text-[10px] font-bold">Gasto</span>
                        </button>
                        <button 
                            onClick={() => setView('finance-sales-reports')} 
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 active:scale-90 transition-all"
                        >
                            <BarChartIcon size={20} />
                            <span className="text-[10px] font-bold">Reporte</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24 lg:pb-8">
                <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/50 dark:shadow-none">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                            <ShoppingCart className="text-indigo-600 dark:text-indigo-400" size={20} />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Top Productos</h3>
                    </div>
                    <ul className="space-y-3">
                        {topProducts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 italic">Sin ventas recientes.</p>}
                        {topProducts.map((product, idx) => (
                            <li key={product.name} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group">
                                <div className="flex items-center gap-3 flex-1">
                                    <span className="font-bold text-[10px] w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/30">{idx + 1}</span>
                                    <div>
                                        <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{product.name}</p>
                                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{product.quantity} unidades vendidas</p>
                                    </div>
                                </div>
                                <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm tracking-tight">{formatCurrency(product.revenue, currency)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/50 dark:shadow-none">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                            <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Últimos Movimientos</h3>
                    </div>
                    <ul className="space-y-3">
                        {recentMovements.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 italic">Sin movimientos recientes.</p>}
                        {recentMovements.map(mov => (
                            <li key={`${mov.type}-${mov.id || mov.label}`}
                                className="flex justify-between items-center p-3 rounded-2xl bg-gray-50/50 dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group active:scale-[0.98]">
                                <div className="flex-1">
                                    <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{mov.label}</p>
                                    <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{mov.date.toLocaleDateString()} • {mov.date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-xs px-3 py-1 rounded-full ${mov.type === 'income' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
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
