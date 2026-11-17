import { invoiceTotals, lineAmounts } from './tax.js';

// pricesExcludeTax: el precio es sin ITBIS (app nueva). Si no, el precio ya trae ITBIS (apps 1.1.x) y se extrae.
export function priceInvoiceLines(items, { pricesExcludeTax, exempt }) {
  if (pricesExcludeTax) {
    const lines = items.map((item) => {
      const taxRate = exempt ? 0 : item.taxRate;
      return { ...item, taxRate, subtotal: lineAmounts({ ...item, taxRate }).base };
    });
    return { items: lines, ...invoiceTotals(lines) };
  }
  let subtotal = 0;
  let taxAmount = 0;
  const lines = items.map((item) => {
    const itemTotalWithTax = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
    const divisor = item.taxRate > 0 ? (1 + item.taxRate / 100) : 1;
    const itemBase = itemTotalWithTax / divisor;
    subtotal += itemBase;
    taxAmount += itemTotalWithTax - itemBase;
    return { ...item, subtotal: itemBase };
  });
  return { items: lines, subtotal, taxAmount, total: subtotal + taxAmount };
}
