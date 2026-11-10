import { generate607Data, generate608Data } from '../src/utils/dgiiReportGenerator.js';

const inv = (status, number) => ({ status, ncf: { number, customerRnc: '101000000' }, total: 1180, itbis: 180, createdAt: '2026-10-01T12:00:00Z', payments: [] });

describe('Reportes DGII: facturas anuladas', () => {
  const invoices = [inv('Pendiente', 'B0200000001'), inv('Anulado', 'B0200000002'), inv('Cancelado', 'B0200000003')];

  it('el 607 no incluye anuladas ni canceladas', () => {
    expect(generate607Data(invoices)).toHaveLength(1);
  });

  it('el 608 incluye las anuladas por el backend ("Anulado") y las antiguas ("Cancelado")', () => {
    expect(generate608Data(invoices).map((r) => r.NCF)).toEqual(['B0200000002', 'B0200000003']);
  });
});
