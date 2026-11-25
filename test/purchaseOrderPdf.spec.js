// @vitest-environment node
import { qtyText, customerTaxId } from '../src/utils/docLines.js';
const { purchaseOrderDocData } = await import('../src/utils/pdfGenerator.js');

const order = {
  number: 'OC-0001', createdAt: '2026-11-20T15:00:00Z', expectedDate: '2026-12-05T00:00:00Z', notes: 'Entregar en almacén',
  subtotal: '1000.00', itbis: '180.00', total: '1180.00',
  supplier: { name: 'Suplidor SRL', rnc: null, identificationNumber: '001-1234567-8' },
  items: [
    { quantity: 3, packagingName: 'Caja x12', unitCost: '250.00', taxRate: '18', product: { name: 'Aceite', unit: 'unidad' } },
    { quantity: 2.5, packagingName: null, unitCost: '100.00', taxRate: '0', product: { name: 'Arroz', unit: 'libra' } },
  ],
};

describe('purchaseOrderDocData', () => {
  const d = purchaseOrderDocData(order);
  it('nombres con empaque y cantidad según unidad', () => {
    expect(d.items.map((i) => i.productName)).toEqual(['Aceite — Caja x12', 'Arroz']);
    expect(qtyText(d.items[0])).toBe('3');
    expect(qtyText(d.items[1])).toMatch(/^2[.,]5 lb/);
    expect(d.items[0].subtotal).toBe(750);
  });
  it('totales numéricos y notas con fecha esperada', () => {
    expect([d.subtotal, d.itbis, d.total]).toEqual([1000, 180, 1180]);
    expect(d.notes).toBe('Entregar en almacén\nFecha esperada: 05/12/2026');
    expect(purchaseOrderDocData({ ...order, notes: null, expectedDate: null }).notes).toBe('');
  });
  it('RNC cae a la cédula', () => {
    expect(d.customerRnc).toBe('001-1234567-8');
    expect(customerTaxId(order.supplier, d)).toBeTruthy();
  });
});
