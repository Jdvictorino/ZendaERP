// @vitest-environment node
// e-CF: cantidad con decimales (máx. 2) y UnidadMedida de la Tabla IV
import { buildEcfFromInvoice, buildEcfFromNote } from '../backend/src/services/ecfXmlBuilder.js';

const company = { rnc: '131000000', name: 'Empresa Prueba' };
const sequence = { fechaVencimiento: new Date('2027-12-31T00:00:00Z') };
const base = { date: new Date('2026-11-01T15:00:00Z'), paymentMethod: 'Efectivo', customerRnc: '101010101', pricesIncludeTax: false, total: 0 };
const line = (o) => ({ productName: 'P', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0, ...o });
const items = (inv) => [buildEcfFromInvoice({ ...base, ...inv }, company, 'E31', 'E310000000001', sequence).ECF.DetallesItems.Item].flat();

describe('e-CF cantidades y unidad de medida', () => {
  it('2.25 lb: CantidadItem 2.25 y UnidadMedida 23', () => {
    const [i] = items({ items: [line({ quantity: 2.25, product: { unit: 'libra' } })] });
    expect(i.CantidadItem).toBe('2.25');
    expect(i.UnidadMedida).toBe('23');
    expect(i.MontoItem).toBe('225.00');
  });

  it('2 Caja de 24: UnidadMedida del empaque (6)', () => {
    const [i] = items({ items: [line({ quantity: 2, packaging: { unitCode: 6 }, product: { unit: 'unidad' } })] });
    expect(i.CantidadItem).toBe('2');
    expect(i.UnidadMedida).toBe('6');
  });

  it('unidad entera, sin producto o con producto: igual que antes (43)', () => {
    const r = items({ items: [line({ quantity: 3 }), line({ quantity: 1, product: { unit: 'unidad' } })] });
    expect(r.map((i) => [i.CantidadItem, i.UnidadMedida])).toEqual([['3', '43'], ['1', '43']]);
  });

  it('con cupón la unidad sobrevive al reparto', () => {
    const [i] = items({ discountAmount: 10, total: 215, items: [line({ quantity: 2.25, product: { unit: 'libra' } })] });
    expect(i.CantidadItem).toBe('2.25');
    expect(i.UnidadMedida).toBe('23');
  });

  it('nota de crédito por 0.5 de una línea de 2.25 lb: CantidadItem 0.5 y monto proporcional', () => {
    const src = line({ quantity: 2.25, product: { unit: 'libra' } });
    const other = line({ productName: 'Q', quantity: 1, unitPrice: 100 });
    const invoice = { ...base, items: [src, other] };
    const note = { amount: '50', reason: 'Devolución', createdAt: base.date };
    const { ECF } = buildEcfFromNote(note, invoice, company, 'E34', 'E340000000001', sequence, { lines: [{ ...src, quantity: 0.5 }], full: false });
    const [i] = [ECF.DetallesItems.Item].flat();
    expect(i.CantidadItem).toBe('0.5');
    expect(i.UnidadMedida).toBe('23');
    expect(i.MontoItem).toBe('50.00');
    expect(ECF.Encabezado.Totales.MontoTotal).toBe('50.00');
  });

  it('nota con dos líneas: el peso de cada una usa su cantidad decimal', () => {
    const a = line({ productName: 'A', quantity: 0.5, unitPrice: 100, product: { unit: 'libra' } });
    const b = line({ productName: 'B', quantity: 1.5, unitPrice: 100 });
    const { ECF } = buildEcfFromNote({ amount: '200', reason: 'x', createdAt: base.date }, { ...base, items: [a, b] }, company, 'E34', 'E340000000002', sequence, { lines: [a, b] });
    const r = [ECF.DetallesItems.Item].flat();
    expect(r.map((i) => i.MontoItem)).toEqual(['50.00', '150.00']);
    expect(r.map((i) => i.UnidadMedida)).toEqual(['23', '43']);
  });
});
