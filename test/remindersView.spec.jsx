import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ due: vi.fn(), send: vi.fn(), reminders: vi.fn(), crud: vi.fn() }));
vi.mock('../src/api/client.js', () => ({
    default: {},
    invoices: { reminders: mocks.reminders },
    collectionReminders: { due: mocks.due, send: mocks.send },
}));
vi.mock('../src/hooks/useApi.js', () => ({ useApiCrud: (path) => ({ data: mocks.crud(path), loading: false, refetch: vi.fn() }) }));
vi.mock('../src/utils/pdfGenerator.js', () => ({ generatePDF: vi.fn(), generateAccountStatementPDF: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import toast from 'react-hot-toast';
import AccountsReceivableViewSQL from '../src/views/AccountsReceivableViewSQL.jsx';
import ReceivableDetailModal from '../src/components/modals/ReceivableDetailModal.jsx';

const row = (o = {}) => ({
    invoiceId: 'f1', customerId: 'c1', customerName: 'Cliente A', email: 'a@x.com', emailStatus: 'ok', invoiceNumber: 'F-1',
    dueDate: '2026-11-20', stage: 7, amount: 500, overdueTotal: 500, balance: 1000, lastSentAt: null, failed: null, ...o,
});
const open = async (rows, smtpReady = true) => {
    mocks.due.mockResolvedValue({ rows, smtpReady });
    mocks.crud.mockReturnValue([]);
    render(<AccountsReceivableViewSQL companyProfile={{}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Por recordar hoy' }));
    await screen.findByText(rows[0].customerName);
};

describe('Por recordar hoy', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue([{ invoiceId: 'f1', dueDate: '2026-11-20', stage: 7, status: 'sent' }]); });

    it('Enviar en una fila manda ese ítem, resume en un toast y recarga', async () => {
        await open([row(), row({ invoiceId: 'f2', customerName: 'Cliente B', invoiceNumber: 'F-2' })]);
        fireEvent.click(within(screen.getByText('Cliente A').closest('tr')).getByRole('button', { name: 'Enviar' }));
        await waitFor(() => expect(mocks.send).toHaveBeenCalledWith([{ invoiceId: 'f1', dueDate: '2026-11-20', stage: 7 }]));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enviados 1, fallaron 0'));
        expect(mocks.due).toHaveBeenCalledTimes(2);
    });
    it('Enviar seleccionados manda las marcadas', async () => {
        await open([row(), row({ invoiceId: 'f2', customerName: 'Cliente B', invoiceNumber: 'F-2' })]);
        fireEvent.click(within(screen.getByText('Cliente B').closest('tr')).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Enviar seleccionados/ }));
        await waitFor(() => expect(mocks.send).toHaveBeenCalledWith([{ invoiceId: 'f2', dueDate: '2026-11-20', stage: 7 }]));
    });
    it('envía en lotes de 20 y suma los resultados', async () => {
        const rows = Array.from({ length: 45 }, (_, i) => row({ invoiceId: `f${i}`, customerName: i ? `C${i}` : 'Cliente A', invoiceNumber: `F-${i}` }));
        mocks.send.mockImplementation(async (items) => items.map((x) => ({ ...x, status: 'sent' })));
        await open(rows);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todas' }));
        fireEvent.click(screen.getByRole('button', { name: /Enviar seleccionados/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enviados 45, fallaron 0'));
        expect(mocks.send.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
    });
    it('sin correo: sin casilla ni botón', async () => {
        await open([row({ email: '', emailStatus: 'missing' })]);
        const tr = screen.getByText('Cliente A').closest('tr');
        expect(within(tr).getByText('Sin correo')).toBeTruthy();
        expect(within(tr).queryByRole('checkbox')).toBeNull();
        expect(within(tr).queryByRole('button', { name: 'Enviar' })).toBeNull();
    });
    it('sin SMTP: aviso y botones deshabilitados', async () => {
        await open([row()], false);
        expect(screen.getByText('Configura el correo de la empresa en Configuración para enviar recordatorios')).toBeTruthy();
        expect(within(screen.getByText('Cliente A').closest('tr')).getByRole('button', { name: 'Enviar' }).disabled).toBe(true);
    });
    it('fallida: muestra el error y Reintentar', async () => {
        await open([row({ failed: { error: 'Buzón lleno' } })]);
        const tr = screen.getByText('Cliente A').closest('tr');
        expect(within(tr).getByText(/Buzón lleno/)).toBeTruthy();
        expect(within(tr).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    });
});

describe('historial en el detalle', () => {
    it('lista los recordatorios, automático si sentById es null', async () => {
        mocks.reminders.mockResolvedValue([
            { id: 'r1', stage: 7, channel: 'email', status: 'sent', error: null, to: 'a@x.com', sentById: null, createdAt: '2026-11-27T13:00:00.000Z' },
            { id: 'r2', stage: 0, channel: 'email', status: 'failed', error: 'Buzón lleno', to: 'a@x.com', sentById: 'u1', createdAt: '2026-11-20T13:00:00.000Z' },
        ]);
        render(<ReceivableDetailModal open onClose={() => {}} entry={{ invoice: { id: 'f1' }, customer: {}, total: 1, paid: 0, outstanding: 1 }} companyProfile={{}} />);
        expect(await screen.findByText('Recordatorios enviados')).toBeTruthy();
        expect(await screen.findByText(/automático/)).toBeTruthy();
        expect(screen.getByText(/Buzón lleno/)).toBeTruthy();
        expect(mocks.reminders).toHaveBeenCalledWith('f1');
    });
});
