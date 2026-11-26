import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CustomerModal from '../src/components/modals/CustomerModal';
import CustomersViewSQL from '../src/views/CustomersViewSQL';
import { customerTermName } from '../src/utils/saleTerms.js';
import { paymentTermsOf } from '../src/utils/paymentTerms.js';

vi.mock('../src/hooks/useApi.js', () => ({
    useApiCrud: (path) => ({
        data: path === '/customers' ? [{ id: 1, name: 'Ana SA', customerCode: 'C1', status: 'active', accountType: 'credito', paymentTermId: '30-dias' }] : [],
        loading: false, error: null, create: vi.fn(), update: vi.fn(), remove: vi.fn(), refetch: vi.fn(),
    }),
}));

const base = { name: 'Cliente', taxpayerType: 'consumidor_final' };
const save = async (customer, companyProfile) => {
    const onSave = vi.fn();
    render(<CustomerModal customer={customer} onClose={() => {}} onSave={onSave} companyProfile={companyProfile} />);
    fireEvent.click(screen.getByText('Guardar Cliente'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0];
};

describe('Condición de pago del cliente', () => {
    it('guardar con 30-dias manda paymentTermId', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        expect(screen.queryByText('Tipo de Cuenta')).toBeNull();
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'X' } });
        fireEvent.change(screen.getByLabelText('Condición de pago'), { target: { value: '30-dias' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toMatchObject({ paymentTermId: '30-dias', accountType: 'credito', creditDays: 30 });
    });

    it('contado: límite deshabilitado y en 0, paymentTermId null', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{ id: 1, ...base, paymentTermId: '30-dias', creditLimit: 500 }} onClose={() => {}} onSave={onSave} />);
        expect(screen.getByLabelText('Límite de Crédito').disabled).toBe(false);
        fireEvent.change(screen.getByLabelText('Condición de pago'), { target: { value: 'contado' } });
        const limit = screen.getByLabelText('Límite de Crédito');
        expect(limit.disabled).toBe(true);
        expect(limit.value).toBe('0');
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toMatchObject({ paymentTermId: null, accountType: 'contado', creditLimit: 0, creditDays: 0 });
    });

    it('cliente viejo con creditDays 30 propone 30-dias', async () => {
        const p = await save({ id: 1, ...base, accountType: 'credito', creditDays: 30, creditLimit: 100 });
        expect(p).toMatchObject({ paymentTermId: '30-dias', accountType: 'credito', creditLimit: 100 });
    });

    it('plazo ya inactivo sigue seleccionado', () => {
        const terms = paymentTermsOf().map((t) => (t.id === '30-dias' ? { ...t, active: false } : t));
        render(<CustomerModal customer={{ id: 1, ...base, paymentTermId: '30-dias' }} companyProfile={{ paymentTerms: terms }} onClose={() => {}} onSave={() => {}} />);
        const sel = screen.getByLabelText('Condición de pago');
        expect(sel.value).toBe('30-dias');
        expect(Array.from(sel.options).map((o) => o.value)).toContain('30-dias');
    });

    it('nombre del plazo en la lista', () => {
        expect(customerTermName({ paymentTermId: '30-dias' }, paymentTermsOf())).toBe('30 días');
        expect(customerTermName({}, paymentTermsOf())).toBe('Contado');
        render(<CustomersViewSQL companyProfile={{}} />);
        expect(screen.getAllByText('30 días').length).toBeGreaterThan(0);
    });
});
