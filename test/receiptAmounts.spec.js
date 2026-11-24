import { describe, it, expect } from 'vitest';
import { generateThermalReceiptHTML } from '../src/utils/escposGenerator.js';
import { docLine, docTotals } from '../src/utils/docLines.js';

const profile = { name: 'Zenda', currency: 'DOP' };
const nueva = { pricesIncludeTax: false, items: [{ productName: 'A', quantity: 2, unitPrice: 100, taxRate: 18, subtotal: 200 }], subtotal: 200, taxAmount: 36, total: 236 };
const vieja = { pricesIncludeTax: true, items: [{ productName: 'A', quantity: 1, unitPrice: 118, taxRate: 18, subtotal: 100 }], subtotal: 100, taxAmount: 18, total: 118 };

describe('montos en documentos', () => {
  it('factura nueva: precio unitario sin ITBIS y total guardado', () => {
    const html = generateThermalReceiptHTML(nueva, 'invoice', profile, null, null);
    expect(html).toContain('<span class="qty">2</span> x 100.00');
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

describe('cupón: Subtotal − Descuento + ITBIS = Total', () => {
  // 1 × 100 al 18 % (118) con cupón del 10 % = 11.80. El PUT guarda subtotal/taxAmount como el e-CF: 90.00 / 16.20; total 106.20.
  const conCupon = { ...nueva, items: [{ productName: 'A', quantity: 1, unitPrice: 100, taxRate: 18, subtotal: 100 }], subtotal: 90, taxAmount: 16.2, discountAmount: 11.8, total: 106.2 };
  it('docTotals: suma de las líneas y la parte del cupón en la base; sin cupón null', () => {
    const t = docTotals(conCupon);
    expect(t).toEqual({ subtotal: 100, discount: 10, itbis: 16.2, total: 106.2 });
    expect(Math.round((t.subtotal - t.discount + t.itbis) * 100) / 100).toBe(t.total);
    expect(docTotals(nueva)).toBeNull();
  });
  it('sin líneas guardadas: base de antes del cupón sacada del total', () => {
    expect(docTotals({ ...conCupon, items: [] })).toEqual({ subtotal: 101.8, discount: 11.8, itbis: 16.2, total: 106.2 });
  });
  it('el ticket cuadra con las líneas: 100.00 − 10.00 + 16.20 = 106.20', () => {
    const html = generateThermalReceiptHTML(conCupon, 'invoice', profile, null, null);
    const num = (label) => Number(html.match(new RegExp(`<span>${label}</span><span>-?[^0-9]*([0-9.,]+)`))[1].replace(/,/g, ''));
    expect([num('Subtotal'), num('Descuento'), num('ITBIS'), num('TOTAL')]).toEqual([100, 10, 16.2, 106.2]);
    expect(Math.round((num('Subtotal') - num('Descuento') + num('ITBIS')) * 100) / 100).toBe(num('TOTAL'));
    expect(html).toMatch(/<span>Descuento<\/span><span>-10\.00/);
  });
});

describe('cantidades con unidad', () => {
  const doc = (it) => ({ ...nueva, items: [{ productName: 'Arroz', unitPrice: 100, taxRate: 18, subtotal: 225, ...it }] });
  it('2.25 de un producto en libras se imprime "2.25 lb"', () => {
    expect(generateThermalReceiptHTML(doc({ quantity: 2.25, packagingName: null, product: { unit: 'libra', allowFractions: true } }), 'invoice', profile, null, null)).toContain('2.25 lb');
  });
  it('con empaque la cantidad es solo el número (el empaque va en la descripción)', () => {
    const html = generateThermalReceiptHTML(doc({ quantity: 2, packagingName: 'Caja de 24' }), 'invoice', profile, null, null);
    expect(html).toContain('<span class="qty">2</span>');
    expect(html).not.toContain('2 Caja de 24');
  });
  it('producto por unidad se imprime "3 ud."', () => {
    expect(generateThermalReceiptHTML(doc({ quantity: 3, product: { unit: 'unidad' } }), 'invoice', profile, null, null)).toContain('3 ud.');
  });
  it('cada línea lleva el precio por unidad debajo', () => {
    expect(generateThermalReceiptHTML(doc({ quantity: 0.5, product: { unit: 'libra', allowFractions: true } }), 'invoice', profile, null, null)).toMatch(/<span class="qty">0\.5 lb<\/span> x 100\.00/);
  });
  it('línea vieja { quantity: 3 } sigue mostrando 3 solo', () => {
    const html = generateThermalReceiptHTML(doc({ quantity: 3 }), 'invoice', profile, null, null);
    expect(html).toContain('<span class="qty">3</span>');
    expect(html).not.toMatch(/3 und/);
  });
});
