// Versión migrada a PostgreSQL - AccountingView con pestañas del ciclo contable
import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';
import Button from '../components/ui/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import { Download, RefreshCcw, BookOpen, Layers, Scale, Sliders, ShoppingCart } from 'lucide-react';
import { useApiCrud } from '../hooks/useApi.js';
import { generateAllJournalEntries, filterByPeriod } from '../utils/chartOfAccounts.js';

// Tab components
import PeriodSelector from '../components/accounting/PeriodSelector.jsx';
import DiarioGeneral from '../components/accounting/DiarioGeneral.jsx';
import MayorGeneral from '../components/accounting/MayorGeneral.jsx';
import BalanzaComprobacion from '../components/accounting/BalanzaComprobacion.jsx';
import BalanceAjustado from '../components/accounting/BalanceAjustado.jsx';
import CostoDeVentas from '../components/accounting/CostoDeVentas.jsx';

const TABS = [
  { id: 'resumen',    label: 'Resumen',                icon: RefreshCcw },
  { id: 'diario',     label: 'Diario General',         icon: BookOpen },
  { id: 'mayor',      label: 'Mayor General',          icon: Layers },
  { id: 'balanza',    label: 'Balanza de Comprobación', icon: Scale },
  { id: 'ajustado',   label: 'Balance Ajustado',       icon: Sliders },
  { id: 'costo',      label: 'Costo de Ventas',        icon: ShoppingCart },
];

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const exportLedgerToCsv = (entries = [], currency = 'USD') => {
  if (!entries.length) return;
  const headers = ['Fecha', 'Tipo', 'Referencia', 'Descripción', 'Estado', `Monto (${currency})`];
  const rows = entries.map((entry) => ([
    entry.date ? entry.date.toISOString() : '',
    entry.kind, entry.reference || '', entry.description || '', entry.status || '',
    entry.amount.toFixed(2),
  ]));
  const csvContent = [headers, ...rows].map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libro-mayor-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const AccountingViewSQL = ({ companyProfile }) => {
  const [activeTab, setActiveTab] = useState('resumen');
  
  // Period filter state — default to current month
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);

  // Cargar datos desde la API
  const { data: invoicesRaw, loading: loadingInvoices } = useApiCrud('/invoices');
  const { data: expensesRaw, loading: loadingExpenses } = useApiCrud('/expenses');
  const { data: productsRaw, loading: loadingProducts } = useApiCrud('/products');
  
  const invoices = invoicesRaw || [];
  const expenses = expensesRaw || [];
  const products = productsRaw || [];
  const creditNotes = [];
  const debitNotes = [];
  
  const loading = loadingInvoices || loadingExpenses || loadingProducts;
  const currency = companyProfile?.currency || 'DOP';
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  // Generate journal entries and filter by period
  const allJournalEntries = useMemo(() =>
    generateAllJournalEntries({ invoices, expenses, creditNotes, debitNotes }),
    [invoices, expenses, creditNotes, debitNotes]
  );

  const filteredJournalEntries = useMemo(() =>
    filterByPeriod(allJournalEntries, periodStart, periodEnd),
    [allJournalEntries, periodStart, periodEnd]
  );

  // Filter invoices/expenses by period too
  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      const d = parseDate(inv.billedDate || inv.date);
      if (!d) return true;
      const start = periodStart ? new Date(periodStart) : null;
      const end = periodEnd ? new Date(periodEnd + 'T23:59:59') : null;
      return (!start || d >= start) && (!end || d <= end);
    }), [invoices, periodStart, periodEnd]);

  const filteredExpenses = useMemo(() =>
    expenses.filter(exp => {
      const d = parseDate(exp.invoiceDate || exp.date);
      if (!d) return true;
      const start = periodStart ? new Date(periodStart) : null;
      const end = periodEnd ? new Date(periodEnd + 'T23:59:59') : null;
      return (!start || d >= start) && (!end || d <= end);
    }), [expenses, periodStart, periodEnd]);

  // ────── Resumen tab data (original accounting view) ──────
  const totals = useMemo(() => {
    const incomeCollected = filteredInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || inv.amountPaid || 0), 0);
    const invoiceTotal = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const outstanding = Math.max(invoiceTotal - incomeCollected, 0);
    const expensesTotal = filteredExpenses.reduce((sum, exp) => sum + Number(exp.totalMontoFacturado || exp.montoFacturado || exp.total || 0), 0);
    const creditRefunds = creditNotes.reduce((sum, note) => sum + Number(note.amount || 0), 0);
    const debitAdjustments = debitNotes.reduce((sum, note) => sum + Number(note.amount || 0), 0);
    const netProfit = incomeCollected - expensesTotal - creditRefunds + debitAdjustments;
    return { incomeCollected, outstanding, expensesTotal, creditRefunds, debitAdjustments, netProfit };
  }, [filteredInvoices, filteredExpenses, creditNotes, debitNotes]);

  const ledgerEntries = useMemo(() => {
    const entries = [];
    filteredInvoices.forEach((invoice) => {
      const date = parseDate(invoice.billedDate || invoice.date);
      entries.push({
        id: `invoice-${invoice.id}`, kind: 'Ingreso',
        reference: invoice.invoiceNumber || invoice.orderNumber || invoice.id,
        description: invoice.customerName ? `Venta a ${invoice.customerName}` : 'Venta registrada',
        amount: Number(invoice.total || 0), status: invoice.paymentStatus || 'Pendiente', date,
      });
    });
    creditNotes.forEach((note) => {
      const date = parseDate(note.createdAt || note.date);
      entries.push({ id: `credit-${note.id}`, kind: 'Nota de Crédito', reference: note.creditNoteNumber || note.id,
        description: note.reason || 'Devolución aplicada', amount: -Math.abs(Number(note.amount || 0)), status: note.status || 'Aplicada', date });
    });
    debitNotes.forEach((note) => {
      const date = parseDate(note.createdAt || note.date);
      entries.push({ id: `debit-${note.id}`, kind: 'Nota de Débito', reference: note.debitNoteNumber || note.id,
        description: note.reason || 'Ajuste efectuado', amount: Math.abs(Number(note.amount || 0)), status: note.status || 'Aplicada', date });
    });
    filteredExpenses.forEach((expense) => {
      const date = parseDate(expense.invoiceDate || expense.date);
      entries.push({ id: `expense-${expense.id}`, kind: 'Gasto', reference: expense.invoiceNumber || expense.comprobante || expense.id,
        description: expense.descripcionGasto || expense.description || 'Gasto registrado',
        amount: -Math.abs(Number(expense.totalMontoFacturado || expense.montoFacturado || expense.total || 0)), status: expense.status || 'Registrado', date });
    });
    return entries
      .filter((entry) => !showOnlyPending || entry.status?.toLowerCase().includes('pend'))
      .sort((a, b) => { if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1; return b.date - a.date; });
  }, [filteredInvoices, filteredExpenses, creditNotes, debitNotes, showOnlyPending]);

  const paymentBreakdown = useMemo(() => {
    const summary = { efectivo: 0, tarjeta: 0, chequeTransferencia: 0, credito: 0 };
    filteredInvoices.forEach((invoice) => {
      (invoice.payments || []).forEach((payment) => {
        summary.efectivo += Number(payment.efectivo || 0);
        summary.tarjeta += Number(payment.tarjeta || 0);
        summary.chequeTransferencia += Number(payment.chequeTransferencia || 0);
        summary.credito += Number(payment.credito || 0);
      });
    });
    return summary;
  }, [filteredInvoices]);

  const pendingInvoices = useMemo(() => filteredInvoices.filter((inv) => (inv.paymentStatus || '').toLowerCase().includes('pend')), [filteredInvoices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Contabilidad</h2>
          <p className="text-gray-500">Ciclo contable, reportes y conciliación por período.</p>
        </div>
        <PeriodSelector startDate={periodStart} endDate={periodEnd}
          onChange={(s, e) => { setPeriodStart(s); setPeriodEnd(e); }} />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-1 min-w-max">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-2 whitespace-nowrap px-4 py-3 border-b-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <tab.icon size={16} className={active ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowOnlyPending((prev) => !prev)}>
              {showOnlyPending ? 'Ver todo el libro mayor' : 'Mostrar pendientes'}
            </Button>
            <Button size="sm" onClick={() => exportLedgerToCsv(ledgerEntries, currency)} disabled={!ledgerEntries.length}>
              <Download size={16} className="mr-2" /> Exportar Libro Mayor
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card><CardBody className="space-y-1"><p className="text-gray-500 text-sm">Ingresos Cobrados</p><p className="text-2xl font-bold text-green-600">{formatCurrency(totals.incomeCollected, currency)}</p></CardBody></Card>
            <Card><CardBody className="space-y-1"><p className="text-gray-500 text-sm">Por Cobrar</p><p className="text-2xl font-bold text-orange-600">{formatCurrency(totals.outstanding, currency)}</p></CardBody></Card>
            <Card><CardBody className="space-y-1"><p className="text-gray-500 text-sm">Gastos Registrados</p><p className="text-2xl font-bold text-red-600">{formatCurrency(totals.expensesTotal, currency)}</p></CardBody></Card>
            <Card><CardBody className="space-y-1"><p className="text-gray-500 text-sm">Resultado Neto</p><p className={`text-2xl font-bold ${totals.netProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatCurrency(totals.netProfit, currency)}</p></CardBody></Card>
          </div>

          <Card>
            <CardHeader title="Conciliación de Medios de Pago" icon={<RefreshCcw size={18} />}
              subtitle="Compara los montos cobrados contra lo depositado en cada canal." />
            <CardBody>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 border"><p className="text-xs uppercase text-gray-500">Efectivo</p><p className="text-xl font-semibold text-gray-800">{formatCurrency(paymentBreakdown.efectivo, currency)}</p></div>
                <div className="bg-gray-50 rounded-lg p-4 border"><p className="text-xs uppercase text-gray-500">Tarjetas</p><p className="text-xl font-semibold text-gray-800">{formatCurrency(paymentBreakdown.tarjeta, currency)}</p></div>
                <div className="bg-gray-50 rounded-lg p-4 border"><p className="text-xs uppercase text-gray-500">Transferencias / Cheques</p><p className="text-xl font-semibold text-gray-800">{formatCurrency(paymentBreakdown.chequeTransferencia, currency)}</p></div>
                <div className="bg-gray-50 rounded-lg p-4 border"><p className="text-xs uppercase text-gray-500">Ventas a Crédito</p><p className="text-xl font-semibold text-gray-800">{formatCurrency(paymentBreakdown.credito, currency)}</p></div>
              </div>
              {pendingInvoices.length > 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-700 font-semibold">Facturas con pago pendiente:</p>
                  <ul className="list-disc list-inside text-sm text-amber-700 mt-2 space-y-1">
                    {pendingInvoices.slice(0, 5).map((inv) => (
                      <li key={inv.id}>{inv.invoiceNumber || inv.orderNumber || inv.id} · {formatCurrency((inv.total || 0) - (inv.paidAmount || inv.amountPaid || 0), currency)}</li>
                    ))}
                    {pendingInvoices.length > 5 && <li>+{pendingInvoices.length - 5} facturas adicionales.</li>}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Libro Mayor" />
            <CardBody className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[960px]">
                <thead className="bg-gray-50 uppercase text-xs tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Referencia</th>
                    <th className="p-3">Descripción</th><th className="p-3">Estado</th><th className="p-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.length === 0 && (
                    <tr><td className="p-4 text-center text-gray-500" colSpan={6}>No hay movimientos contables en este período.</td></tr>
                  )}
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-transparent hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap">{entry.date ? entry.date.toLocaleDateString() : 'Sin fecha'}</td>
                      <td className="p-3 font-semibold text-gray-700">{entry.kind}</td>
                      <td className="p-3 font-mono text-xs text-gray-600">{entry.reference}</td>
                      <td className="p-3 text-gray-700">{entry.description}</td>
                      <td className="p-3 text-gray-600">{entry.status}</td>
                      <td className={`p-3 text-right font-semibold ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(entry.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'diario' && <DiarioGeneral entries={filteredJournalEntries} currency={currency} />}
      {activeTab === 'mayor' && <MayorGeneral entries={filteredJournalEntries} currency={currency} />}
      {activeTab === 'balanza' && <BalanzaComprobacion entries={filteredJournalEntries} currency={currency} />}
      {activeTab === 'ajustado' && <BalanceAjustado entries={filteredJournalEntries} currency={currency} />}
      {activeTab === 'costo' && <CostoDeVentas invoices={filteredInvoices} expenses={filteredExpenses} products={products} currency={currency} />}
    </div>
  );
};

export default AccountingViewSQL;
