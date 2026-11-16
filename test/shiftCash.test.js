import { shiftPayments } from '../src/utils/shiftCash.js';

test('suma solo los cobros hechos en el turno y omite facturas anuladas', () => {
  const open = new Date('2026-11-15T12:00:00Z').getTime();
  const invoices = [
    { status: 'Pagado', payments: [
      { date: '2026-11-15T11:00:00Z', efectivo: 999 }, // antes de abrir
      { date: '2026-11-15T13:00:00Z', efectivo: '1500.50', tarjeta: 200 },
    ] },
    { status: 'Pagado Parcialmente', payments: [{ date: '2026-11-15T14:00:00Z', efectivo: 500, chequeTransferencia: 300 }] },
    { status: 'Anulado', payments: [{ date: '2026-11-15T13:30:00Z', efectivo: 700 }] },
    { status: 'Pendiente', payments: [] },
  ];
  expect(shiftPayments(invoices, open)).toEqual({ efectivo: 2000.5, tarjeta: 200, chequeTransferencia: 300, credito: 0 });
});

test('con dos cajas abiertas, cada turno cuenta solo sus cobros', () => {
  const open = new Date('2026-11-15T12:00:00Z').getTime();
  const invoices = [{ status: 'Pagado', payments: [
    { date: '2026-11-15T13:00:00Z', efectivo: 100, shiftId: 'A' },
    { date: '2026-11-15T13:05:00Z', efectivo: 250, shiftId: 'B' },
    { date: '2026-11-15T13:10:00Z', efectivo: 40 }, // cobro viejo sin turno: cuenta por fecha
  ] }];
  expect(shiftPayments(invoices, open, 'A').efectivo).toBe(140);
  expect(shiftPayments(invoices, open, 'B').efectivo).toBe(290);
});
