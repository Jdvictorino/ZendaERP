import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, DollarSign, Percent, ShoppingCart, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatCurrency.js';
import reportFilters from '../utils/reportFilters.js';
import KpiCard from '../components/ui/KpiCard.jsx';
import ReportDataTable from '../components/ReportDataTable.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { useApiCrud } from '../hooks/useApi.js';
import { loadScript } from '../utils/loadScript.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';
import { baseQuantity, roundQty } from '../utils/units.js';
import { isVoidInvoice } from '../utils/invoiceStatus.js';
import FilterBar, { DateRangeField, FilterField } from '../components/ui/FilterBar.jsx';

// La API entrega los montos Decimal como texto ("2360.00"): sumarlos sin convertir los concatena
const num = (value) => Number(value) || 0;
const DAY = 86400000;
const pct = (part, whole) => (whole ? (part / whole) * 100 : 0);
const asDate = (v) => (!v ? null : v.seconds ? new Date(v.seconds * 1000) : new Date(v));
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const categoryOf = (customer) => (customer?.category && customer.category.trim()) ? customer.category : 'Sin categoría';
// Mismo rango de fechas que reportFilters: 'YYYY-MM-DD' en hora local
const localDay = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v);
};

const PAYMENT_METHODS = [
    { key: 'efectivo', label: 'Efectivo', color: 'bg-brand-600' },
    { key: 'tarjeta', label: 'Tarjeta', color: 'bg-brand-400' },
    { key: 'transferencia', label: 'Transferencia o cheque', color: 'bg-sky-500' },
    { key: 'credito', label: 'Crédito', color: 'bg-warning-500' },
];

const DETAIL_TABS = [
    { value: 'customers', label: 'Clientes' },
    { value: 'employees', label: 'Vendedores' },
    { value: 'profit', label: 'Rentabilidad' },
    { value: 'categories', label: 'Categorías' },
    { value: 'topByCategory', label: 'Mejores por categoría' },
    { value: 'inventory', label: 'Inventario' },
];

/** Encabezado de panel: título, y a la derecha un dato de apoyo. */
function PanelTitle({ title, aside }) {
    return (
        <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {aside && <span className="text-sm text-ink-muted tabular-nums whitespace-nowrap">{aside}</span>}
        </div>
    );
}

/** Lista ordenada con barra proporcional al primero y participación sobre el total. */
function RankedList({ items, total, format, empty, barClass = 'bg-brand-500' }) {
    if (!items.length) return <p className="text-sm text-ink-muted py-6 text-center">{empty}</p>;
    const max = items[0].value || 1;
    return (
        <ol className="space-y-3">
            {items.map((item, i) => (
                <li key={item.label}>
                    <div className="flex items-baseline gap-3 text-sm">
                        <span className="w-4 shrink-0 text-xs text-ink-muted tabular-nums">{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate text-ink" title={item.label}>{item.label}</span>
                        <span className="font-semibold text-ink tabular-nums whitespace-nowrap">{format(item.value)}</span>
                        {total > 0 && <span className="w-12 text-right text-xs text-ink-muted tabular-nums">{pct(item.value, total).toFixed(0)}%</span>}
                    </div>
                    <div className="ml-7 mt-1.5 h-1.5 rounded-full bg-surface-muted dark:bg-gray-800 overflow-hidden">
                        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
                    </div>
                    {item.sub && <p className="ml-7 mt-1 text-xs text-ink-muted">{item.sub}</p>}
                </li>
            ))}
        </ol>
    );
}

/** Una barra al 100 % dividida por segmentos, con su leyenda debajo. */
function StackedBar({ segments, format, empty }) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (!total) return <p className="text-sm text-ink-muted py-6 text-center">{empty}</p>;
    const shown = segments.filter(s => s.value > 0);
    return (
        <div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5" role="img"
                aria-label={shown.map(s => `${s.label} ${pct(s.value, total).toFixed(0)}%`).join(', ')}>
                {shown.map(s => <div key={s.label} className={s.color} style={{ width: `${pct(s.value, total)}%` }} />)}
            </div>
            <ul className="mt-4 space-y-2.5">
                {shown.map(s => (
                    <li key={s.label} className="flex items-center gap-2.5 text-sm">
                        <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${s.color}`} />
                        <span className="flex-1 text-ink-soft">{s.label}</span>
                        <span className="font-medium text-ink tabular-nums">{format(s.value)}</span>
                        <span className="w-12 text-right text-xs text-ink-muted tabular-nums">{pct(s.value, total).toFixed(0)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const ReportsViewSQL = ({ companyProfile }) => {
    const { data: invoicesRaw, loading: loadingInvoices } = useApiCrud('/invoices');
    const { data: expensesRaw, loading: loadingExpenses } = useApiCrud('/expenses');
    const { data: productsRaw, loading: loadingProducts } = useApiCrud('/products');
    const { data: customersRaw, loading: loadingCustomers } = useApiCrud('/customers');

    const invoices = useMemo(() => invoicesRaw || [], [invoicesRaw]);
    const expenses = useMemo(() => expensesRaw || [], [expensesRaw]);
    const products = useMemo(() => productsRaw || [], [productsRaw]);
    const customers = useMemo(() => customersRaw || [], [customersRaw]);

    const [reportMonth, setReportMonth] = useState(new Date().getMonth());
    const [reportYear, setReportYear] = useState(new Date().getFullYear());
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [filterCustomerCategory, setFilterCustomerCategory] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [reportScope, setReportScope] = useState('sales');
    const [detailTab, setDetailTab] = useState('customers');
    const currency = companyProfile?.currency || 'USD';
    const money = (v) => formatCurrency(v || 0, currency);

    const loading = loadingInvoices || loadingExpenses || loadingProducts || loadingCustomers;

    const customerIndex = useMemo(() => new Map(customers.filter(c => c?.id).map(c => [c.id, c])), [customers]);
    const productsMap = useMemo(() => new Map(products.filter(p => p?.id).map(p => [p.id, p])), [products]);
    const unitCost = (productId) => { const p = productsMap.get(productId); return num(p?.costPrice ?? p?.purchasePrice); };

    const customerCategories = useMemo(() => {
        const unique = new Set(companyProfile?.customerCategories || []);
        customers.forEach(c => { if (c?.category && c.category.trim()) unique.add(c.category); });
        unique.add('Sin categoría');
        return Array.from(unique);
    }, [companyProfile, customers]);

    // Período: rango de fechas si lo hay; si no, el mes elegido
    const period = useMemo(() => {
        const start = fromDate ? localDay(fromDate) : (toDate ? null : new Date(reportYear, reportMonth, 1));
        const end = toDate ? localDay(toDate) : (fromDate ? new Date() : new Date(reportYear, reportMonth + 1, 0));
        const label = fromDate || toDate
            ? `${start ? start.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Inicio'} al ${end.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : new Date(reportYear, reportMonth, 1).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
        return { start, end, label };
    }, [fromDate, toDate, reportMonth, reportYear]);

    const criteriaFor = (from, to) => {
        const c = { from, to };
        if (filterCustomer) c.customerId = filterCustomer;
        if (filterProduct) c.productId = filterProduct;
        if (minPrice !== '') c.minPrice = parseFloat(minPrice) || 0;
        if (maxPrice !== '') c.maxPrice = parseFloat(maxPrice) || 0;
        if (statusFilter) c.status = statusFilter;
        return c;
    };
    const byCategory = (list) => (filterCustomerCategory
        ? list.filter(inv => categoryOf(customerIndex.get(inv.customerId)) === filterCustomerCategory)
        : list);

    const { filteredInvoices, filteredExpenses, previousInvoices } = useMemo(() => {
        const from = period.start ? dayKey(period.start) : undefined;
        const to = dayKey(period.end);
        const criteria = criteriaFor(from, to);
        const current = byCategory(reportFilters.filterInvoices(invoices, criteria));
        // Período anterior de la misma duración, para comparar las ventas
        let previous = [];
        if (period.start) {
            const span = Math.round((period.end - period.start) / DAY) + 1;
            const prevEnd = new Date(period.start.getTime() - DAY);
            const prevStart = new Date(period.start.getTime() - span * DAY);
            previous = byCategory(reportFilters.filterInvoices(invoices, criteriaFor(dayKey(prevStart), dayKey(prevEnd))));
        }
        return {
            filteredInvoices: current,
            filteredExpenses: reportFilters.filterExpenses(expenses, criteria),
            previousInvoices: previous,
        };
    }, [period, filterCustomer, filterProduct, filterCustomerCategory, minPrice, maxPrice, statusFilter, invoices, expenses, customerIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    const validInvoices = useMemo(() => filteredInvoices.filter(inv => inv && !isVoidInvoice(inv)), [filteredInvoices]);

    const snapshot = useMemo(() => {
        const payments = Object.fromEntries(PAYMENT_METHODS.map(m => [m.key, 0]));
        const productRevenue = new Map();
        const productUnits = new Map();
        const team = new Map();
        const customerOrders = new Map();
        const days = new Map();
        let revenue = 0, items = 0, cost = 0, pending = 0;

        validInvoices.forEach(inv => {
            const total = num(inv.total);
            revenue += total;
            if ((inv.status || '').toLowerCase().includes('pendiente')) pending += 1;

            (inv.items || []).forEach(item => {
                const qty = num(item.quantity);
                const baseQty = baseQuantity({ quantity: qty, factor: item.packagingFactor ?? 1 });
                const lineRevenue = item.subtotal != null ? num(item.subtotal) : num(item.unitPrice ?? item.price) * qty;
                items = roundQty(items + baseQty);
                cost += unitCost(item.productId) * baseQty;
                const name = item.productName || item.name || productsMap.get(item.productId)?.name || 'Producto';
                productRevenue.set(name, (productRevenue.get(name) || 0) + lineRevenue);
                productUnits.set(name, roundQty((productUnits.get(name) || 0) + baseQty));
            });

            const seller = inv.emitterInfo?.fullName || 'Sin asignar';
            const s = team.get(seller) || { total: 0, orders: 0 };
            s.total += total; s.orders += 1;
            team.set(seller, s);

            const customerKey = inv.customerId || inv.customerName || 'Sin identificar';
            customerOrders.set(customerKey, (customerOrders.get(customerKey) || 0) + 1);

            const d = asDate(inv.date);
            if (d && !Number.isNaN(d.getTime())) days.set(dayKey(d), (days.get(dayKey(d)) || 0) + total);

            if ((inv.payments || []).length) {
                inv.payments.forEach(p => {
                    payments.efectivo += num(p.efectivo);
                    payments.tarjeta += num(p.tarjeta);
                    payments.transferencia += num(p.chequeTransferencia);
                    payments.credito += num(p.credito);
                });
            } else payments.efectivo += total;
        });

        // Serie del período: por día hasta 3 meses, por mes si es más largo
        const series = [];
        const first = period.start || (() => {
            const dates = validInvoices.map(i => asDate(i.date)).filter(Boolean);
            return dates.length ? new Date(Math.min(...dates)) : new Date(period.end);
        })();
        const last = new Date(Math.min(period.end.getTime(), Date.now()));
        const spanDays = Math.round((last - first) / DAY) + 1;
        if (spanDays <= 92) {
            for (let t = new Date(first.getFullYear(), first.getMonth(), first.getDate()); t <= last; t = new Date(t.getTime() + DAY)) {
                series.push({ label: t.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }), value: days.get(dayKey(t)) || 0 });
            }
        } else {
            const months = new Map();
            days.forEach((v, k) => months.set(k.slice(0, 7), (months.get(k.slice(0, 7)) || 0) + v));
            for (let t = new Date(first.getFullYear(), first.getMonth(), 1); t <= last; t = new Date(t.getFullYear(), t.getMonth() + 1, 1)) {
                const k = dayKey(t).slice(0, 7);
                series.push({ label: t.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' }), value: months.get(k) || 0 });
            }
        }

        let returning = 0;
        customerOrders.forEach(n => { if (n > 1) returning += 1; });

        const expenseMap = new Map();
        filteredExpenses.forEach(exp => {
            const key = exp.tipoGasto || 'Gasto operativo';
            expenseMap.set(key, (expenseMap.get(key) || 0) + num(exp.totalMontoFacturado ?? exp.total));
        });

        const top = (map, n = 5) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }));
        const previousRevenue = previousInvoices.filter(inv => !isVoidInvoice(inv)).reduce((s, inv) => s + num(inv.total), 0);
        const totalUnits = Array.from(productUnits.values()).reduce((s, v) => s + v, 0);

        return {
            revenue,
            previousRevenue,
            trend: previousRevenue ? pct(revenue - previousRevenue, previousRevenue) : undefined,
            margin: revenue - cost,
            marginRate: pct(revenue - cost, revenue),
            orders: validInvoices.length,
            pending,
            avgTicket: validInvoices.length ? revenue / validInvoices.length : 0,
            avgItems: validInvoices.length ? items / validInvoices.length : 0,
            activeCustomers: customerOrders.size,
            returning,
            payments,
            series,
            byMonth: spanDays > 92,
            topRevenue: top(productRevenue),
            topUnits: top(productUnits),
            totalUnits,
            team: Array.from(team.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 5)
                .map(([label, d]) => ({ label, value: d.total, sub: `${d.orders} ${d.orders === 1 ? 'venta' : 'ventas'}` })),
            expenses: top(expenseMap),
            expenseTotal: Array.from(expenseMap.values()).reduce((s, v) => s + v, 0),
        };
    }, [validInvoices, previousInvoices, filteredExpenses, productsMap, period]); // eslint-disable-line react-hooks/exhaustive-deps

    const itbis = useMemo(() => {
        const ventas = validInvoices.reduce((s, inv) => s + num(inv.taxAmount ?? inv.itbis), 0);
        const compras = filteredExpenses.reduce((s, exp) => s + num(exp.itbisFacturado), 0);
        return { ventas, compras, neto: ventas - compras };
    }, [validInvoices, filteredExpenses]);

    // --- Tablas de detalle ---
    const detail = useMemo(() => {
        const customersAgg = new Map();
        const employees = new Map();
        const profit = new Map();
        const categories = new Map();
        const byCat = new Map();

        validInvoices.forEach(inv => {
            const total = num(inv.total);
            const customer = customerIndex.get(inv.customerId);
            const category = categoryOf(customer);

            const cat = categories.get(category) || { orders: 0, total: 0 };
            cat.orders += 1; cat.total += total;
            categories.set(category, cat);

            const seller = inv.emitterInfo?.fullName || 'Sin asignar';
            const e = employees.get(seller) || { orders: 0, total: 0 };
            e.orders += 1; e.total += total;
            employees.set(seller, e);

            if (inv.customerId && inv.customerId !== 'guest') {
                const name = inv.customerName || customer?.name || 'Cliente sin nombre';
                const c = customersAgg.get(inv.customerId) || { name, orders: 0, total: 0 };
                c.orders += 1; c.total += total;
                customersAgg.set(inv.customerId, c);
                if (!byCat.has(category)) byCat.set(category, new Map());
                byCat.get(category).set(inv.customerId, c);
            }

            (inv.items || []).forEach(item => {
                const qty = num(item.quantity);
                const baseQty = baseQuantity({ quantity: qty, factor: item.packagingFactor ?? 1 });
                const name = item.productName || item.name || 'Producto';
                const lineRevenue = item.subtotal != null ? num(item.subtotal) : num(item.unitPrice ?? item.price) * qty;
                const p = profit.get(name) || { units: 0, revenue: 0, cost: 0 };
                p.units = roundQty(p.units + baseQty); p.revenue += lineRevenue; p.cost += unitCost(item.productId) * baseQty;
                profit.set(name, p);
            });
        });

        const catTotal = Array.from(categories.values()).reduce((s, c) => s + c.total, 0);
        const sortBy = (map, f) => Array.from(map.entries()).sort((a, b) => f(b[1]) - f(a[1]));

        return {
            customers: {
                title: 'Ventas por cliente',
                headers: ['Cliente', 'Ventas', 'Total comprado'],
                numeric: ['Ventas', 'Total comprado'],
                rows: sortBy(customersAgg, c => c.total).map(([, c]) => ({ Cliente: c.name, Ventas: c.orders, 'Total comprado': money(c.total) })),
            },
            employees: {
                title: 'Ventas por vendedor',
                headers: ['Vendedor', 'Ventas', 'Total vendido'],
                numeric: ['Ventas', 'Total vendido'],
                rows: sortBy(employees, e => e.total).map(([name, e]) => ({ Vendedor: name, Ventas: e.orders, 'Total vendido': money(e.total) })),
            },
            profit: {
                title: 'Rentabilidad por producto',
                headers: ['Producto', 'Unidades', 'Ingresos', 'Costo', 'Ganancia', 'Margen'],
                numeric: ['Unidades', 'Ingresos', 'Costo', 'Ganancia', 'Margen'],
                rows: sortBy(profit, p => p.revenue - p.cost).map(([name, p]) => ({
                    Producto: name, Unidades: p.units, Ingresos: money(p.revenue), Costo: money(p.cost),
                    Ganancia: money(p.revenue - p.cost), Margen: `${pct(p.revenue - p.cost, p.revenue).toFixed(1)}%`,
                })),
            },
            categories: {
                title: 'Ventas por categoría de cliente',
                headers: ['Categoría', 'Ventas', 'Total vendido', 'Ticket promedio', 'Participación'],
                numeric: ['Ventas', 'Total vendido', 'Ticket promedio', 'Participación'],
                rows: sortBy(categories, c => c.total).map(([name, c]) => ({
                    'Categoría': name, Ventas: c.orders, 'Total vendido': money(c.total),
                    'Ticket promedio': money(c.orders ? c.total / c.orders : 0), 'Participación': `${pct(c.total, catTotal).toFixed(1)}%`,
                })),
            },
            topByCategory: {
                title: 'Mejores clientes por categoría',
                headers: ['Categoría', 'Cliente', 'Ventas', 'Total comprado'],
                numeric: ['Ventas', 'Total comprado'],
                rows: Array.from(byCat.entries()).flatMap(([category, map]) =>
                    Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 3)
                        .map(c => ({ 'Categoría': category, Cliente: c.name, Ventas: c.orders, 'Total comprado': money(c.total) }))),
            },
            inventory: {
                title: 'Valor del inventario (hoy)',
                headers: ['Producto', 'Existencia', 'Costo unitario', 'Valor'],
                numeric: ['Existencia', 'Costo unitario', 'Valor'],
                rows: [...products].sort((a, b) => num(b.stock) * unitCost(b.id) - num(a.stock) * unitCost(a.id)).map(p => ({
                    Producto: p.name, Existencia: num(p.stock), 'Costo unitario': money(unitCost(p.id)), Valor: money(num(p.stock) * unitCost(p.id)),
                })),
            },
        };
    }, [validInvoices, customerIndex, products, productsMap, currency]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleExportFiltered = async () => {
        const toastId = toast.loading('Generando archivo…');
        try {
            const rows = [];
            if (reportScope !== 'purchases') {
                filteredInvoices.forEach(inv => {
                    const d = asDate(inv.date);
                    rows.push({
                        Tipo: 'Venta', ID: inv.id || '', Fecha: d ? d.toISOString() : '',
                        Cliente: inv.customerName || inv.customerId || 'Invitado',
                        Categoria: customerIndex.get(inv.customerId)?.category || '',
                        Estado: inv.status || '', Total: num(inv.total), Items: JSON.stringify(inv.items || []),
                    });
                });
            }
            if (reportScope !== 'sales') {
                filteredExpenses.forEach(exp => {
                    const d = asDate(exp.date);
                    rows.push({
                        Tipo: 'Compra', ID: exp.id || '', Fecha: d ? d.toISOString() : '',
                        Proveedor: exp.supplierName || exp.supplierId || '', Estado: exp.status || '',
                        Total: num(exp.totalMontoFacturado ?? exp.total), Items: JSON.stringify(exp.items || []),
                    });
                });
            }
            if (!rows.length) {
                toast.error('No hay datos en el período y filtros elegidos.', { id: toastId });
                return;
            }
            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(rows), 'Filtrado');
            const stamp = fromDate && toDate ? `${fromDate}_${toDate}` : `${reportYear}${String(reportMonth + 1).padStart(2, '0')}`;
            window.XLSX.writeFile(workbook, `Reporte_${stamp}.xlsx`);
            toast.success('Archivo exportado.', { id: toastId });
        } catch (error) {
            console.error('Export filtered error:', error);
            toast.error('No se pudo exportar el archivo.', { id: toastId });
        }
    };

    if (loading) return <PageSkeleton kpis={4} label="Cargando reportes…" />;

    const s = snapshot;
    const table = detail[detailTab];
    const paymentSegments = PAYMENT_METHODS.map(m => ({ label: m.label, color: m.color, value: s.payments[m.key] }));
    const newCustomers = Math.max(0, s.activeCustomers - s.returning);
    const axisMoney = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-DO', { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
                <div>
                    <h2 className="page-title">Reportes</h2>
                    <p className="page-subtitle first-letter:uppercase">{period.label}</p>
                </div>
                <Button variant="secondary" onClick={handleExportFiltered}><Download size={16} className="mr-2" /> Exportar a Excel</Button>
            </div>

            <FilterBar
                active={!!(fromDate || toDate || filterCustomer || filterCustomerCategory || filterProduct || statusFilter || minPrice || maxPrice) || reportScope !== 'sales'}
                onClear={() => { setFromDate(''); setToDate(''); setFilterCustomer(''); setFilterCustomerCategory(''); setFilterProduct(''); setStatusFilter(''); setMinPrice(''); setMaxPrice(''); setReportScope('sales'); }}
            >
                <FilterField label="Exportar" className="w-full sm:w-36">
                    <select value={reportScope} onChange={e => setReportScope(e.target.value)} className="input-base">
                        <option value="sales">Ventas</option>
                        <option value="purchases">Compras</option>
                        <option value="both">Ambos</option>
                    </select>
                </FilterField>
                {/* El mes se usa solo si no hay rango de fechas */}
                <FilterField label="Mes" className="w-[calc(50%-0.375rem)] sm:w-32">
                    <select value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))} className="input-base" disabled={!!(fromDate || toDate)}>
                        {[...Array(12).keys()].map(i => <option key={i} value={i}>{new Date(0, i).toLocaleString('es-DO', { month: 'long' })}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Año" className="w-[calc(50%-0.375rem)] sm:w-24">
                    <input type="number" value={reportYear} onChange={e => setReportYear(parseInt(e.target.value) || new Date().getFullYear())} className="input-base tabular-nums" disabled={!!(fromDate || toDate)} />
                </FilterField>
                <DateRangeField from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
                <FilterField label="Cliente">
                    <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input-base">
                        <option value="">Todos los clientes</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Categoría de cliente">
                    <select value={filterCustomerCategory} onChange={e => setFilterCustomerCategory(e.target.value)} className="input-base">
                        <option value="">Todas las categorías</option>
                        {customerCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Producto">
                    <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="input-base">
                        <option value="">Todos los productos</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Estado" className="w-full sm:w-44">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-base">
                        <option value="">Todos los estados</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="En Proceso">En proceso</option>
                        <option value="Completado">Completado</option>
                        <option value="void">Anuladas</option>
                    </select>
                </FilterField>
                <FilterField label="Monto mínimo" className="w-[calc(50%-0.375rem)] sm:w-32">
                    <input type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="input-base tabular-nums" />
                </FilterField>
                <FilterField label="Monto máximo" className="w-[calc(50%-0.375rem)] sm:w-32">
                    <input type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="input-base tabular-nums" />
                </FilterField>
            </FilterBar>

            <div className="kpi-grid mt-6">
                <KpiCard label="Ventas netas" value={money(s.revenue)} icon={DollarSign} tone="brand" trend={s.trend}
                    hint={s.trend !== undefined ? `Período anterior: ${money(s.previousRevenue)}` : 'Sin ventas en el período anterior'} />
                <KpiCard label="Margen bruto" value={money(s.margin)} icon={Percent} tone="success" hint={`${s.marginRate.toFixed(1)}% sobre ventas, según el costo registrado`} />
                <KpiCard label="Ventas realizadas" value={s.orders} icon={ShoppingCart} tone="info"
                    hint={s.pending ? `${s.pending} ${s.pending === 1 ? 'pendiente' : 'pendientes'} de cobro o entrega` : 'Ninguna pendiente'} />
                <KpiCard label="Ticket promedio" value={money(s.avgTicket)} icon={Receipt} tone="neutral" hint={`${s.avgItems.toFixed(1)} artículos por venta`} />
            </div>

            <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2 flex flex-col">
                    <CardBody className="flex-1 flex flex-col">
                        <PanelTitle title={s.byMonth ? 'Ventas por mes' : 'Ventas por día'} aside={money(s.revenue)} />
                        {s.revenue > 0 ? (
                            <div className="flex-1 min-h-64 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={s.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="ventasFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.18} />
                                                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                                        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axisMoney} />
                                        <Tooltip cursor={{ stroke: 'rgb(var(--line))' }} formatter={(v) => [money(v), 'Ventas']} />
                                        <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} fill="url(#ventasFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted py-16 text-center">No hay ventas en este período. Cambia el mes o el rango de fechas.</p>
                        )}
                    </CardBody>
                </Card>

                <div className="grid grid-cols-1 gap-6 content-start">
                    <Card>
                        <CardBody>
                            <PanelTitle title="Cobros por medio de pago" />
                            <StackedBar segments={paymentSegments} format={money} empty="Sin cobros en el período." />
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <PanelTitle title="ITBIS del período" />
                            <dl className="text-sm">
                                <div className="flex justify-between py-1.5"><dt className="text-ink-soft">Cobrado en ventas</dt><dd className="tabular-nums text-ink">{money(itbis.ventas)}</dd></div>
                                <div className="flex justify-between py-1.5"><dt className="text-ink-soft">Pagado en compras</dt><dd className="tabular-nums text-ink">− {money(itbis.compras)}</dd></div>
                                <div className="flex justify-between pt-2.5 mt-1.5 border-t border-line font-semibold">
                                    <dt className="text-ink">{itbis.neto >= 0 ? 'A pagar (IT-1)' : 'Saldo a favor'}</dt>
                                    <dd className="tabular-nums text-ink">{money(Math.abs(itbis.neto))}</dd>
                                </div>
                            </dl>
                            <p className="mt-3 text-xs text-ink-muted">Estimado con las ventas y compras registradas; no sustituye la declaración.</p>
                        </CardBody>
                    </Card>
                </div>
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardBody>
                        <PanelTitle title="Productos que más ingresan" />
                        <RankedList items={s.topRevenue} total={s.revenue} format={money} empty="No hay productos vendidos en el período." />
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <PanelTitle title="Productos más vendidos" aside={`${s.totalUnits.toLocaleString('es-DO')} unidades`} />
                        <RankedList items={s.topUnits} total={s.totalUnits} format={(v) => `${v.toLocaleString('es-DO')} u.`}
                            empty="No hay productos vendidos en el período." barClass="bg-brand-300 dark:bg-brand-400" />
                    </CardBody>
                </Card>
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <CardBody>
                        <PanelTitle title="Clientes" aside={`${s.activeCustomers} con compras`} />
                        <StackedBar
                            segments={[
                                { label: 'Volvieron a comprar', value: s.returning, color: 'bg-brand-600' },
                                { label: 'Compraron una vez', value: newCustomers, color: 'bg-brand-200 dark:bg-brand-800' },
                            ]}
                            format={(v) => v.toLocaleString('es-DO')}
                            empty="Sin clientes con compras en el período."
                        />
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <PanelTitle title="Vendedores" />
                        <RankedList items={s.team} total={s.revenue} format={money} empty="No hay ventas asignadas a usuarios en el período." />
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <PanelTitle title="Gastos por tipo" aside={s.expenseTotal ? money(s.expenseTotal) : null} />
                        <RankedList items={s.expenses} total={s.expenseTotal} format={money} empty="No hay gastos en el período." barClass="bg-gray-400 dark:bg-gray-500" />
                    </CardBody>
                </Card>
            </section>

            <section className="mt-10">
                <h3 className="text-lg font-semibold text-ink">Detalle</h3>
                <div className="mt-3 -mx-1 px-1 overflow-x-auto">
                    <div role="tablist" aria-label="Tablas de detalle" className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                        {DETAIL_TABS.map(t => (
                            <button key={t.value} type="button" role="tab" aria-selected={detailTab === t.value} onClick={() => setDetailTab(t.value)}
                                className={`h-8 px-3 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${detailTab === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                <ReportDataTable title={table.title} headers={table.headers} data={table.rows} numeric={table.numeric} className="mt-4" />
            </section>
        </div>
    );
};

export default ReportsViewSQL;
