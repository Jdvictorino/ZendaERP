// Utilidades de filtrado para reportes (ventas/compras)
export function parseDateInput(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  d.setHours(0,0,0,0);
  return d;
}

export function filterByDateRange(items = [], dateField = 'date', from = null, to = null) {
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate) fromDate.setHours(0,0,0,0);
  if (toDate) { toDate.setHours(23,59,59,999); }

  return items.filter(it => {
    const raw = it[dateField];
    let itemDate = null;
    if (!raw) return false;
    if (raw.seconds) itemDate = new Date(raw.seconds * 1000);
    else itemDate = new Date(raw);
    if (fromDate && itemDate < fromDate) return false;
    if (toDate && itemDate > toDate) return false;
    return true;
  });
}

export function filterInvoices(invoices = [], criteria = {}) {
  // criteria: { from, to, customerId, productId, minPrice, maxPrice, status }
  let result = invoices.slice();
  const { from, to, customerId, productId, minPrice, maxPrice, status } = criteria;
  if (from || to) result = filterByDateRange(result, 'date', from, to);
  if (customerId) result = result.filter(inv => inv.customerId === customerId);
  if (status) result = result.filter(inv => inv.status === status);
  if (productId) result = result.filter(inv => (inv.items || []).some(i => i.productId === productId));
  if (minPrice != null) result = result.filter(inv => (inv.total || 0) >= minPrice);
  if (maxPrice != null) result = result.filter(inv => (inv.total || 0) <= maxPrice);
  return result;
}

export function filterExpenses(expenses = [], criteria = {}) {
  let result = expenses.slice();
  const { from, to, minPrice, maxPrice, supplierId } = criteria;
  if (from || to) result = filterByDateRange(result, 'invoiceDate', from, to);
  if (supplierId) result = result.filter(exp => exp.supplierId === supplierId);
  if (minPrice != null) result = result.filter(exp => (exp.totalMontoFacturado || 0) >= minPrice);
  if (maxPrice != null) result = result.filter(exp => (exp.totalMontoFacturado || 0) <= maxPrice);
  return result;
}

export function computeCashClosure(invoices = [], expenses = [], criteria = {}) {
  // suma ventas (pagadas) y resta pagos/compras en el rango
  const filteredSales = filterInvoices(invoices, criteria);
  const filteredExpenses = filterExpenses(expenses, criteria);
  const salesTotal = filteredSales.reduce((s, inv) => s + ((inv.paidAmount != null && inv.paymentStatus === 'Pagado') ? inv.paidAmount : (inv.total || 0)), 0);
  const salesCount = filteredSales.length;
  const expensesTotal = filteredExpenses.reduce((s, e) => s + (e.totalMontoFacturado || 0), 0);
  const net = salesTotal - expensesTotal;
  return { salesTotal, expensesTotal, net, salesCount, sales: filteredSales, expenses: filteredExpenses };
}

export default { filterByDateRange, filterInvoices, filterExpenses, computeCashClosure };
