// Versión migrada a PostgreSQL - FiscalManagementView
import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, BookOpen, Download, Zap, FileText, TrendingUp, ShoppingCart, Scale } from 'lucide-react';
import { formatCurrency } from '../utils/formatCurrency.js';
import reportFilters from '../utils/reportFilters.js';
import { loadScript } from '../utils/loadScript.js';
import { generate606Data, generate607Data, generate608Data, exportToTxt } from '../utils/dgiiReportGenerator.js';
import ReportDataTable from '../components/ReportDataTable.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { useApiCrud } from '../hooks/useApi.js';
import api from '../api/client.js';
import EcfDashboard from '../components/ecf/EcfDashboard.jsx';
import EcfDocumentsTable from '../components/ecf/EcfDocumentsTable.jsx';
import PageSkeleton from '../components/ui/Skeleton.jsx';

const monthOptions = Array.from({ length: 12 }, (_, idx) => ({ value: idx, label: new Date(2000, idx, 1).toLocaleString('es-ES', { month: 'long' }) }));



const FiscalManagementViewSQL = ({ companyProfile = {}, onProfileUpdate }) => {
    // Cargar datos desde la API
    const { data: invoicesRaw, loading: loadingInvoices } = useApiCrud('/invoices');
    const { data: expensesRaw, loading: loadingExpenses } = useApiCrud('/expenses');
    const { data: suppliersRaw, loading: loadingSuppliers } = useApiCrud('/suppliers');
    
    const invoices = invoicesRaw || [];
    const expenses = expensesRaw || [];
    const suppliers = suppliersRaw || [];
    const creditNotes = []; // TODO: Agregar colección de notas de crédito si existe
    const loading = loadingInvoices || loadingExpenses || loadingSuppliers;

    const [reportMonth, setReportMonth] = useState(new Date().getMonth());
    const [reportYear, setReportYear] = useState(new Date().getFullYear());
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [generatedReport, setGeneratedReport] = useState(null);
    const [activeTab, setActiveTab] = useState('reportes');
    const currency = companyProfile?.currency || 'USD';
    const tableRef = useRef(null);

    const filteredData = useMemo(() => {
        const criteria = {};
        if (fromDate) criteria.from = fromDate;
        if (toDate) criteria.to = toDate;
        if (!fromDate && !toDate) {
            const startOfMonth = new Date(reportYear, reportMonth, 1);
            const endOfMonth = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59);
            criteria.from = startOfMonth.toISOString();
            criteria.to = endOfMonth.toISOString();
        }
        const filteredInvoices = reportFilters.filterInvoices(invoices || [], criteria);
        const filteredExpenses = reportFilters.filterExpenses(expenses || [], criteria);
        const filteredCreditNotes = reportFilters.filterByDateRange(creditNotes || [], 'date', criteria.from, criteria.to);
        return { filteredInvoices, filteredExpenses, filteredCreditNotes };
    }, [invoices, expenses, creditNotes, reportMonth, reportYear, fromDate, toDate]);

    const fiscalInvoices = useMemo(() => filteredData.filteredInvoices.filter(inv => inv.ncf && inv.ncf.type && inv.ncf.type !== 'Sin Valor Fiscal'), [filteredData]);
    const fiscalExpenses = useMemo(() => filteredData.filteredExpenses.filter(exp => exp.ncf && exp.ncf.trim() !== ''), [filteredData]);
    const cancelledInvoices = useMemo(() => fiscalInvoices.filter(inv => inv.status === 'Cancelado'), [fiscalInvoices]);
    const fiscalCreditNotes = useMemo(() => (filteredData.filteredCreditNotes || []).filter(note => note.ncf && note.ncf.number), [filteredData]);

    const overview = useMemo(() => {
        const totalSales = fiscalInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
        const totalPurchases = fiscalExpenses.reduce((sum, exp) => sum + Number(exp.totalMontoFacturado || exp.montoFacturado || 0), 0);
        const itbisVentas = fiscalInvoices.reduce((sum, inv) => sum + Number(inv.itbis || 0), 0);
        const itbisCompras = fiscalExpenses.reduce((sum, exp) => sum + Number(exp.itbisFacturado || 0), 0);
        const totalCreditNotes = fiscalCreditNotes.reduce((sum, note) => sum + Number(note.total || note.totalAmount || 0), 0);
        return {
            totalSales,
            totalPurchases,
            itbisBalance: itbisVentas - itbisCompras,
            itbisVentas,
            itbisCompras,
            totalCreditNotes,
        };
    }, [fiscalInvoices, fiscalExpenses, fiscalCreditNotes]);



    const handleGenerateReport = (type) => {
        let data = [];
        let title = '';
        let headers = [];

        if (type === '606') {
            if (fiscalExpenses.length === 0) {
                toast.error('No se encontraron compras con NCF en el período seleccionado.');
                return;
            }
            data = generate606Data(fiscalExpenses, suppliers);
            title = 'Reporte 606 - Compras de Bienes y Servicios';
            headers = Object.keys(data[0] || {});
        }
        if (type === '607') {
            if (fiscalInvoices.length === 0) {
                toast.error('No se encontraron ventas con NCF en el período seleccionado.');
                return;
            }
            data = generate607Data(fiscalInvoices);
            title = 'Reporte 607 - Ventas de Bienes y Servicios';
            headers = Object.keys(data[0] || {});
        }
        if (type === '608') {
            if (cancelledInvoices.length === 0) {
                toast.error('No se encontraron comprobantes anulados en el período seleccionado.');
                return;
            }
            data = generate608Data(cancelledInvoices);
            title = 'Reporte 608 - Comprobantes Anulados';
            headers = Object.keys(data[0] || {});
        }

        if (!data.length) {
            toast.error(`No hay datos para el formato ${type}.`);
            return;
        }

        setGeneratedReport({ title, headers, data, type });
        toast.success(`Reporte ${type} listo para revisión.`);
        if (tableRef.current) tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleExport = async (format) => {
        if (!generatedReport || !generatedReport.data.length) {
            toast.error('Genera un reporte antes de exportar.');
            return;
        }
        const { type, data } = generatedReport;
        const period = fromDate && toDate
            ? `${fromDate.replaceAll('-', '')}_${toDate.replaceAll('-', '')}`
            : `${reportYear}${String(reportMonth + 1).padStart(2, '0')}`;
        const rnc = companyProfile?.rnc?.replace(/-/g, '') || 'SIN_RNC';
        const filename = `DGII_F${type}_${rnc}_${period}`;

        if (format === 'txt') {
            exportToTxt(data, `${filename}.txt`);
            toast.success('Archivo TXT generado.');
            return;
        }

        if (format === 'xlsx') {
            const loadingId = toast.loading('Generando Excel...');
            try {
                await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
                const worksheet = window.XLSX.utils.json_to_sheet(data);
                const workbook = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(workbook, worksheet, `F${type}`);
                window.XLSX.writeFile(workbook, `${filename}.xlsx`);
                toast.dismiss(loadingId);
                toast.success('Archivo Excel listo.');
            } catch (error) {
                toast.dismiss(loadingId);
                console.error('Error exportando Excel DGII', error);
                toast.error('No se pudo exportar a Excel.');
            }
        }
    };



    if (loading) {
        return (
            <PageSkeleton label="Cargando…" />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="page-title">Gestión Fiscal</h2>
                    <p className="page-subtitle">Genera reportes DGII y monitorea documentos fiscales electrónicos (e-CF).</p>
                </div>
                <div className="flex gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setActiveTab('reportes')}
                        className={`rounded-md px-3 py-1 text-sm font-medium ${activeTab === 'reportes' ? 'bg-surface shadow-sm dark:bg-slate-700' : 'text-ink-soft dark:text-slate-400'}`}
                    >Reportes</button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('ecf-dashboard')}
                        className={`rounded-md px-3 py-1 text-sm font-medium flex items-center gap-1 ${activeTab === 'ecf-dashboard' ? 'bg-surface shadow-sm dark:bg-slate-700' : 'text-ink-soft dark:text-slate-400'}`}
                    ><Zap size={14} />e-CF</button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('ecf-documentos')}
                        className={`rounded-md px-3 py-1 text-sm font-medium flex items-center gap-1 ${activeTab === 'ecf-documentos' ? 'bg-surface shadow-sm dark:bg-slate-700' : 'text-ink-soft dark:text-slate-400'}`}
                    ><FileText size={14} />Documentos</button>
                </div>
            </div>

            {activeTab === 'reportes' && (
                <>
                    <div className="kpi-grid">
                        <KpiCard label="Ventas con NCF" value={formatCurrency(overview.totalSales, currency)} icon={TrendingUp} tone="success" />
                        <KpiCard label="Compras reportables" value={formatCurrency(overview.totalPurchases, currency)} icon={ShoppingCart} tone="brand" />
                        <KpiCard label="ITBIS a pagar" value={formatCurrency(overview.itbisBalance, currency)} icon={Scale} tone={overview.itbisBalance >= 0 ? 'danger' : 'success'} />
                        <KpiCard label="Notas de crédito" value={formatCurrency(overview.totalCreditNotes, currency)} icon={FileText} tone="neutral" />
                    </div>

                    <Card>
                        <CardBody className="grid gap-4 md:grid-cols-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Mes</label>
                                <select aria-label="Mes" value={reportMonth} onChange={(e) => setReportMonth(Number(e.target.value))} className="input-base">
                                    {monthOptions.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Año</label>
                                <input aria-label="Año"
                                    type="number"
                                    value={reportYear}
                                    onChange={(e) => setReportYear(Number(e.target.value))}
                                    className="input-base"
                                    min="2000"
                                    max="2100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Desde</label>
                                <Input aria-label="Desde" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Hasta</label>
                                <Input aria-label="Hasta" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody className="flex flex-wrap items-center gap-2">
                            <Button variant="danger" onClick={() => handleGenerateReport('606')}>
                                <BookOpen className="mr-2" size={16} /> 606
                            </Button>
                            <Button onClick={() => handleGenerateReport('607')}>
                                <BookOpen className="mr-2" size={16} /> 607
                            </Button>
                            <Button onClick={() => handleGenerateReport('608')}>
                                <BookOpen className="mr-2" size={16} /> 608
                            </Button>
                            <span className="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />
                            <Button variant="secondary" onClick={() => handleExport('txt')}>
                                <Download className="mr-2" size={16} /> TXT
                            </Button>
                            <Button variant="secondary" onClick={() => handleExport('xlsx')}>
                                <Download className="mr-2" size={16} /> XLSX
                            </Button>
                        </CardBody>
                    </Card>

                    <div ref={tableRef}>
                        {generatedReport ? (
                            <ReportDataTable
                                title={generatedReport.title}
                                headers={generatedReport.headers}
                                data={generatedReport.data}
                            />
                        ) : (
                            <Card>
                                <CardBody className="text-center text-sm text-slate-500 dark:text-slate-400">
                                    Genera uno de los formatos para visualizar el detalle antes de exportar.
                                </CardBody>
                            </Card>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'ecf-dashboard' && <EcfDashboard />}
            {activeTab === 'ecf-documentos' && <EcfDocumentsTable />}
        </div>
    );
};

export default FiscalManagementViewSQL;
