import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ reminders: vi.fn(), openWa: vi.fn() }));
vi.mock('../src/api/client.js', () => ({ default: {}, invoices: { reminders: mocks.reminders } }));
vi.mock('../src/utils/openWhatsapp.js', () => ({ openWhatsapp: mocks.openWa }));
vi.mock('../src/utils/pdfGenerator.js', () => ({ generatePDF: vi.fn(), generateAccountStatementPDF: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import ReceivableDetailModal from '../src/components/modals/ReceivableDetailModal.jsx';
import InvoiceDetailModal from '../src/components/modals/InvoiceDetailModal.jsx';
import { waNumber, waUrl, invoiceWhatsappText } from '../src/utils/collectionReminders.js';

const company = { name: 'Mi Empresa', currency: 'DOP' };
const invoice = { id: 'f1', invoiceNumber: 'F-1', total: 1000, customerId: 'c1', isBilled: true, items: [], date: '2026-11-01' };
const expected = (c) => waUrl(waNumber(c.phone), invoiceWhatsappText(invoice, c, company));

describe('Enviar por WhatsApp en Cuentas por Cobrar', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.reminders.mockResolvedValue([]); });
    const show = (customer) => render(<ReceivableDetailModal open onClose={() => {}} entry={{ invoice, customer, total: 1000, paid: 0, outstanding: 1000 }} companyProfile={company} />);
    it('abre el chat con el texto de la factura', () => {
        const c = { name: 'Ana', phone: '(809) 555-1234' };
        show(c);
        fireEvent.click(screen.getByRole('button', { name: /Enviar por WhatsApp/ }));
        expect(mocks.openWa).toHaveBeenCalledWith(expected(c));
    });
    it('sin teléfono válido: deshabilitado', () => {
        show({ name: 'Ana', phone: '555' });
        expect(screen.getByRole('button', { name: /Enviar por WhatsApp/ }).disabled).toBe(true);
    });
    it('el historial muestra el canal', async () => {
        mocks.reminders.mockResolvedValue([
            { id: 'a', stage: 7, channel: 'whatsapp', status: 'sent', sentById: 'u1', createdAt: '2026-11-27T13:00:00Z' },
            { id: 'b', stage: 0, channel: 'email', status: 'sent', sentById: null, createdAt: '2026-11-20T13:00:00Z' },
        ]);
        show({ name: 'Ana', phone: '8095551234' });
        expect(await screen.findByText(/WhatsApp ·/)).toBeTruthy();
        expect(screen.getByText(/Correo ·/)).toBeTruthy();
    });
});

describe('Enviar por WhatsApp en el detalle de factura', () => {
    beforeEach(() => vi.clearAllMocks());
    const show = (customer) => render(<InvoiceDetailModal invoice={invoice} companyProfile={company} customers={[{ id: 'c1', ...customer }]} creditNotes={[]} debitNotes={[]} onClose={() => {}} currentUserProfile={{}} />);
    it('abre el chat con el texto de la factura', () => {
        const c = { name: 'Ana', phone: '829-555-1234' };
        show(c);
        fireEvent.click(screen.getByRole('button', { name: /Enviar por WhatsApp/ }));
        expect(mocks.openWa).toHaveBeenCalledWith(expected(c));
    });
    it('sin teléfono válido: deshabilitado', () => {
        show({ name: 'Ana' });
        expect(screen.getByRole('button', { name: /Enviar por WhatsApp/ }).disabled).toBe(true);
    });
});
