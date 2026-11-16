import { generate607Data, generate608Data, filterByVoucherDate } from '../src/utils/dgiiReportGenerator.js';

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

describe('Fecha del comprobante en el 607/608', () => {
  // El e-CF lleva la fecha de la venta (FechaEmision = date); un NCF en papel, la de facturación (billedDate)
  const base = { customerRnc: '101000000', total: 1180, taxAmount: 180, date: '2026-10-31T15:00:00Z', billedDate: '2026-11-02T15:00:00Z', payments: [] };
  it('e-CF: la fecha de la venta', () => {
    const e = { ...base, ncfNumber: 'E310000000001', status: 'Pagado' };
    expect(generate607Data([e])[0]['Fecha Comprobante']).toBe('20261031');
    expect(generate608Data([{ ...e, status: 'Anulado' }])[0]['Fecha Comprobante']).toBe('20261031');
  });
  it('NCF en papel: la fecha de facturación', () => {
    expect(generate607Data([{ ...base, ncfNumber: 'B0100000001', status: 'Pagado' }])[0]['Fecha Comprobante']).toBe('20261102');
  });
});

describe('Período del 607/608: se elige por la fecha del comprobante', () => {
  // límites como los arman las vistas: mes en hora local
  const oct = [new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59)];
  const nov = [new Date(2026, 10, 1), new Date(2026, 10, 30, 23, 59, 59)];
  const sale = { date: '2026-10-31T15:00:00Z', billedDate: '2026-11-02T15:00:00Z' };
  const paper = { ...sale, ncfNumber: 'B0100000001' };
  const ecf = { ...sale, ncfNumber: 'E310000000001' };
  it('NCF en papel vendido el 31-oct y facturado el 2-nov: va en noviembre', () => {
    expect(filterByVoucherDate([paper], ...nov)).toHaveLength(1);
    expect(filterByVoucherDate([paper], ...oct)).toHaveLength(0);
  });
  it('e-CF con las mismas fechas: va en octubre (fecha de la venta)', () => {
    expect(filterByVoucherDate([ecf], ...oct)).toHaveLength(1);
    expect(filterByVoucherDate([ecf], ...nov)).toHaveLength(0);
  });
});
