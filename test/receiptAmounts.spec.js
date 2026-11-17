import { describe, it, expect } from 'vitest';
import { generateThermalReceiptHTML } from '../src/utils/escposGenerator.js';
import { docLine } from '../src/utils/docLines.js';

const profile = { name: 'Zenda', currency: 'DOP' };
const nueva = { pricesIncludeTax: false, items: [{ productName: 'A', quantity: 2, unitPrice: 100, taxRate: 18, subtotal: 200 }], subtotal: 200, taxAmount: 36, total: 236 };
const vieja = { pricesIncludeTax: true, items: [{ productName: 'A', quantity: 1, unitPrice: 118, taxRate: 18, subtotal: 100 }], subtotal: 100, taxAmount: 18, total: 118 };

describe('montos en documentos', () => {
  it('factura nueva: precio unitario sin ITBIS y total guardado', () => {
    const html = generateThermalReceiptHTML(nueva, 'invoice', profile, null, null);
    expect(html).toContain('2 x');
    expect(html).toMatch(/100.00/);
    expect(html).toMatch(/236.00/);
  });
  it('factura vieja se ve igual (base 100, total 118)', () => {
    const html = generateThermalReceiptHTML(vieja, 'invoice', profile, null, null);
    expect(html).toMatch(/100.00/);
    expect(html).not.toMatch(/118.00 *<\/td>/);
    expect(html).toMatch(/118.00/);
  });
  it('docLine: vieja da base y neto; sin factura usa precio*cantidad', () => {
    expect(docLine(vieja.items[0], true)).toEqual({ unit: 100, amount: 100 });
    expect(docLine({ price: 50, quantity: 3 }, undefined)).toEqual({ unit: 50, amount: 150 });
  });
  it('exención en el ticket', () => {
    const html = generateThermalReceiptHTML({ ...nueva, exemptionNumber: 'ABC-1' }, 'invoice', profile, null, null);
    expect(html).toContain('Exento de ITBIS — Carnet N.º ABC-1');
  });
});
