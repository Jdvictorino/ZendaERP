import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/client.js', () => ({ default: { invoices: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('react-hot-toast', () => {
    const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), promise: (p) => p });
    return { default: toast };
});
vi.mock('../src/utils/soundPlayer.js', () => ({ playSuccessSound: vi.fn(), playErrorSound: vi.fn() }));
vi.mock('../src/utils/notificationService.js', () => ({ default: { notify: vi.fn() } }));

import api from '../src/api/client.js';
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

    it('bajar una retención guardada a 0 la envía', async () => {
        setup({ ...invoice, itbisRetenido: 180, retentionDate: '2026-11-01' });
        fireEvent.change(screen.getByLabelText('ITBIS retenido por el cliente'), { target: { value: '0' } });
        fireEvent.click(screen.getByText('Confirmar Pago'));
        await waitFor(() => expect(api.invoices.update).toHaveBeenCalled());
        expect(api.invoices.update.mock.calls[0][1]).toMatchObject({ itbisRetenido: 0, retencionRenta: 0 });
    });
});
