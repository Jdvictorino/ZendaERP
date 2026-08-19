/**
 * Plan de Cuentas Contable estándar para Zenda ERP.
 * Mapea transacciones del sistema a asientos de doble partida.
 */

// ── Catálogo de Cuentas ──
export const ACCOUNTS = {
  // Activos
  CASH:               { code: '1101', name: 'Efectivo y Equivalentes',  type: 'activo' },
  ACCOUNTS_RECEIVABLE:{ code: '1102', name: 'Cuentas por Cobrar',       type: 'activo' },
  INVENTORY:          { code: '1103', name: 'Inventario de Mercancías', type: 'activo' },
  BANK:               { code: '1104', name: 'Bancos',                   type: 'activo' },

  // Pasivos
  ACCOUNTS_PAYABLE:   { code: '2101', name: 'Cuentas por Pagar',        type: 'pasivo' },
  TAXES_PAYABLE:      { code: '2102', name: 'ITBIS por Pagar',          type: 'pasivo' },

  // Capital
  RETAINED_EARNINGS:  { code: '3101', name: 'Utilidades Retenidas',     type: 'capital' },

  // Ingresos
  SALES_REVENUE:      { code: '4101', name: 'Ingresos por Ventas',      type: 'ingreso' },
  SALES_DISCOUNTS:    { code: '4102', name: 'Descuentos sobre Ventas',  type: 'ingreso' },
  SALES_RETURNS:      { code: '4103', name: 'Devoluciones sobre Ventas',type: 'ingreso' },

  // Gastos Operativos
  GENERAL_EXPENSES:   { code: '5101', name: 'Gastos Generales',         type: 'gasto' },
  PAYROLL:            { code: '5102', name: 'Gastos de Nómina',         type: 'gasto' },
  RENT:               { code: '5103', name: 'Alquiler',                 type: 'gasto' },
  UTILITIES:          { code: '5104', name: 'Servicios Públicos',       type: 'gasto' },
  DEPRECIATION:       { code: '5105', name: 'Depreciación',             type: 'gasto' },

  // Costo de Ventas
  COGS:               { code: '6101', name: 'Costo de Mercancías Vendidas', type: 'costo' },
  PURCHASES:          { code: '6102', name: 'Compras de Mercancías',        type: 'costo' },
};

export const ACCOUNT_LIST = Object.values(ACCOUNTS);

export const ACCOUNT_TYPE_LABELS = {
  activo:  'Activos',
  pasivo:  'Pasivos',
  capital: 'Capital',
  ingreso: 'Ingresos',
  gasto:   'Gastos Operativos',
  costo:   'Costo de Ventas',
};

// ── Mapeo de transacciones a asientos de doble partida ──

/**
 * Convierte una factura/venta en asientos contables.
 * Débito: Cuentas por Cobrar (o Efectivo si pagado)
 * Crédito: Ingresos por Ventas + ITBIS por Pagar
 */
export function invoiceToJournalEntries(invoice) {
  const entries = [];
  const total = Number(invoice.total || 0);
  const tax = Number(invoice.taxAmount || 0);
  const subtotal = total - tax;
  const paid = Number(invoice.amountPaid || invoice.paidAmount || 0);
  const date = new Date(invoice.billedDate || invoice.date || invoice.createdAt);
  const ref = invoice.invoiceNumber || invoice.orderNumber || invoice.id;
  const desc = invoice.customerName ? `Venta a ${invoice.customerName}` : 'Venta registrada';

  // Débito: lo que nos deben / lo que cobraron
  if (paid >= total) {
    // Cobrado completo → Efectivo
    entries.push({ date, account: ACCOUNTS.CASH, debit: total, credit: 0, ref, desc, sourceType: 'invoice', sourceId: invoice.id });
  } else if (paid > 0) {
    // Cobro parcial
    entries.push({ date, account: ACCOUNTS.CASH, debit: paid, credit: 0, ref, desc, sourceType: 'invoice', sourceId: invoice.id });
    entries.push({ date, account: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: total - paid, credit: 0, ref, desc, sourceType: 'invoice', sourceId: invoice.id });
  } else {
    // Totalmente a crédito
    entries.push({ date, account: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: total, credit: 0, ref, desc, sourceType: 'invoice', sourceId: invoice.id });
  }

  // Crédito: ingreso por ventas
  entries.push({ date, account: ACCOUNTS.SALES_REVENUE, debit: 0, credit: subtotal, ref, desc, sourceType: 'invoice', sourceId: invoice.id });

  // Crédito: ITBIS por pagar
  if (tax > 0) {
    entries.push({ date, account: ACCOUNTS.TAXES_PAYABLE, debit: 0, credit: tax, ref, desc, sourceType: 'invoice', sourceId: invoice.id });
  }

  // Costo de ventas (si tenemos costPrice)
  const costTotal = (invoice.items || []).reduce((sum, item) => {
    const costPrice = Number(item.costPrice || 0);
    return sum + (costPrice * (item.quantity || 1));
  }, 0);

  if (costTotal > 0) {
    entries.push({ date, account: ACCOUNTS.COGS, debit: costTotal, credit: 0, ref, desc: `Costo de venta: ${desc}`, sourceType: 'invoice', sourceId: invoice.id });
    entries.push({ date, account: ACCOUNTS.INVENTORY, debit: 0, credit: costTotal, ref, desc: `Salida de inventario: ${desc}`, sourceType: 'invoice', sourceId: invoice.id });
  }

  return entries;
}

/**
 * Convierte un gasto en asientos contables.
 * Débito: Cuenta de gasto correspondiente
 * Crédito: Efectivo o Cuentas por Pagar
 */
export function expenseToJournalEntries(expense) {
  const entries = [];
  const amount = Number(expense.montoFacturado || expense.totalMontoFacturado || expense.total || 0);
  const tax = Number(expense.itbisFacturado || 0);
  const net = amount - tax;
  const date = new Date(expense.invoiceDate || expense.date || expense.createdAt);
  const ref = expense.ncf || expense.id;
  const desc = expense.supplierName || expense.description || 'Gasto registrado';

  // Mapear tipo de gasto a cuenta
  const expenseAccount = mapExpenseType(expense.expenseType);

  // Débito: gasto
  entries.push({ date, account: expenseAccount, debit: net, credit: 0, ref, desc, sourceType: 'expense', sourceId: expense.id });

  // Débito: ITBIS pagado (crédito fiscal)
  if (tax > 0) {
    entries.push({ date, account: ACCOUNTS.TAXES_PAYABLE, debit: tax, credit: 0, ref, desc: `ITBIS: ${desc}`, sourceType: 'expense', sourceId: expense.id });
  }

  // Crédito: efectivo o proveedor
  const isPaid = expense.paymentDate || expense.paymentType;
  if (isPaid) {
    entries.push({ date, account: ACCOUNTS.CASH, debit: 0, credit: amount, ref, desc, sourceType: 'expense', sourceId: expense.id });
  } else {
    entries.push({ date, account: ACCOUNTS.ACCOUNTS_PAYABLE, debit: 0, credit: amount, ref, desc, sourceType: 'expense', sourceId: expense.id });
  }

  return entries;
}

/**
 * Convierte una nota de crédito en asientos (reverso de venta).
 */
export function creditNoteToJournalEntries(note) {
  const amount = Math.abs(Number(note.amount || 0));
  const date = new Date(note.createdAt || note.date);
  const ref = note.creditNoteNumber || note.id;
  return [
    { date, account: ACCOUNTS.SALES_RETURNS, debit: amount, credit: 0, ref, desc: note.reason || 'Nota de crédito', sourceType: 'creditNote', sourceId: note.id },
    { date, account: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: 0, credit: amount, ref, desc: note.reason || 'Nota de crédito', sourceType: 'creditNote', sourceId: note.id },
  ];
}

/**
 * Convierte una nota de débito en asientos.
 */
export function debitNoteToJournalEntries(note) {
  const amount = Math.abs(Number(note.amount || 0));
  const date = new Date(note.createdAt || note.date);
  const ref = note.debitNoteNumber || note.id;
  return [
    { date, account: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: amount, credit: 0, ref, desc: note.reason || 'Nota de débito', sourceType: 'debitNote', sourceId: note.id },
    { date, account: ACCOUNTS.SALES_REVENUE, debit: 0, credit: amount, ref, desc: note.reason || 'Nota de débito', sourceType: 'debitNote', sourceId: note.id },
  ];
}

/**
 * Genera TODOS los asientos del diario a partir de los datos disponibles.
 */
export function generateAllJournalEntries({ invoices = [], expenses = [], creditNotes = [], debitNotes = [] }) {
  const entries = [];
  invoices.forEach(inv => entries.push(...invoiceToJournalEntries(inv)));
  expenses.forEach(exp => entries.push(...expenseToJournalEntries(exp)));
  creditNotes.forEach(cn => entries.push(...creditNoteToJournalEntries(cn)));
  debitNotes.forEach(dn => entries.push(...debitNoteToJournalEntries(dn)));
  return entries.sort((a, b) => (a.date || 0) - (b.date || 0));
}

/**
 * Filtra asientos por rango de fechas.
 */
export function filterByPeriod(entries, startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (end) { end.setHours(23, 59, 59, 999); }
  return entries.filter(e => {
    if (!e.date) return false;
    if (start && e.date < start) return false;
    if (end && e.date > end) return false;
    return true;
  });
}

/**
 * Agrupa asientos por cuenta para el Mayor General.
 */
export function groupByAccount(entries) {
  const map = {};
  entries.forEach(e => {
    const code = e.account.code;
    if (!map[code]) {
      map[code] = { account: e.account, entries: [], totalDebit: 0, totalCredit: 0 };
    }
    map[code].entries.push(e);
    map[code].totalDebit += e.debit;
    map[code].totalCredit += e.credit;
  });
  return Object.values(map).sort((a, b) => a.account.code.localeCompare(b.account.code));
}

/**
 * Calcula la Balanza de Comprobación.
 */
export function computeTrialBalance(entries) {
  const grouped = groupByAccount(entries);
  return grouped.map(g => ({
    account: g.account,
    totalDebit: g.totalDebit,
    totalCredit: g.totalCredit,
    balance: g.totalDebit - g.totalCredit,
  }));
}

// ── Helpers internos ──

function mapExpenseType(type) {
  if (!type) return ACCOUNTS.GENERAL_EXPENSES;
  const lower = (type || '').toLowerCase();
  if (lower.includes('nomina') || lower.includes('salario')) return ACCOUNTS.PAYROLL;
  if (lower.includes('alquiler') || lower.includes('renta')) return ACCOUNTS.RENT;
  if (lower.includes('servicio') || lower.includes('utilidad') || lower.includes('electric') || lower.includes('agua') || lower.includes('internet')) return ACCOUNTS.UTILITIES;
  if (lower.includes('compra') || lower.includes('mercancia') || lower.includes('inventario')) return ACCOUNTS.PURCHASES;
  return ACCOUNTS.GENERAL_EXPENSES;
}
