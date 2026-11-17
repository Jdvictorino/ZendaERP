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

  it('nota de crédito total sobre factura vieja: MontoTotal = monto de la nota', () => {
    const items = [
      { productName: 'A', quantity: 2, unitPrice: 118, subtotal: 200, discountPercent: 0, taxRate: 18 },
      { productName: 'B', quantity: 1, unitPrice: 50, subtotal: 50, discountPercent: 0, taxRate: 0 },
    ];
    const inv = { ...base, pricesIncludeTax: true, ncfNumber: 'E310000000003', items, total: 286 };
    const { ECF } = buildEcfFromNote({ amount: 286, reason: 'Devolución' }, inv, company, 'E34', 'E340000000001', sequence, { full: true });
    expect(ECF.Encabezado.Totales.MontoTotal).toBe('286.00');
  });
});
