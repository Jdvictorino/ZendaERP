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
        expect(onSave.mock.calls[0][0]).toMatchObject({ paymentTermId: '30-dias' });
    });

    it('cliente viejo con límite y sin plazo guarda el mismo límite', async () => {
        const p = await save({ id: 1, ...base, creditLimit: 5000 });
        expect(p).toMatchObject({ paymentTermId: null, creditLimit: 5000 });
    });

    it('contado y de vuelta a 30-dias conserva el límite', async () => {
        render(<CustomerModal customer={{ id: 1, ...base, paymentTermId: '30-dias', creditLimit: 5000 }} onClose={() => {}} onSave={() => {}} />);
        fireEvent.change(screen.getByLabelText('Condición de pago'), { target: { value: 'contado' } });
        expect(screen.getByLabelText('Límite de Crédito').value).toBe('5000');
        fireEvent.change(screen.getByLabelText('Condición de pago'), { target: { value: '30-dias' } });
        expect(screen.getByLabelText('Límite de Crédito').value).toBe('5000');
    });

    it('plazo borrado muestra Plazo eliminado, no Contado', () => {
        expect(customerTermName({ paymentTermId: 'zzz' }, paymentTermsOf())).toBe('Plazo eliminado');
    });

    it('contado: límite deshabilitado, paymentTermId null', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{ id: 1, ...base, paymentTermId: '30-dias', creditLimit: 500 }} onClose={() => {}} onSave={onSave} />);
        expect(screen.getByLabelText('Límite de Crédito').disabled).toBe(false);
        fireEvent.change(screen.getByLabelText('Condición de pago'), { target: { value: 'contado' } });
        const limit = screen.getByLabelText('Límite de Crédito');
        expect(limit.disabled).toBe(true);
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toMatchObject({ paymentTermId: null });
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
