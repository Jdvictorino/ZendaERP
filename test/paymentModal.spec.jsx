import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/client.js', () => ({ default: { invoices: { update: vi.fn().mockResolvedValue({}), earlyPayment: vi.fn().mockResolvedValue({}) } } }));
vi.mock('react-hot-toast', () => {
    const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), promise: (p, m) => p.catch((e) => { toast.error(m.error(e)); throw e; }) });
    return { default: toast };
});
vi.mock('../src/utils/offlineQueue.js', () => ({ enqueueInvoicePaymentUpdate: vi.fn() }));
vi.mock('../src/utils/soundPlayer.js', () => ({ playSuccessSound: vi.fn(), playErrorSound: vi.fn() }));
vi.mock('../src/utils/notificationService.js', () => ({ default: { notify: vi.fn() } }));

import { enqueueInvoicePaymentUpdate } from '../src/utils/offlineQueue.js';
import api from '../src/api/client.js';
import toast from 'react-hot-toast';
import { todayRD } from '../src/utils/tax.js';
import PaymentModal from '../src/components/modals/PaymentModal.jsx';

const invoice = { id: 'inv1', invoiceNumber: 'F-1', total: 1180, taxAmount: 180, paidAmount: 0, paymentMethod: 'Efectivo', payments: [] };
const setup = (inv = invoice, allow = true) => {
    const onSuccess = vi.fn();
    render(<PaymentModal allowWithholdings={allow} invoice={inv} customers={[]} companyProfile={{}} onClose={() => {}} onSuccess={onSuccess} />);
    return onSuccess;
};

describe('PaymentModal con retenciones', () => {
    beforeEach(() => vi.clearAllMocks());

    it('con ITBIS retenido 180 sugiere 1000 y envía la retención', async () => {
        setup();
        expect(screen.getByLabelText('Efectivo').value).toBe('1180');
        fireEvent.change(screen.getByLabelText('ITBIS retenido por el cliente'), { target: { value: '180' } });
        expect(screen.getByLabelText('Efectivo').value).toBe('1000');
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        const payload = api.invoices.update.mock.calls[0][1];
        expect(payload).toMatchObject({ itbisRetenido: 180, retencionRenta: 0, paidAmount: 1000, paymentStatus: 'Pagado' });
        expect(payload.retentionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('sin retenciones no envía campos de retención', async () => {
        setup();
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        const payload = api.invoices.update.mock.calls[0][1];
        expect(payload).not.toHaveProperty('itbisRetenido');
        expect(payload).not.toHaveProperty('retencionRenta');
        expect(payload).not.toHaveProperty('retentionDate');
    });

    it('no deja retener más ITBIS del que tiene la factura', async () => {
        setup();
        fireEvent.change(screen.getByLabelText('ITBIS retenido por el cliente'), { target: { value: '200' } });
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await new Promise((r) => setTimeout(r, 20));
        expect(api.invoices.update).not.toHaveBeenCalled();
    });

    it('sin allowWithholdings no muestra los campos', () => {
        setup(invoice, false);
        expect(screen.queryByLabelText('ITBIS retenido por el cliente')).toBeNull();
    });

    it('un rechazo 403 del servidor no se encola ni se aplica', async () => {
        api.invoices.update.mockRejectedValueOnce(Object.assign(new Error('Solo un gerente'), { status: 403 }));
        const onSuccess = setup();
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(enqueueInvoicePaymentUpdate).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('sin respuesta del servidor sí se encola', async () => {
        api.invoices.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const onSuccess = setup();
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(enqueueInvoicePaymentUpdate).toHaveBeenCalled());
        expect(onSuccess).toHaveBeenCalled();
    });

    it('bajar una retención guardada a 0 la envía', async () => {
        setup({ ...invoice, itbisRetenido: 180, retentionDate: '2026-11-01' });
        fireEvent.change(screen.getByLabelText('ITBIS retenido por el cliente'), { target: { value: '0' } });
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        expect(api.invoices.update.mock.calls[0][1]).toMatchObject({ itbisRetenido: 0, retencionRenta: 0 });
    });
});

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const termInvoice = (saleDate) => ({
    ...invoice,
    paymentTerm: { id: '30-dias-2-10', name: '30 días, 2 % a 10 días', saleDate, discount: { percent: 2, days: 10 }, schedule: [{ dueDate: addDays(saleDate, 30), amount: 1180 }] },
});
const label = /Descuento por pronto pago 2 %/;

describe('PaymentModal con descuento por pronto pago', () => {
    beforeEach(() => vi.clearAllMocks());

    it('dentro de la ventana muestra la casilla marcada, baja lo sugerido y cobra con earlyPayment', async () => {
        const sale = todayRD();
        const onSuccess = setup(termInvoice(sale));
        expect(screen.getByLabelText(label).checked).toBe(true);
        const [y, m, d] = addDays(sale, 10).split('-');
        expect(screen.getByText(label).textContent).toContain(`hasta ${d}/${m}/${y}`);
        expect(screen.getByLabelText('Efectivo').value).toBe('1156.4');
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.earlyPayment).toHaveBeenCalled());
        expect(api.invoices.update).not.toHaveBeenCalled();
        expect(api.invoices.earlyPayment.mock.calls[0][0]).toBe('inv1');
        expect(api.invoices.earlyPayment.mock.calls[0][1]).toMatchObject({ paidAmount: 1156.4, paymentStatus: 'Pagado' });
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('desmarcada cobra normal con update por 1180', async () => {
        setup(termInvoice(todayRD()));
        fireEvent.click(screen.getByLabelText(label));
        expect(screen.getByLabelText('Efectivo').value).toBe('1180');
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        expect(api.invoices.earlyPayment).not.toHaveBeenCalled();
        expect(api.invoices.update.mock.calls[0][1]).toMatchObject({ paidAmount: 1180, paymentStatus: 'Pagado' });
    });

    it('fuera de la ventana o sin allowWithholdings no hay casilla', () => {
        setup(termInvoice(addDays(todayRD(), -11)));
        expect(screen.queryByLabelText(label)).toBeNull();
        expect(screen.getByLabelText('Efectivo').value).toBe('1180');
    });

    it('sin allowWithholdings no hay casilla', () => {
        setup(termInvoice(todayRD()), false);
        expect(screen.queryByLabelText(label)).toBeNull();
    });

    it('combinado con una retención de ITBIS suma ambos y los envía', async () => {
        setup(termInvoice(todayRD()));
        fireEvent.change(screen.getByLabelText('ITBIS retenido por el cliente'), { target: { value: '180' } });
        expect(screen.getByLabelText('Efectivo').value).toBe('976.4');
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.earlyPayment).toHaveBeenCalled());
        expect(api.invoices.earlyPayment.mock.calls[0][1]).toMatchObject({ itbisRetenido: 180, paidAmount: 976.4, paymentStatus: 'Pagado' });
    });

    it('un error del servidor se muestra y no se encola, tampoco sin conexión', async () => {
        api.invoices.earlyPayment.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const onSuccess = setup(termInvoice(todayRD()));
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.earlyPayment).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(enqueueInvoicePaymentUpdate).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        const msg = 'Sin conexión: el cobro con descuento necesita el servidor. No se registró; inténtalo de nuevo o desmarca el descuento.';
        expect(toast.error.mock.calls.filter((c) => c[0] === msg)).toHaveLength(1);
        expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('un error HTTP se muestra tal cual y el 409 cierra el modal', async () => {
        api.invoices.earlyPayment.mockRejectedValueOnce(Object.assign(new Error('La factura cambió; vuelve a cargarla.'), { status: 409 }));
        const onClose = vi.fn();
        render(<PaymentModal allowWithholdings invoice={termInvoice(todayRD())} customers={[]} companyProfile={{}} onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith('La factura cambió; vuelve a cargarla.');
    });

    it('con la casilla marcada y un monto menor al saldo avisa sin llamar al servidor', async () => {
        setup(termInvoice(todayRD()));
        fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '1000' } });
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await new Promise((r) => setTimeout(r, 20));
        expect(toast.error).toHaveBeenCalledWith('Con el descuento por pronto pago hay que saldar la factura.');
        expect(api.invoices.earlyPayment).not.toHaveBeenCalled();
    });

    it('el porcentaje se muestra con el formato es-DO de la app (igual que los montos)', () => {
        const inv = termInvoice(todayRD());
        inv.paymentTerm.discount.percent = 2.5;
        setup(inv);
        expect(screen.getByText(`Descuento por pronto pago ${(2.5).toLocaleString('es-DO')} %`, { exact: false })).toBeTruthy();
    });
});
