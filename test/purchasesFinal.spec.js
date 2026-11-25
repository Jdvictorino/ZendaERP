import { linkedExpenseChanged } from '../backend/src/routes/expenses.js';
import { undoInvoice, planReceipt } from '../backend/src/services/purchases.js';

const saved = { rncCedula: '101010101', supplierName: 'Dist', supplierId: 's1', montoBienes: '1000.00', montoServicios: '0', itbisFacturado: '180.00', itbisRetenido: '0', montoRetencionIsr: '0', propina: '0' };

describe('gasto enlazado a una orden', () => {
  it('el mismo payload del formulario pasa', () => {
    expect(linkedExpenseChanged(saved, { ...saved, montoBienes: 1000, montoServicios: 0, itbisFacturado: 180, itbisRetenido: 0, montoRetencionIsr: 0, propina: 0, supplierId: 's1' })).toBe(false);
  });
  it('un monto distinto, otro proveedor o otro RNC se bloquean', () => {
    expect(linkedExpenseChanged(saved, { montoBienes: 1001 })).toBe(true);
    expect(linkedExpenseChanged(saved, { supplierId: 's2' })).toBe(true);
    expect(linkedExpenseChanged(saved, { supplierId: null })).toBe(true);
    expect(linkedExpenseChanged(saved, { rncCedula: '999' })).toBe(true);
  });
  it('paidAmount y payments no cuentan como cambio de montos', () => {
    expect(linkedExpenseChanged(saved, { paidAmount: 500, payments: [{ amount: 500 }] })).toBe(false);
  });
  it('NCF, forma de pago, fecha de pago y descripción se pueden cambiar', () => {
    expect(linkedExpenseChanged(saved, { ncf: 'B0100000001', paymentType: '02', paymentDate: '2026-11-30', description: 'x' })).toBe(false);
  });
});

describe('deshacer factura de compra', () => {
  it('resta lo facturado sin bajar de 0', () => {
    const items = [{ id: 'a', invoicedQuantity: 5 }, { id: 'b', invoicedQuantity: 1 }];
    expect(undoInvoice(items, [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 3 }])).toEqual([{ itemId: 'a', newInvoiced: 3 }, { itemId: 'b', newInvoiced: 0 }]);
  });
});

it('planReceipt: una bonificación (costo 0) deja costPrice en 0 para que la ruta no lo aplique', () => {
  const r = planReceipt([{ id: 'i', productId: 'p', quantity: 2, receivedQuantity: 0, unitCost: 0, packagingId: null, packagingFactor: 1 }], [{ itemId: 'i', quantity: 1 }], { p: { name: 'P', allowFractions: false } });
  expect(r.changes[0].costPrice).toBe(0);
});
