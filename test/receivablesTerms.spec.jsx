import React from 'react';
import { render, screen, renderHook, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { todayRD } from '../src/utils/tax.js';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), crud: vi.fn() }));
vi.mock('../src/api/client.js', () => ({
    default: {},
    invoices: { list: mocks.list },
    alerts: { create: mocks.create },
}));
vi.mock('../src/hooks/useApi.js', () => ({ useApiCrud: (path) => ({ data: mocks.crud(path), loading: false, refetch: vi.fn() }) }));
vi.mock('../src/utils/pdfGenerator.js', () => ({ generatePDF: vi.fn(), generateAccountStatementPDF: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import useOverdueInvoiceChecker from '../src/hooks/useOverdueInvoiceChecker.js';
import AccountsReceivableViewSQL from '../src/views/AccountsReceivableViewSQL.jsx';
import ReceivableDetailModal from '../src/components/modals/ReceivableDetailModal.jsx';

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ddmmyyyy = (s) => s.split('-').reverse().join('/');
const today = todayRD();
// Plazo 50/50: la primera cuota vence hace 5 días, la segunda dentro de 25.
const split = (extra = {}) => ({
    id: 'f1', invoiceNumber: 'F-1', customerName: 'Cliente A', total: 1000, taxAmount: 0, amountPaid: 0, paidAmount: 0, status: 'Pendiente',
    date: addDays(today, -35) + 'T12:00:00.000Z', dueDate: addDays(today, 25) + 'T12:00:00.000Z',
    paymentTerm: { id: 'x', name: '50/50', saleDate: addDays(today, -35), discount: null, schedule: [
        { dueDate: addDays(today, -5), amount: 500 }, { dueDate: addDays(today, 25), amount: 500 }] },
    ...extra,
});

describe('aviso de facturas vencidas con cuotas', () => {
    beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.create.mockResolvedValue({}); });
    const run = async (invoices) => {
        mocks.list.mockResolvedValue({ data: invoices });
        renderHook(() => useOverdueInvoiceChecker({ id: 'u1', role: 'admin' }));
        await waitFor(() => expect(mocks.list).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
    };

    it('avisa con la primera cuota vencida aunque la factura no venza', async () => {
        await run([split()]);
        expect(mocks.create).toHaveBeenCalledTimes(1);
        const a = mocks.create.mock.calls[0][0];
        expect(a.data).toMatchObject({ invoiceId: 'f1', daysOverdue: 5, outstanding: 1000 });
    });
    it('con la primera cuota cobrada ya no avisa', async () => {
        await run([split({ amountPaid: 500, paidAmount: 500 })]);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('anulada o pagada: sin aviso', async () => {
        await run([split({ status: 'Anulado' }), split({ id: 'f2', status: 'Pagado' })]);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('factura vieja sin plazo sigue avisando por su dueDate', async () => {
        await run([{ id: 'v1', total: 100, amountPaid: 0, status: 'Pendiente', dueDate: addDays(today, -3) + 'T12:00:00.000Z' }]);
        expect(mocks.create).toHaveBeenCalledTimes(1);
    });
});

describe('Cuentas por Cobrar con cuotas', () => {
    beforeEach(() => vi.clearAllMocks());
    it('la columna de vencimiento muestra la cuota vencida más vieja y sus días', () => {
        mocks.crud.mockImplementation((p) => (p === '/invoices' ? [split()] : []));
        render(<AccountsReceivableViewSQL companyProfile={{}} />);
        const row = screen.getByText('F-1').closest('tr');
        const [y, m, d] = addDays(today, -5).split('-').map(Number);
        expect(within(row).getByText(new Date(y, m - 1, d).toLocaleDateString())).toBeTruthy();
        expect(within(row).getByText('5 días')).toBeTruthy();
    });
    it('el detalle lista el calendario de cuotas con sus fechas exactas', () => {
        const invoice = split();
        render(<ReceivableDetailModal open onClose={() => {}} entry={{ invoice, customer: {}, total: 1000, paid: 0, outstanding: 1000, dueDate: null, overdueDays: 5 }} companyProfile={{}} />);
        expect(screen.getByText('Calendario de cuotas')).toBeTruthy();
        expect(screen.getByText(ddmmyyyy(addDays(today, -5)))).toBeTruthy();
        expect(screen.getByText(ddmmyyyy(addDays(today, 25)))).toBeTruthy();
    });
});
