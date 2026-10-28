// Versión migrada a PostgreSQL - ReportsView
import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';
import reportFilters from '../utils/reportFilters.js';
import { Download, Settings, BookOpen, TrendingUp, Users, ShoppingCart, DollarSign, Award, AlertCircle, Target, BarChart3 } from 'lucide-react';
import KpiCard from '../components/ui/KpiCard.jsx';
import toast from 'react-hot-toast';
import { loadScript } from '../utils/loadScript.js';
import NcfModal from '../components/modals/NcfModal.jsx';
import ReportDataTable from '../components/ReportDataTable.jsx';
import { generate606Data, generate607Data, generate608Data, exportToTxt } from '../utils/dgiiReportGenerator.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import LineChartTrend from '../components/charts/LineChartTrend.jsx';
import BarChartAnalysis from '../components/charts/BarChartAnalysis.jsx';
import PieChartShare from '../components/charts/PieChartShare.jsx';
import { useApiCrud } from '../hooks/useApi.js';
import api from '../api/client.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';

const ReportsViewSQL = ({ companyProfile, isMasterUser, onProfileUpdate }) => {
    // Cargar datos desde la API
    const { data: invoicesRaw, loading: loadingInvoices } = useApiCrud('/invoices');
    const { data: expensesRaw, loading: loadingExpenses } = useApiCrud('/expenses'); 
    const { data: productsRaw, loading: loadingProducts } = useApiCrud('/products');
    const { data: customersRaw, loading: loadingCustomers } = useApiCrud('/customers');
    const { data: suppliersRaw, loading: loadingSuppliers } = useApiCrud('/suppliers');

    // Normalizar datos
    const invoices = invoicesRaw || [];
    const expenses = expensesRaw || [];
    const products = productsRaw || [];
    const customers = customersRaw || [];
    const suppliers = suppliersRaw || [];

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
    const [generatedReport, setGeneratedReport] = useState(null);
    const [showNcfModal, setShowNcfModal] = useState(false);
    const currency = companyProfile?.currency || 'USD';

    const loading = loadingInvoices || loadingExpenses || loadingProducts || loadingCustomers || loadingSuppliers;

    const customerIndex = useMemo(() => {
        const map = new Map();
        (customers || []).forEach(customer => {
            if (customer?.id) {
                map.set(customer.id, customer);
            }
        });
        return map;
    }, [customers]);

    const productsMap = useMemo(() => {
        const map = new Map();
        (products || []).forEach(product => {
            if (product?.id) {
                map.set(product.id, product);
            }
        });
        return map;
    }, [products]);

    const customerCategories = useMemo(() => {
        const unique = new Set(companyProfile?.customerCategories || []);
        (customers || []).forEach(customer => {
            if (customer?.category && customer.category.trim()) {
                unique.add(customer.category);
            }
        });
        unique.add('Sin categoría');
        return Array.from(unique);
    }, [companyProfile, customers]);

    // Transformar fechas de la API (pueden venir como ISO strings)
    const normalizeDate = (dateValue) => {
        if (!dateValue) return null;
        if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
        if (typeof dateValue === 'string') return new Date(dateValue);
        return dateValue;
    };

    const filteredData = useMemo(() => {
        const criteria = {};
        if (fromDate) criteria.from = fromDate;
        if (toDate) criteria.to = toDate;
        if (filterCustomer) criteria.customerId = filterCustomer;
        if (filterProduct) criteria.productId = filterProduct;
        if (minPrice !== '') criteria.minPrice = parseFloat(minPrice) || 0;
        if (maxPrice !== '') criteria.maxPrice = parseFloat(maxPrice) || 0;
        if (statusFilter) criteria.status = statusFilter;

        if (!fromDate && !toDate) {
            const startOfMonth = new Date(reportYear, reportMonth, 1);
            const endOfMonth = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59);
            criteria.from = startOfMonth.toISOString();
            criteria.to = endOfMonth.toISOString();
        }

        let filteredInvoices = reportFilters.filterInvoices(invoices || [], criteria);
        if (filterCustomerCategory) {
            filteredInvoices = filteredInvoices.filter(inv => {
                const customer = customerIndex.get(inv.customerId);
                const category = (customer?.category && customer.category.trim()) ? customer.category : 'Sin categoría';
                return category === filterCustomerCategory;
            });
        }
        const filteredExpenses = reportFilters.filterExpenses(expenses || [], criteria);
        return { filteredInvoices, filteredExpenses };
    }, [reportMonth, reportYear, fromDate, toDate, filterCustomer, filterProduct, filterCustomerCategory, minPrice, maxPrice, statusFilter, invoices, expenses, customerIndex]);

    const weeklyTopProducts = useMemo(() => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const weeklyInvoices = (invoices || []).filter(inv => {
            const invDate = normalizeDate(inv.date);
            return inv.status !== 'Cancelado' && invDate && invDate >= startOfWeek;
        });
        const productQuantities = {};
        weeklyInvoices.forEach(inv => {
            (inv.items || []).forEach(item => {
                const name = (item.name || item.productName || 'Sin nombre').split('(')[0].trim();
                productQuantities[name] = (productQuantities[name] || 0) + item.quantity;
            });
        });
        return Object.entries(productQuantities).sort(([, a], [, b]) => b - a).slice(0, 5);
    }, [invoices]);

    const analyticsSnapshot = useMemo(() => {
        const validInvoices = (filteredData.filteredInvoices || []).filter(inv => inv && inv.status !== 'Cancelado');
        const paymentTotals = { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0 };
        const statusTotals = { pendiente: 0, completado: 0, cancelado: 0 };
        const productRevenueMap = new Map();
        const teamMap = new Map();
        const customerOrderCount = new Map();
        const dayTotals = new Map();
        let revenue = 0;
        let totalItems = 0;
        let totalCost = 0;

        const registerPayment = (method, amount) => {
            if (!amount || Number.isNaN(amount)) return;
            paymentTotals[method] = (paymentTotals[method] || 0) + amount;
        };

        validInvoices.forEach(inv => {
            const invoiceTotal = inv.total || 0;
            revenue += invoiceTotal;
            totalItems += (inv.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

            const normalizedStatus = (inv.status || '').toLowerCase();
            if (normalizedStatus.includes('pendiente')) statusTotals.pendiente += 1;
            else if (normalizedStatus.includes('cancel')) statusTotals.cancelado += 1;
            else statusTotals.completado += 1;

            (inv.items || []).forEach(item => {
                const qty = item.quantity || 0;
                const price = item.price || 0;
                const product = productsMap.get(item.productId);
                const itemCost = (product?.purchasePrice || 0) * qty;
                totalCost += itemCost;
                const key = item.name || product?.name || 'Producto';
                productRevenueMap.set(key, (productRevenueMap.get(key) || 0) + price * qty);
            });

            const sellerName = inv.emitterInfo?.fullName || 'No asignado';
            const sellerSummary = teamMap.get(sellerName) || { total: 0, orders: 0 };
            sellerSummary.total += invoiceTotal;
            sellerSummary.orders += 1;
            teamMap.set(sellerName, sellerSummary);

            const customerKey = inv.customerId || inv.customerName || 'Sin identificar';
            customerOrderCount.set(customerKey, (customerOrderCount.get(customerKey) || 0) + 1);

            const invoiceDate = normalizeDate(inv.date);
            if (invoiceDate && !Number.isNaN(invoiceDate.getTime())) {
                invoiceDate.setHours(0, 0, 0, 0);
                const key = invoiceDate.toISOString().slice(0, 10);
                dayTotals.set(key, (dayTotals.get(key) || 0) + invoiceTotal);
            }

            const payments = inv.payments || [];
            if (payments.length) {
                payments.forEach(payment => {
                    registerPayment('efectivo', payment.efectivo);
                    registerPayment('tarjeta', payment.tarjeta);
                    registerPayment('transferencia', payment.chequeTransferencia);
                    registerPayment('credito', payment.credito);
                });
            } else {
                registerPayment('efectivo', invoiceTotal);
            }
        });

        const expenseBreakdown = (() => {
            const map = new Map();
            (filteredData.filteredExpenses || []).forEach(exp => {
                const key = exp.tipoGasto || 'Gasto Operativo';
                map.set(key, (map.set(key) || 0) + (exp.totalMontoFacturado || exp.total || 0));
            });
            return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, amount]) => ({ label, amount }));
        })();

        const topProducts = Array.from(productRevenueMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, total]) => ({ name, total }));

        const teamPerformance = Array.from(teamMap.entries())
            .map(([name, data]) => ({ name, total: data.total, orders: data.orders }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        const activeCustomers = customerOrderCount.size;
        let returningCustomers = 0;
        customerOrderCount.forEach(count => {
            if (count > 1) returningCustomers += 1;
        });
        const newCustomers = Math.max(0, activeCustomers - returningCustomers);

        const paymentTotal = Object.values(paymentTotals).reduce((sum, val) => sum + val, 0) || revenue;
        const paymentMix = Object.entries(paymentTotals)
            .filter(([, amount]) => amount > 0)
            .map(([key, amount]) => ({
                key,
                label: key === 'transferencia' ? 'Transferencia/Cheque' : key.charAt(0).toUpperCase() + key.slice(1),
                amount,
                percent: paymentTotal ? (amount / paymentTotal) * 100 : 0,
            }));

        const totalStatusCount = statusTotals.pendiente + statusTotals.completado + statusTotals.cancelado || 1;
        const statusBreakdown = [
            { key: 'completado', label: 'Completados', value: statusTotals.completado, percent: (statusTotals.completado / totalStatusCount) * 100, accent: 'bg-success-500' },
            { key: 'pendiente', label: 'Pendientes', value: statusTotals.pendiente, percent: (statusTotals.pendiente / totalStatusCount) * 100, accent: 'bg-amber-400' },
            { key: 'cancelado', label: 'Cancelados', value: statusTotals.cancelado, percent: (statusTotals.cancelado / totalStatusCount) * 100, accent: 'bg-rose-500' },
        ];

        const trendSeries = (() => {
            const now = new Date();
            const series = [];
            for (let i = 27; i >= 0; i--) {
                const day = new Date(now);
                day.setDate(now.getDate() - i);
                day.setHours(0, 0, 0, 0);
                const key = day.toISOString().slice(0, 10);
                series.push({
                    key,
                    label: day.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }),
                    value: dayTotals.get(key) || 0,
                });
            }
            return series;
        })();

        const recentWindow = trendSeries.slice(-7);
        const previousWindow = trendSeries.slice(-14, -7);
        const recentTotal = recentWindow.reduce((sum, day) => sum + day.value, 0);
        const previousTotal = previousWindow.reduce((sum, day) => sum + day.value, 0);
        const trendDelta = previousTotal ? ((recentTotal - previousTotal) / previousTotal) * 100 : 0;

        return {
            netSales: revenue,
            grossMargin: revenue - totalCost,
            marginRate: revenue ? ((revenue - totalCost) / revenue) * 100 : 0,
            orders: validInvoices.length,
            avgTicket: validInvoices.length ? revenue / validInvoices.length : 0,
            avgItems: validInvoices.length ? totalItems / validInvoices.length : 0,
            activeCustomers,
            returningCustomers,
            newCustomers,
            paymentMix,
            statusBreakdown,
            topProducts,
            teamPerformance,
            expenseBreakdown,
            trendSeries: recentWindow,
            trendDelta,
            weeklyVolume: recentTotal,
        };
    }, [filteredData.filteredInvoices, filteredData.filteredExpenses, productsMap]);

    const categoryMetrics = useMemo(() => {
        const summary = new Map();
        let totalSales = 0;
        (filteredData.filteredInvoices || []).forEach(inv => {
            if (inv.status === 'Cancelado') return;
            const amount = inv.total || 0;
            const customer = customerIndex.get(inv.customerId);
            const category = (customer?.category && customer.category.trim()) ? customer.category : 'Sin categoría';
            const current = summary.get(category) || { category, orders: 0, total: 0 };
            current.orders += 1;
            current.total += amount;
            summary.set(category, current);
            totalSales += amount;
        });
        const rows = Array.from(summary.values()).map(row => ({
            category: row.category,
            orders: row.orders,
            total: row.total,
            avg: row.orders ? row.total / row.orders : 0,
            percent: totalSales ? (row.total / totalSales) * 100 : 0,
        })).sort((a, b) => b.total - a.total);
        return { rows, totalSales };
    }, [filteredData.filteredInvoices, customerIndex]);

    const completedOrders = analyticsSnapshot.statusBreakdown?.find(entry => entry.key === 'completado')?.value || 0;
    const trendMaxValue = analyticsSnapshot.trendSeries?.reduce((max, day) => Math.max(max, day.value), 0) || 0;
    const weeklyTopMax = weeklyTopProducts.length > 0 ? weeklyTopProducts[0][1] : 0;
    const paymentColorMap = {
        efectivo: 'bg-warning-500',
        tarjeta: 'bg-brand-500',
        transferencia: 'bg-sky-500',
        credito: 'bg-danger-500',
    };
    const repeatRate = analyticsSnapshot.activeCustomers ? (analyticsSnapshot.returningCustomers / analyticsSnapshot.activeCustomers) * 100 : 0;
    const teamMax = analyticsSnapshot.teamPerformance?.reduce((max, member) => Math.max(max, member.total), 0) || 0;
    const expenseMax = analyticsSnapshot.expenseBreakdown?.reduce((max, entry) => Math.max(max, entry.amount || 0), 0) || 0;
    const topCategoryShare = (categoryMetrics.rows || []).slice(0, 5);
    const categoryMax = topCategoryShare.reduce((max, entry) => Math.max(max, entry.total), 0) || 0;

    const it1Summary = useMemo(() => {
        const itbisVentas = filteredData.filteredInvoices.reduce((sum, inv) => sum + (inv.itbis || 0), 0);
        const itbisCompras = filteredData.filteredExpenses.reduce((sum, exp) => sum + (exp.itbisFacturado || 0), 0);
        const itbisAPagar = itbisVentas - itbisCompras;
        return { itbisVentas, itbisCompras, itbisAPagar };
    }, [filteredData]);

    const salesKpis = useMemo(() => {
        const valid = (filteredData.filteredInvoices || []).filter(inv => inv.status !== 'Cancelado');
        const tickets = valid.length;
        const total = valid.reduce((s, inv) => s + (inv.total || 0), 0);
        const avg = tickets > 0 ? total / tickets : 0;
        return { tickets, total, avg };
    }, [filteredData]);

    const salesByCustomer = useMemo(() => {
        const customerData = {};
        (filteredData.filteredInvoices || []).forEach(inv => {
            if (!inv.customerId || inv.customerId === 'guest') return;
            const customerName = inv.customerName || 'Cliente no encontrado';
            customerData[inv.customerId] = customerData[inv.customerId] || { name: customerName, orders: 0, total: 0 };
            customerData[inv.customerId].orders += 1;
            customerData[inv.customerId].total += inv.total || 0;
        });
        return Object.values(customerData)
            .sort((a, b) => b.total - a.total)
            .map(c => ({
                'Nombre del Cliente': c.name,
                'Cantidad de Pedidos': c.orders,
                'Total Gastado': formatCurrency(c.total, currency),
            }));
    }, [filteredData.filteredInvoices, currency]);

    const salesByEmployee = useMemo(() => {
        const employeeData = {};
        (filteredData.filteredInvoices || []).forEach(inv => {
            const employeeName = inv.emitterInfo?.fullName || 'No Asignado';
            employeeData[employeeName] = employeeData[employeeName] || { orders: 0, total: 0 };
            employeeData[employeeName].orders += 1;
            employeeData[employeeName].total += inv.total || 0;
        });
        return Object.entries(employeeData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.total - a.total)
            .map(e => ({
                'Nombre del Empleado': e.name,
                'Pedidos Realizados': e.orders,
                'Total Vendido': formatCurrency(e.total, currency),
            }));
    }, [filteredData.filteredInvoices, currency]);

    const productProfitability = useMemo(() => {
        const profitabilityData = {};
        (filteredData.filteredInvoices || []).forEach(inv => {
            (inv.items || []).forEach(item => {
                const productDetails = (products || []).find(p => p.id === item.productId);
                const cost = productDetails?.purchasePrice || 0;
                profitabilityData[item.name] = profitabilityData[item.name] || { name: item.name, units: 0, revenue: 0, totalCost: 0, netProfit: 0 };
                const pData = profitabilityData[item.name];
                pData.units += item.quantity;
                const itemRevenue = (item.price * item.quantity);
                const itemCost = cost * item.quantity;
                pData.revenue += itemRevenue;
                pData.totalCost += itemCost;
                pData.netProfit += itemRevenue - itemCost;
            });
        });
        return Object.values(profitabilityData)
            .sort((a, b) => b.netProfit - a.netProfit)
            .map(p => ({
                'Nombre del Producto': p.name,
                'Unidades Vendidas': p.units,
                'Ingresos Totales': formatCurrency(p.revenue, currency),
                'Costo Total': formatCurrency(p.totalCost, currency),
                'Ganancia Neta': formatCurrency(p.netProfit, currency),
            }));
    }, [filteredData.filteredInvoices, products, currency]);

    const inventoryValue = useMemo(() => {
        return (products || [])
            .map(p => ({
                'Nombre del Producto': p.name,
                'Stock Actual': p.stock,
                'Costo Unitario': formatCurrency(p.purchasePrice, currency),
                'Valor Total del Inventario': formatCurrency((p.stock || 0) * (p.purchasePrice || 0), currency),
            }));
    }, [products, currency]);

    const categorySummaryRows = useMemo(() => {
        return (categoryMetrics.rows || []).map(item => ({
            'Categoría': item.category,
            'Pedidos': item.orders,
            'Total Vendido': formatCurrency(item.total, currency),
            'Ticket Promedio': formatCurrency(item.avg, currency),
            'Participación %': `${item.percent.toFixed(1)}%`,
        }));
    }, [categoryMetrics.rows, currency]);

    const topCustomersByCategory = useMemo(() => {
        const grouped = new Map();
        (filteredData.filteredInvoices || []).forEach(inv => {
            if (inv.status === 'Cancelado') return;
            if (!inv.customerId || inv.customerId === 'guest') return;
            const customer = customerIndex.get(inv.customerId);
            const category = (customer?.category && customer.category.trim()) ? customer.category : 'Sin categoría';
            const customerName = inv.customerName || customer?.name || 'Cliente sin nombre';
            const amount = inv.total || 0;
            if (!grouped.has(category)) grouped.set(category, new Map());
            const categoryMap = grouped.get(category);
            const existing = categoryMap.get(inv.customerId) || { customerName, orders: 0, total: 0 };
            existing.orders += 1;
            existing.total += amount;
            categoryMap.set(inv.customerId, existing);
        });
        const rows = [];
        grouped.forEach((customersMap, category) => {
            const top = Array.from(customersMap.values()).sort((a, b) => b.total - a.total).slice(0, 3);
            top.forEach(customer => {
                rows.push({
                    'Categoría': category,
                    'Cliente': customer.customerName,
                    'Pedidos': customer.orders,
                    'Total Vendido': formatCurrency(customer.total, currency),
                });
            });
        });
        return rows;
    }, [filteredData.filteredInvoices, customerIndex, currency]);
    
    const handleSaveNcf = async (newSequences) => {
        try {
            await api.settings.updateNcf(newSequences);
            if (onProfileUpdate) {
                onProfileUpdate({ ...companyProfile, ncfSequences: newSequences });
            }
            toast.success('Secuencias NCF actualizadas');
        } catch (error) {
            console.error('Error saving NCF sequences:', error);
            toast.error('Error al guardar secuencias NCF');
            throw error;
        }
    };

    const handleGenerateReport = (type) => {
        let data, title, headers;
        if (type === '606') {
            const expensesWithNcf = filteredData.filteredExpenses.filter(exp => exp.ncf && exp.ncf.trim() !== '');
            
            if (expensesWithNcf.length === 0) {
                toast.error('No se encontraron gastos con Comprobante Fiscal en este período para generar el reporte 606.');
                return;
            }
            data = generate606Data(expensesWithNcf, suppliers);
            title = 'Reporte 606 - Compras de Bienes y Servicios';
            headers = Object.keys(data[0] || {});
        } else if (type === '607') {
            const invoicesWithNcf = filteredData.filteredInvoices.filter(inv => inv.ncf && inv.ncf.type !== 'Sin Valor Fiscal');

            if (invoicesWithNcf.length === 0) {
                toast.error('No se encontraron ventas con Comprobante Fiscal en este período para generar el reporte 607.');
                return;
            }
            data = generate607Data(invoicesWithNcf);
            title = 'Reporte 607 - Ventas de Bienes y Servicios';
            headers = Object.keys(data[0] || {});
        } else if (type === '608') {
            const invoicesCancelled = filteredData.filteredInvoices.filter(inv => inv.ncf && inv.ncf.type !== 'Sin Valor Fiscal' && inv.status === 'Cancelado');
            if (invoicesCancelled.length === 0) {
                toast.error('No se encontraron comprobantes anulados (608) en este período.');
                return;
            }
            data = generate608Data(invoicesCancelled);
            title = 'Reporte 608 - Comprobantes Anulados';
            headers = Object.keys(data[0] || {});
        }

        if (data.length === 0) {
            toast.error(`No hay datos para generar el reporte ${type} en el período seleccionado.`);
            return;
        }

        setGeneratedReport({ title, headers, data, type });
        toast.success(`Reporte ${type} generado para visualización.`);
    };

    const handleExport = async (format) => {
        if (!generatedReport || !generatedReport.data.length) {
            toast.error('Primero debe generar un reporte para poder exportarlo.');
            return;
        }

        const { type, data } = generatedReport;
        const period = `${reportYear}${(reportMonth + 1).toString().padStart(2, '0')}`;
        const rnc = companyProfile?.rnc?.replace(/-/g, '') || 'SIN_RNC';
        const filename = `DGII_F${type}_${rnc}_${period}`;

        if (format === 'txt') {
            exportToTxt(data, `${filename}.txt`);
            toast.success('Exportando a .txt para la DGII...');
        } else if (format === 'xlsx') {
            toast.loading('Generando archivo Excel...');
            try {
                await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
                const worksheet = window.XLSX.utils.json_to_sheet(data);
                const workbook = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(workbook, worksheet, `Reporte ${type}`);
                window.XLSX.writeFile(workbook, `${filename}.xlsx`);
                toast.dismiss();
                toast.success('¡Archivo Excel exportado!');
            } catch (error) {
                toast.dismiss();
                toast.error('No se pudo exportar a Excel.');
                console.error("Error exporting to XLSX:", error);
            }
        }
    };

    const handleExportFiltered = async (format) => {
        toast.loading('Generando archivo filtrado...');
        try {
            const exportRows = [];
            const byId = new Map((customers || []).map(c => [c.id, c]));
            if (reportScope === 'sales' || reportScope === 'both') {
                (filteredData.filteredInvoices || []).forEach(inv => {
                    const c = byId.get(inv.customerId);
                    const invDate = normalizeDate(inv.date);
                    exportRows.push({
                        Tipo: 'Venta',
                        ID: inv.id || '',
                        Fecha: invDate ? invDate.toISOString() : '',
                        Cliente: inv.customerName || inv.customerId || 'Invitado',
                        Categoria: c?.category || '',
                        Estado: inv.status || '',
                        Total: inv.total || 0,
                        Items: JSON.stringify(inv.items || [])
                    });
                });
            }
            if (reportScope === 'purchases' || reportScope === 'both') {
                (filteredData.filteredExpenses || []).forEach(exp => {
                    const expDate = normalizeDate(exp.date);
                    exportRows.push({
                        Tipo: 'Compra',
                        ID: exp.id || '',
                        Fecha: expDate ? expDate.toISOString() : '',
                        Proveedor: exp.supplierName || exp.supplierId || '',
                        Estado: exp.status || '',
                        Total: exp.totalMontoFacturado || exp.total || 0,
                        Items: JSON.stringify(exp.items || [])
                    });
                });
            }

            if (exportRows.length === 0) {
                toast.dismiss();
                toast.error('No hay datos filtrados para exportar.');
                return;
            }

            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
            const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtrado');
            const period = fromDate && toDate ? `${fromDate}_${toDate}` : `${reportYear}${(reportMonth + 1).toString().padStart(2, '0')}`;
            const filename = `Report_Filtrado_${period}.xlsx`;
            window.XLSX.writeFile(workbook, filename);
            toast.dismiss();
            toast.success('Exportación filtrada completada.');
        } catch (error) {
            toast.dismiss();
            toast.error('Error al exportar los datos filtrados.');
            console.error('Export filtered error:', error);
        }
    };

    if (loading) {
        return (
            <PageSkeleton label="Cargando…" />
        );
    }

    return (
        <div>
            <h2 className="page-title mb-6">Reportes</h2>
            <Card>
                <CardBody>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" onClick={() => handleExportFiltered('xlsx')}><Download size={16} className="mr-2"/> Exportar Filtrado</Button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Desde</label>
                                <input aria-label="Desde" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-base" />
                            </div>
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Hasta</label>
                                <input aria-label="Hasta" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-base" />
                            </div>
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Ámbito</label>
                                <select aria-label="Ámbito" value={reportScope} onChange={e => setReportScope(e.target.value)} className="input-base">
                                    <option value="sales">Ventas</option>
                                    <option value="purchases">Compras</option>
                                    <option value="both">Ambos</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Cliente</label>
                                <select aria-label="Cliente" value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input-base">
                                    <option value="">-- Todos --</option>
                                    {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Categoría de Cliente</label>
                                <select aria-label="Categoría de Cliente" value={filterCustomerCategory} onChange={e => setFilterCustomerCategory(e.target.value)} className="input-base">
                                    <option value="">-- Todas --</option>
                                    {customerCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-ink-soft mb-1">Producto</label>
                                <select aria-label="Producto" value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="input-base">
                                    <option value="">-- Todos --</option>
                                    {(products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm text-ink-soft mb-1">Estado</label>
                            <select aria-label="Estado" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-base">
                                <option value="">-- Todos --</option>
                                <option value="Pendiente">Pendiente</option>
                                <option value="Pagado">Pagado</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-ink-soft mb-1">Precio Min</label>
                            <input aria-label="Precio Min" type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="input-base" />
                        </div>
                        <div>
                            <label className="block text-sm text-ink-soft mb-1">Precio Max</label>
                            <input aria-label="Precio Max" type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="input-base" />
                        </div>
                        <div>
                            <label className="block text-sm text-ink-soft mb-1">Mes/Año</label>
                            <div className="flex gap-2">
                                <select aria-label="Mes/Año" value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))} className="input-base w-40">
                                    {[...Array(12).keys()].map(i => <option key={i} value={i}>{new Date(0, i).toLocaleString('es-DO', { month: 'short' })}</option>)}
                                </select>
                                <input aria-label="Año" type="number" value={reportYear} onChange={e => setReportYear(parseInt(e.target.value))} className="input-base w-28" />
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>

            <section className="mt-8 space-y-8">
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                        <h3 className="text-lg font-semibold text-ink">Resumen ejecutivo</h3>
                        <p className="text-sm text-ink-muted">Basado en el período seleccionado</p>
                    </div>
                    <div className="kpi-grid">
                        <KpiCard label="Ventas netas" value={formatCurrency(analyticsSnapshot.netSales || 0, currency)} icon={DollarSign} tone="brand" trend={analyticsSnapshot.trendDelta} hint="vs semana anterior" />
                        <KpiCard label="Margen bruto" value={formatCurrency(analyticsSnapshot.grossMargin || 0, currency)} icon={Award} tone="success" hint={`Margen ${analyticsSnapshot.marginRate.toFixed(1)}%`} />
                        <KpiCard label="Pedidos completados" value={completedOrders} icon={ShoppingCart} tone="info" hint={`De ${analyticsSnapshot.orders} evaluados`} />
                        <KpiCard label="Ticket promedio" value={formatCurrency(analyticsSnapshot.avgTicket || 0, currency)} icon={Target} tone="neutral" hint={`${analyticsSnapshot.avgItems.toFixed(1)} artículos/pedido`} />
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold text-ink mb-3">Clientes y operación</h3>
                    <div className="kpi-grid">
                        <KpiCard label="Clientes activos" value={analyticsSnapshot.activeCustomers} icon={Users} tone="info" hint="Con al menos un pedido" />
                        <KpiCard label="Clientes recurrentes" value={analyticsSnapshot.returningCustomers} icon={Target} tone="success" hint={`${repeatRate.toFixed(1)}% de la base`} />
                        <KpiCard label="Clientes nuevos" value={analyticsSnapshot.newCustomers} icon={AlertCircle} tone="brand" hint="En este período" />
                        <KpiCard label="Cesta promedio" value={analyticsSnapshot.avgItems.toFixed(1)} icon={BarChart3} tone="warning" hint="productos por pedido" />
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold text-ink mb-3">Indicadores fiscales</h3>
                    <div className="kpi-grid">
                        <KpiCard label="ITBIS Ventas (607)" value={formatCurrency(it1Summary.itbisVentas, currency)} icon={DollarSign} tone="success" hint="Débito fiscal" />
                        <KpiCard label="ITBIS Compras (606)" value={formatCurrency(it1Summary.itbisCompras, currency)} icon={AlertCircle} tone="danger" hint="Crédito fiscal" />
                        <KpiCard label="ITBIS a Pagar (IT-1)" value={formatCurrency(it1Summary.itbisAPagar, currency)} icon={TrendingUp} tone={it1Summary.itbisAPagar >= 0 ? 'info' : 'warning'} hint={it1Summary.itbisAPagar >= 0 ? 'A favor del estado' : 'A recuperar'} />
                    </div>
                </div>
            </section>

            <section className="mt-10 grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2">
                    <CardBody>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                            <div>
                                <h3 className="text-lg font-semibold text-ink">Actividad de ventas (últimos 7 días)</h3>
                                <p className="text-sm text-ink-muted">Total semanal {formatCurrency(analyticsSnapshot.weeklyVolume || 0, currency)}</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {analyticsSnapshot.trendSeries?.map(day => (
                                <div key={day.key}>
                                    <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                                        <span>{day.label}</span>
                                        <span>{formatCurrency(day.value, currency)}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${trendMaxValue ? Math.min(100, (day.value / trendMaxValue) * 100) : 0}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
                <div className="grid grid-cols-1 gap-6">
                    <Card>
                        <CardBody>
                            <h3 className="text-lg font-semibold text-ink mb-4">Mix de medios de pago</h3>
                            {analyticsSnapshot.paymentMix && analyticsSnapshot.paymentMix.length > 0 ? (
                                <div className="space-y-4">
                                    {analyticsSnapshot.paymentMix.map(method => (
                                        <div key={method.key}>
                                            <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                                <span>{method.label}</span>
                                                <span className="font-semibold">{method.percent.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-slate-100">
                                                <div className={`h-full rounded-full ${paymentColorMap[method.key] || 'bg-slate-500'}`} style={{ width: `${Math.min(100, method.percent)}%` }}></div>
                                            </div>
                                            <p className="text-xs text-ink-muted mt-1">{formatCurrency(method.amount, currency)}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-ink-muted">Sin pagos registrados en el período.</p>
                            )}
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <h3 className="text-lg font-semibold text-ink mb-4">Estado de pedidos</h3>
                            <div className="space-y-4">
                                {analyticsSnapshot.statusBreakdown.map(status => (
                                    <div key={status.key}>
                                        <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                            <span>{status.label}</span>
                                            <span className="font-semibold">{status.value}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className={`${status.accent} h-full rounded-full`} style={{ width: `${Math.min(100, status.percent)}%` }}></div>
                                        </div>
                                        <p className="text-xs text-ink-muted mt-1">{status.percent.toFixed(1)}% del total</p>
                                    </div>
                                ))}
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-ink mb-4">Top productos por ingresos</h3>
                        {analyticsSnapshot.topProducts && analyticsSnapshot.topProducts.length > 0 ? (
                            <div className="space-y-4">
                                {analyticsSnapshot.topProducts.map(product => (
                                    <div key={product.name}>
                                        <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                            <span>{product.name}</span>
                                            <span className="font-semibold">{formatCurrency(product.total, currency)}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${analyticsSnapshot.topProducts[0].total ? Math.min(100, (product.total / analyticsSnapshot.topProducts[0].total) * 100) : 0}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted">No hay productos con ventas en este período.</p>
                        )}
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-ink mb-4">Productos más vendidos (unidades semanales)</h3>
                        {weeklyTopProducts.length > 0 ? (
                            <div className="space-y-4">
                                {weeklyTopProducts.map(([name, quantity], index) => (
                                    <div key={name}>
                                        <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                            <span className="flex items-center gap-2"><span className="text-xs text-slate-400">#{index + 1}</span>{name}</span>
                                            <span className="font-semibold">{quantity} u.</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-warning-500" style={{ width: `${weeklyTopMax ? Math.min(100, (quantity / weeklyTopMax) * 100) : 0}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted">No se registran ventas en la última semana.</p>
                        )}
                    </CardBody>
                </Card>
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-ink mb-4">Rendimiento del equipo</h3>
                        {analyticsSnapshot.teamPerformance && analyticsSnapshot.teamPerformance.length > 0 ? (
                            <div className="space-y-4">
                                {analyticsSnapshot.teamPerformance.map(member => (
                                    <div key={member.name}>
                                        <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                            <span>{member.name}</span>
                                            <span className="font-semibold">{formatCurrency(member.total, currency)}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-success-500" style={{ width: `${teamMax ? Math.min(100, (member.total / teamMax) * 100) : 0}%` }}></div>
                                        </div>
                                        <p className="text-xs text-ink-muted mt-1">{member.orders} pedidos atendidos</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted">No hay pedidos asociados a usuarios en este período.</p>
                        )}
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-ink mb-4">Gastos por categoría</h3>
                        {analyticsSnapshot.expenseBreakdown && analyticsSnapshot.expenseBreakdown.length > 0 ? (
                            <div className="space-y-4">
                                {analyticsSnapshot.expenseBreakdown.map(entry => (
                                    <div key={entry.label}>
                                        <div className="flex items-center justify-between text-sm text-ink-soft mb-1">
                                            <span>{entry.label}</span>
                                            <span className="font-semibold">{formatCurrency(entry.amount, currency)}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-danger-500" style={{ width: `${expenseMax ? Math.min(100, (entry.amount / expenseMax) * 100) : 0}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-ink-muted">No hay gastos en el período filtrado.</p>
                        )}
                    </CardBody>
                </Card>
            </section>

            <section className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LineChartTrend
                    data={analyticsSnapshot.trendSeries?.map(d => ({ ...d, label: d.label })) || []}
                    title="Actividad de ventas (últimos 7 días)"
                    dataKey="value"
                    xAxisKey="label"
                    currency={currency}
                    height={350}
                />
                <BarChartAnalysis
                    data={analyticsSnapshot.topProducts?.slice(0, 5).map(p => ({ name: p.name, value: p.total })) || []}
                    title="Top 5 productos por ingresos"
                    dataKey="value"
                    xAxisKey="name"
                    currency={currency}
                    color="#4f46e5"
                    height={350}
                />
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PieChartShare
                    data={analyticsSnapshot.paymentMix?.map(p => ({ name: p.label, value: p.amount, percent: p.percent })) || []}
                    title="Mix de medios de pago"
                    dataKey="value"
                    nameKey="name"
                    height={350}
                />
                <BarChartAnalysis
                    data={analyticsSnapshot.expenseBreakdown?.map(e => ({ name: e.label, value: e.amount })) || []}
                    title="Gastos por categoría"
                    dataKey="value"
                    xAxisKey="name"
                    currency={currency}
                    color="#0ea5e9"
                    height={350}
                />
            </section>

            <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChartAnalysis
                    data={analyticsSnapshot.teamPerformance?.slice(0, 5).map(t => ({ name: t.name, value: t.total })) || []}
                    title="Rendimiento del equipo (Top 5)"
                    dataKey="value"
                    xAxisKey="name"
                    currency={currency}
                    color="#10b981"
                    height={350}
                />
                <PieChartShare
                    data={topCategoryShare?.map(c => ({ name: c.category, value: c.total, percent: c.percent })) || []}
                    title="Participación por categoría de cliente"
                    dataKey="value"
                    nameKey="name"
                    height={350}
                />
            </section>

            {generatedReport && <ReportDataTable title={generatedReport.title} headers={generatedReport.headers} data={generatedReport.data} />}
            
            <div className="mt-8 space-y-8">
                <ReportDataTable 
                    title="📊 Ventas por Categoría de Cliente"
                    headers={['Categoría', 'Pedidos', 'Total Vendido', 'Ticket Promedio', 'Participación %']}
                    data={categorySummaryRows}
                />
                <ReportDataTable 
                    title="🏅 Top Clientes por Categoría"
                    headers={['Categoría', 'Cliente', 'Pedidos', 'Total Vendido']}
                    data={topCustomersByCategory}
                />
                <ReportDataTable 
                    title="📈 Reporte de Ventas por Cliente (Mes Seleccionado)"
                    headers={['Nombre del Cliente', 'Cantidad de Pedidos', 'Total Gastado']}
                    data={salesByCustomer}
                />
                <ReportDataTable 
                    title="🤵 Reporte de Ventas por Empleado (Mes Seleccionado)"
                    headers={['Nombre del Empleado', 'Pedidos Realizados', 'Total Vendido']}
                    data={salesByEmployee}
                />
                <ReportDataTable 
                    title="💰 Análisis de Rentabilidad por Producto (Mes Seleccionado)"
                    headers={['Nombre del Producto', 'Unidades Vendidas', 'Ingresos Totales', 'Costo Total', 'Ganancia Neta']}
                    data={productProfitability}
                />
                <ReportDataTable 
                    title="📦 Reporte de Valor de Inventario (Actual)"
                    headers={['Nombre del Producto', 'Stock Actual', 'Costo Unitario', 'Valor Total del Inventario']}
                    data={inventoryValue}
                />
            </div>

            {showNcfModal && (
                <NcfModal
                    companyProfile={companyProfile}
                    onClose={() => setShowNcfModal(false)}
                    onSave={handleSaveNcf}
                    isMasterUser={isMasterUser}
                    useApi={true}
                />
            )}
        </div>
    );
};

export default ReportsViewSQL;
