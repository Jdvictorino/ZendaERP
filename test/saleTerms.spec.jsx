import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_PAYMENT_TERMS, downPayment } from '../src/utils/paymentTerms.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  bill: vi.fn(),
  update: vi.fn().mockResolvedValue({}),
  print: vi.fn().mockResolvedValue(),
}));

vi.mock('../src/api/client.js', () => ({
  default: {
    invoices: { create: mocks.create, bill: mocks.bill, update: mocks.update },
    ecf: { getConfig: vi.fn().mockResolvedValue({}), getSequences: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), promise: (p) => p });
  return { default: toast };
});
vi.mock('../src/utils/offlineQueue.js', () => ({ enqueueInvoicePaymentUpdate: vi.fn() }));
vi.mock('../src/utils/soundPlayer.js', () => ({ playSuccessSound: vi.fn(), playErrorSound: vi.fn() }));
vi.mock('../src/utils/notificationService.js', () => ({ default: { notify: vi.fn() } }));
vi.mock('../src/utils/pdfGenerator.js', () => ({ generatePDF: (...a) => mocks.print(...a) }));
vi.mock('../src/utils/escposGenerator.js', () => ({ generateThermalReceiptHTML: vi.fn() }));
vi.mock('../src/utils/ecfPrint.js', () => ({ withEcfPrintData: async (o) => o }));
vi.mock('../src/utils/printer.js', () => ({ printEscPosReceipt: vi.fn() }));
vi.mock('../src/hooks/useApproval.js', () => ({ default: () => ({ withApproval: (_a, run) => run(), approvalModal: null }) }));
vi.mock('../src/context/ScannerContext.jsx', () => ({
  useScanner: () => ({ isConnected: false, registerScanHandler: () => {}, unregisterScanHandler: () => {}, initSession: () => {}, disconnectDevice: () => {} }),
}));
vi.mock('../src/hooks/useApi.js', () => {
  const data = {
    '/products': [{ id: 'p1', name: 'Arroz', salePrice: 1000, stock: 50, barcode: '777', isTaxable: false, taxRate: 0, status: 'active' }],
    '/customers': [
      { id: 'c1', name: 'Cliente Mitad', paymentTermId: '50-ahora-50-30', status: 'active' },
      { id: 'c2', name: 'Cliente Treinta', paymentTermId: '30-dias', status: 'active' },
      { id: 'c4', name: 'Cliente Contado', paymentTermId: null, status: 'active' },
      { id: 'c3', name: 'Cliente Viejo', paymentTermId: '90-dias-borrado', status: 'active' },
    ],
    '/shifts': [{ id: 's1', status: 'open', movements: [] }],
    '/invoices': [],
  };
  return { useApiCrud: (path) => ({ data: data[path], refetch: () => {} }) };
});
// Ventanas que no intervienen en estas pruebas
vi.mock('../src/components/modals/ScannerLinkModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/modals/CustomerModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/modals/OpenShiftModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/modals/CloseShiftModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/modals/CierreCajaModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/modals/CierreCajaReportModal.jsx', () => ({ default: () => null }));

import POSBillingOrdersView from '../src/views/POSBillingOrdersView.jsx';
import PaymentModal from '../src/components/modals/PaymentModal.jsx';
import { proposedTermId, toggledTermId, termPayload, paysToday } from '../src/utils/saleTerms.js';

const profile = { orderMode: 'distributor', currency: 'DOP' };
const term = (id) => DEFAULT_PAYMENT_TERMS.find((t) => t.id === id);
const snapshotOf = (id, total) => {
  const t = term(id);
  const sched = t.installments.map((c) => ({ dueDate: c.days === 0 ? '2026-11-26' : '2026-12-26', amount: (total * c.percent) / 100 }));
  return { id, name: t.name, saleDate: '2026-11-26', discount: null, schedule: sched };
};

const mountPos = async () => {
  const utils = render(<POSBillingOrdersView companyProfile={profile} currentUserProfile={{}} setView={() => {}} />);
  const scan = screen.getAllByLabelText('Escanear código')[0];
  fireEvent.change(scan, { target: { value: '777' } });
  fireEvent.keyDown(scan, { key: 'Enter' });
  await screen.findAllByLabelText('Precio unitario');
  return utils;
};
const pickCustomer = async (name) => {
  const input = document.querySelector('#pos-d-cliente');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.mouseDown((await screen.findAllByText(name, { selector: 'p' }))[0]);
};
const condicion = () => document.querySelector('#pos-d-condicion');

describe('condición de pago propuesta', () => {
  it('usa el plazo del cliente y contado si no hay cliente o su plazo ya no está activo', () => {
    const inactivo = DEFAULT_PAYMENT_TERMS.map((t) => (t.id === '30-dias' ? { ...t, active: false } : t));
    expect(proposedTermId({ paymentTermId: '45-dias' }, DEFAULT_PAYMENT_TERMS)).toBe('45-dias');
    expect(proposedTermId(null, DEFAULT_PAYMENT_TERMS)).toBe('contado');
    expect(proposedTermId({ paymentTermId: null }, DEFAULT_PAYMENT_TERMS)).toBe('contado');
    expect(proposedTermId({ paymentTermId: 'no-existe' }, DEFAULT_PAYMENT_TERMS)).toBe('contado');
    expect(proposedTermId({ paymentTermId: '30-dias' }, inactivo)).toBe('contado');
  });

  it('F9 alterna contado y el plazo del cliente (o 30 días)', () => {
    const t = DEFAULT_PAYMENT_TERMS;
    expect(toggledTermId('contado', { paymentTermId: '60-dias' }, t)).toBe('60-dias');
    expect(toggledTermId('60-dias', { paymentTermId: '60-dias' }, t)).toBe('contado');
    expect(toggledTermId('contado', null, t)).toBe('30-dias');
    expect(toggledTermId('contado', { paymentTermId: null }, t)).toBe('30-dias');
  });
});

describe('plazo en la venta (Distribuidor y craft)', () => {
  const T = DEFAULT_PAYMENT_TERMS;
  it('payload: crédito lleva paymentTermId, contado no', () => {
    expect(termPayload(T, '30-dias')).toEqual({ paymentTermId: '30-dias' });
    expect(termPayload(T, 'contado')).toEqual({});
  });
  it('paysToday coincide con downPayment', () => {
    const hoy = '2026-11-26';
    expect(paysToday(term('50-ahora-50-30'), hoy)).toBe(true);
    expect(paysToday(term('30-dias'), hoy)).toBe(false);
    expect(paysToday(term('30-dias-fin-mes'), hoy)).toBe(false);
    const finMes = { ...term('50-ahora-50-30'), installments: [{ percent: 50, days: 0, fromMonthEnd: true }, { percent: 50, days: 30, fromMonthEnd: false }] };
    expect(paysToday(finMes, '2026-11-30')).toBe(true);
    expect(paysToday(finMes, hoy)).toBe(false);
  });
  it('mínimo de craft: downPayment del plazo de la factura', () => {
    expect(downPayment(snapshotOf('50-ahora-50-30', 1000))).toBe(500);
    expect(downPayment(snapshotOf('30-dias', 1000))).toBe(0);
  });
});

describe('PaymentModal con cobro mínimo', () => {
  const inv = { id: 'i1', invoiceNumber: 'F-1', total: 1000, taxAmount: 0, paidAmount: 0, paymentMethod: 'Crédito', payments: [] };
  const setup = (props) => {
    const onSuccess = vi.fn();
    render(<PaymentModal invoice={inv} customers={[]} companyProfile={{ currency: 'DOP' }} onClose={() => {}} onSuccess={onSuccess} {...props} />);
    return onSuccess;
  };
  beforeEach(() => vi.clearAllMocks());

  it('muestra el mínimo y no deja confirmar menos', async () => {
    setup({ minAmount: 500 });
    expect(screen.getByText(/Cobro mínimo hoy: .*500\.00/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '400' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('deja confirmar el mínimo', async () => {
    setup({ minAmount: 500 });
    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ paidAmount: 500, paymentStatus: 'Pagado Parcialmente' });
  });

  it('no deja llegar al mínimo escribiendo 500 en Venta a Crédito', async () => {
    setup({ minAmount: 500 });
    fireEvent.change(document.querySelector('input[name="credito"]'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('sin minAmount funciona como siempre', async () => {
    setup();
    expect(screen.queryByText(/Cobro mínimo/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  });
});

describe('Distribuidor: condición de pago en la venta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bill.mockResolvedValue({});
  });

  it('propone el plazo del cliente, cae a contado y F9 alterna', async () => {
    await mountPos();
    expect(condicion().value).toBe('contado');
    await pickCustomer('Cliente Mitad');
    await waitFor(() => expect(condicion().value).toBe('50-ahora-50-30'));
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(condicion().value).toBe('contado'));
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(condicion().value).toBe('50-ahora-50-30'));
    await pickCustomer('Cliente Viejo'); // su plazo ya no existe
    await waitFor(() => expect(condicion().value).toBe('contado'));
  });

  it('50 % ahora sobre 1000: crea con paymentTermId y abre el cobro con mínimo 500', async () => {
    mocks.create.mockResolvedValue({ id: 'i1', orderNumber: 'F-1', total: 1000, taxAmount: 0, paymentMethod: 'Crédito', paymentTerm: snapshotOf('50-ahora-50-30', 1000), payments: [] });
    await mountPos();
    await pickCustomer('Cliente Mitad');
    await waitFor(() => expect(condicion().value).toBe('50-ahora-50-30'));
    fireEvent.click(screen.getAllByText('Registrar venta a crédito')[0]);
    await screen.findByText(/Cobro mínimo hoy: .*500\.00/);
    const payload = mocks.create.mock.calls[0][0];
    expect(payload.paymentTermId).toBe('50-ahora-50-30');
    expect(payload).not.toHaveProperty('paymentTermDays');
    expect(downPayment(snapshotOf('50-ahora-50-30', 1000))).toBe(500);
    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '400' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Confirmar Pago'));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  });

  it('30 días: no se abre el cobro, se imprime y el payload lleva paymentTermId 30-dias', async () => {
    mocks.create.mockResolvedValue({ id: 'i2', orderNumber: 'F-2', total: 1000, taxAmount: 0, paymentMethod: 'Crédito', paymentTerm: snapshotOf('30-dias', 1000), payments: [] });
    await mountPos();
    await pickCustomer('Cliente Treinta');
    await waitFor(() => expect(condicion().value).toBe('30-dias'));
    fireEvent.click(screen.getAllByText('Registrar venta a crédito')[0]);
    await waitFor(() => expect(mocks.print).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ paymentTermId: '30-dias', paymentMethod: 'Crédito' });
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('paymentTermDays');
    expect(screen.queryByText(/Cobro mínimo hoy/)).toBeNull();
  });

  it('contado: se abre el cobro sin mínimo, como hoy', async () => {
    mocks.create.mockResolvedValue({ id: 'i3', orderNumber: 'F-3', total: 1000, taxAmount: 0, paymentMethod: 'Efectivo', paymentTerm: null, payments: [] });
    await mountPos();
    await pickCustomer('Cliente Contado');
    fireEvent.click(screen.getAllByText('Cobrar y facturar')[0]);
    await screen.findByText('Confirmar Pago');
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('paymentTermId');
    expect(screen.queryByText(/Cobro mínimo hoy/)).toBeNull();
  });
});
