// @vitest-environment node
// El XML declara los mismos montos que la factura (redondeo por línea)
import { buildEcfFromInvoice, buildEcfFromNote } from '../backend/src/services/ecfXmlBuilder.js';
import { invoiceTotals } from '../backend/src/services/tax.js';

const company = { rnc: '131000000', name: 'Empresa Prueba' };
const sequence = { fechaVencimiento: new Date('2027-12-31T00:00:00Z') };
const base = { date: new Date('2026-11-01T15:00:00Z'), paymentMethod: 'Efectivo', customerRnc: '101010101' };

describe('montos e-CF', () => {
  it('factura nueva: redondea por línea y coincide con invoiceTotals', () => {
    const items = [
      { productName: 'A', quantity: 3, unitPrice: 33.33, discountPercent: 0, taxRate: 18 },
      { productName: 'B', quantity: 1, unitPrice: 50, discountPercent: 0, taxRate: 16 },
      { productName: 'C', quantity: 1, unitPrice: 25, discountPercent: 0, taxRate: 0 },
    ];
    const { ECF } = buildEcfFromInvoice({ ...base, pricesIncludeTax: false, items, total: 0 }, company, 'E31', 'E310000000001', sequence);
    const T = ECF.Encabezado.Totales;
    expect(T.MontoGravadoTotal).toBe('149.99');
    expect(T.TotalITBIS).toBe('26.00');
    expect(T.MontoExento).toBe('25.00');
    expect(T.MontoTotal).toBe('200.99');
    expect(Number(T.MontoTotal)).toBe(invoiceTotals(items).total);
  });

  it('factura vieja (ITBIS incluido): declara la base guardada', () => {
    const items = [{ productName: 'A', quantity: 1, unitPrice: 118, subtotal: 100, discountPercent: 0, taxRate: 18 }];
    const { ECF } = buildEcfFromInvoice({ ...base, pricesIncludeTax: true, items, total: 118 }, company, 'E31', 'E310000000002', sequence);
    const T = ECF.Encabezado.Totales;
    expect([ECF.DetallesItems.Item].flat()[0].PrecioUnitarioItem).toBe('100.00');
    expect([ECF.DetallesItems.Item].flat()[0].MontoItem).toBe('100.00');
    expect(T.MontoGravadoTotal).toBe('100.00');
    expect(T.TotalITBIS).toBe('18.00');
    expect(T.MontoTotal).toBe('118.00');
  });

  const build = (inv) => buildEcfFromInvoice({ ...base, ...inv }, company, 'E31', 'E310000000009', sequence).ECF;
  const check = (ECF) => {
    const T = ECF.Encabezado.Totales;
    const sumItems = [ECF.DetallesItems.Item].flat().reduce((n, i) => n + Number(i.MontoItem), 0);
    expect(Number(T.MontoTotal)).toBeCloseTo(Number(T.MontoGravadoTotal) + Number(T.MontoExento || 0) + Number(T.TotalITBIS), 2);
    expect(sumItems).toBeCloseTo(Number(T.MontoGravadoTotal) + Number(T.MontoExento || 0), 2);
    expect(ECF.Encabezado.IdDoc.TablaFormasPago.FormaDePago.MontoPago).toBe(T.MontoTotal);
    return T;
  };

  it('legacy 2 x 1 con base 1.69: ítems suman la base y el total es lo cobrado', () => {
    const T = check(build({ pricesIncludeTax: true, total: 2, items: [{ productName: 'A', quantity: 2, unitPrice: 1, subtotal: 1.69, discountPercent: 0, taxRate: 18 }] }));
    expect(T.MontoGravadoTotal).toBe('1.69');
    expect(T.MontoTotal).toBe('2.00');
  });

  it('legacy con descuento: MontoItem es la base guardada y el total lo cobrado', () => {
    const ECF = build({ pricesIncludeTax: true, total: 254.97, items: [{ productName: 'A', quantity: 3, unitPrice: 99.99, subtotal: 216.08, discountPercent: 15, taxRate: 18 }] });
    const T = check(ECF);
    expect([ECF.DetallesItems.Item].flat()[0].MontoItem).toBe('216.08');
    expect(T.MontoTotal).toBe('254.97');
  });

  it('cupón: las líneas se escalan al total de la venta', () => {
    // 108 / 1.18 = 91.5254: con precio a 2 decimales, 91.53 + 16.48 = 108.01 y 91.52 + 16.47 = 107.99; 108.00 no existe (inevitable, 1 centavo)
    const T = check(build({ pricesIncludeTax: false, discountAmount: 10, total: 108, items: [{ productName: 'A', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 18 }] }));
    expect(T.MontoTotal).toBe('108.01');
    expect(T.TotalITBIS).toBe('16.48');
  });
});
