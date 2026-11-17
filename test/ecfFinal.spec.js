// @vitest-environment node
// e-CF: comprador en E44/E45, base de línea guardada y reparto de cupones/notas al centavo
import { buildEcfFromInvoice, buildEcfFromNote, discountedAmounts } from '../backend/src/services/ecfXmlBuilder.js';
import { priceInvoiceLines } from '../backend/src/services/invoiceAmounts.js';
import { round2 } from '../backend/src/services/tax.js';

const company = { rnc: '131000000', name: 'Empresa Prueba' };
const sequence = { fechaVencimiento: new Date('2027-12-31T00:00:00Z') };
const base = { date: new Date('2026-11-01T15:00:00Z'), paymentMethod: 'Efectivo', customerRnc: '101010101', customerName: 'Cliente SRL' };
const itemsOf = (ECF) => [ECF.DetallesItems.Item].flat();

// Cada línea cuadra: MontoItem = cantidad × precio − descuento + recargo; y los totales suman las líneas
function checkLines(ECF) {
  for (const i of itemsOf(ECF)) {
    expect(Number(i.MontoItem)).toBeCloseTo(round2(Number(i.CantidadItem) * Number(i.PrecioUnitarioItem) - Number(i.DescuentoMonto || 0) + Number(i.RecargoMonto || 0)), 2);
  }
  const T = ECF.Encabezado.Totales;
  const sum = itemsOf(ECF).reduce((n, i) => n + Number(i.MontoItem), 0);
  expect(sum).toBeCloseTo(Number(T.MontoGravadoTotal || 0) + Number(T.MontoExento || 0), 2);
  return T;
}

// Lo que guarda la base de datos: discountPercent con 2 decimales (Decimal(5,2)) y la base por línea del servidor
const stored = (priced) => priced.items.map((i) => ({ ...i, discountPercent: Number(i.discountPercent.toFixed(2)) }));

describe('C1: Comprador en E44 y E45', () => {
  const items = [{ productName: 'A', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0 }];
  it.each(['E44', 'E45'])('%s lleva RNCComprador y RazonSocialComprador', (tipo) => {
    const { ECF } = buildEcfFromInvoice({ ...base, items, total: 100 }, company, tipo, `${tipo}0000000001`, sequence);
    expect(ECF.Encabezado.Comprador).toEqual({ RNCComprador: '101010101', RazonSocialComprador: 'Cliente SRL' });
  });
});

describe('I1: la base de la línea es la guardada', () => {
  it('Pedidos: descuento fijo de 50 sobre 3125.99 → MontoTotal = total de la factura', () => {
    const cart = [
      { productName: 'A', quantity: 3, unitPrice: 333.33, taxRate: 18 },
      { productName: 'B', quantity: 2, unitPrice: 563, taxRate: 16 },
      { productName: 'C', quantity: 1, unitPrice: 1000, taxRate: 0 },
    ];
    const pct = (50 / 3125.99) * 100;
    const priced = priceInvoiceLines(cart.map((i) => ({ ...i, discountPercent: pct })), { pricesExcludeTax: true, exempt: false });
    const { ECF } = buildEcfFromInvoice({ ...base, pricesIncludeTax: false, items: stored(priced), total: priced.total }, company, 'E31', 'E310000000001', sequence);
    const T = checkLines(ECF);
    expect(T.MontoTotal).toBe(priced.total.toFixed(2));
    expect(T.TotalITBIS).toBe(priced.taxAmount.toFixed(2));
  });

  it('POS: descuento combinado 12.5% + 7% (18.625%) → MontoTotal = total de la factura', () => {
    const cart = [
      { productName: 'A', quantity: 7, unitPrice: 13.33, taxRate: 18 },
      { productName: 'B', quantity: 3, unitPrice: 99.99, taxRate: 18 },
      { productName: 'C', quantity: 11, unitPrice: 4.45, taxRate: 16 },
    ];
    const priced = priceInvoiceLines(cart.map((i) => ({ ...i, discountPercent: 18.625 })), { pricesExcludeTax: true, exempt: false });
    const { ECF } = buildEcfFromInvoice({ ...base, pricesIncludeTax: false, items: stored(priced), total: priced.total }, company, 'E31', 'E310000000002', sequence);
    const T = checkLines(ECF);
    expect(T.MontoTotal).toBe(priced.total.toFixed(2));
  });
});

describe('I2: cupones y notas conservan el precio y declaran el descuento', () => {
  it('cupón de 37.77 sobre 12 × 13.33 (18%) + 9 × 7.77 (16%) → 232.10', () => {
    const items = [
      { productName: 'A', quantity: 12, unitPrice: 13.33, discountPercent: 0, taxRate: 18, subtotal: 159.96 },
      { productName: 'B', quantity: 9, unitPrice: 7.77, discountPercent: 0, taxRate: 16, subtotal: 69.93 },
    ];
    const invoice = { ...base, pricesIncludeTax: false, items, discountAmount: 37.77, total: 232.10 };
    const { ECF } = buildEcfFromInvoice(invoice, company, 'E31', 'E310000000003', sequence);
    const T = checkLines(ECF);
    expect(itemsOf(ECF).map((i) => i.PrecioUnitarioItem)).toEqual(['13.33', '7.77']);
    expect(itemsOf(ECF).every((i) => Number(i.DescuentoMonto) > 0)).toBe(true);
    expect(Math.abs(Number(T.MontoTotal) - 232.10)).toBeLessThanOrEqual(0.01);
    // Lo que guarda el PUT del cupón es lo mismo que declara el XML
    expect(discountedAmounts(invoice)).toEqual({ subtotal: round2(Number(T.MontoGravadoTotal) + Number(T.MontoExento || 0)), taxAmount: Number(T.TotalITBIS) });
  });

  const invoice = {
    ...base, ncfNumber: 'E310000000010', ncfType: 'E31', total: 1062, pricesIncludeTax: false,
    items: [
      { productName: 'Taza', quantity: 2, unitPrice: 300, discountPercent: 0, taxRate: 18, subtotal: 600 },
      { productName: 'Libro', quantity: 1, unitPrice: 354, discountPercent: 0, taxRate: 0, subtotal: 354 },
    ],
  };
  it.each([55.55, 100, 0.01])('nota de crédito de %s: MontoTotal a un centavo y nunca cero', (amount) => {
    const { ECF } = buildEcfFromNote({ amount, reason: 'Ajuste' }, invoice, company, 'E34', 'E340000000001', sequence);
    const T = checkLines(ECF);
    expect(Number(T.MontoTotal)).toBeGreaterThan(0);
    expect(Math.abs(Number(T.MontoTotal) - amount)).toBeLessThanOrEqual(0.01);
    expect(itemsOf(ECF).find((i) => i.NombreItem === 'Taza').PrecioUnitarioItem).toBe('300.00');
  });
});
