// El backend anula con 'Anulado' (VOID_STATUSES en routes/invoices.js); 'Cancelado' queda de datos antiguos
export const VOID_INVOICE_STATUSES = ['Anulado', 'Cancelado'];
export const isVoidInvoice = (invoice) => VOID_INVOICE_STATUSES.includes(invoice?.status);
