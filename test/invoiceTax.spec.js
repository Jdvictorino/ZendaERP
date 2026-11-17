import { describe, it, expect } from 'vitest';
import { priceInvoiceLines } from '../backend/src/services/invoiceAmounts.js';

const line = (o = {}) => ({ quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 18, ...o });

describe('priceInvoiceLines', () => {
  it('precio sin ITBIS: suma el ITBIS', () => {
    const r = priceInvoiceLines([line()], { pricesExcludeTax: true, exempt: false });
    expect(r.total).toBe(118);
    expect(r.taxAmount).toBe(18);
    expect(r.items[0].subtotal).toBe(100);
  });
  it('cliente exento: tasa 0', () => {
    const r = priceInvoiceLines([line()], { pricesExcludeTax: true, exempt: true });
    expect(r.total).toBe(100);
    expect(r.taxAmount).toBe(0);
    expect(r.items[0].taxRate).toBe(0);
  });
  it('exento con descuento', () => {
    const r = priceInvoiceLines([line({ discountPercent: 10 })], { pricesExcludeTax: true, exempt: true });
    expect(r.total).toBe(90);
    expect(r.taxAmount).toBe(0);
  });
  it('apps viejas: ITBIS incluido en el precio', () => {
    const r = priceInvoiceLines([line()], { pricesExcludeTax: false });
    expect(r.total).toBeCloseTo(100, 2);
    expect(r.taxAmount).toBeCloseTo(15.25, 2);
    expect(r.items[0].subtotal).toBeCloseTo(84.75, 2);
  });
  it('apps viejas ignoran exempt', () => {
    const r = priceInvoiceLines([line()], { pricesExcludeTax: false, exempt: true });
    expect(r.taxAmount).toBeCloseTo(15.25, 2);
  });
});
