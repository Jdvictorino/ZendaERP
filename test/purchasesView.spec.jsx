import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/api/client.js', () => ({
    purchaseOrders: {
        list: vi.fn().mockResolvedValue([
            { id: 'o1', number: 'OC-0001', status: 'borrador', supplierId: 's1', supplier: { id: 's1', name: 'Distribuidora Sol' }, total: '118.00', _count: { items: 1 } },
            { id: 'o2', number: 'OC-0002', status: 'parcial', supplierId: 's1', supplier: { id: 's1', name: 'Distribuidora Sol' }, total: '50.00', _count: { items: 2 } }
        ]),
        get: vi.fn(), create: vi.fn(), update: vi.fn(), send: vi.fn(), cancel: vi.fn(), receive: vi.fn(), invoice: vi.fn(), suggestions: vi.fn()
    },
    products: { list: vi.fn().mockResolvedValue({ data: [], pagination: {} }) },
    suppliers: { list: vi.fn().mockResolvedValue({ data: [{ id: 's1', name: 'Distribuidora Sol', status: 'active' }] }) }
}));
vi.mock('../src/utils/pdfGenerator.js', () => ({ generatePDF: vi.fn() }));

import PurchasesView from '../src/views/PurchasesView.jsx';
import ReceiveModal from '../src/components/purchases/ReceiveModal.jsx';
import PurchaseOrderForm from '../src/components/purchases/PurchaseOrderForm.jsx';

describe('PurchasesView', () => {
    it('lista las órdenes con su estado y acciones según el rol', async () => {
        render(<PurchasesView companyProfile={{}} currentUserProfile={{ role: 'manager' }} />);
        expect(await screen.findByText('OC-0001')).toBeTruthy();
        expect(screen.getByText('OC-0002')).toBeTruthy();
        expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0); // también está en el filtro
        expect(screen.getAllByText('Recibida parcial').length).toBe(2); // filtro + badge
        expect(await screen.findByRole('option', { name: 'Distribuidora Sol' })).toBeTruthy(); // proveedores leídos de .data
        expect(screen.getByLabelText('Enviar OC-0001')).toBeTruthy();
        expect(screen.getByLabelText('Recibir OC-0002')).toBeTruthy();
    });

    it('el contador ve la lista sin acciones de escritura', async () => {
        render(<PurchasesView companyProfile={{}} currentUserProfile={{ role: 'accountant' }} />);
        await screen.findByText('OC-0001');
        expect(screen.queryByLabelText('Enviar OC-0001')).toBeNull();
        expect(screen.queryByText('Nueva orden')).toBeNull();
        expect(screen.getByLabelText('Registrar factura de OC-0002')).toBeTruthy();
    });
});

describe('PurchaseOrderForm', () => {
    it('totales en vivo: 2 x 100 al 18% + 1 x 50 al 0%', async () => {
        const products = [
            { id: 'a', name: 'Aceite', unit: 'unidad', costPrice: 100, isTaxable: true, taxRate: 18, packagings: [] },
            { id: 'b', name: 'Sal', unit: 'unidad', costPrice: 50, isTaxable: false, taxRate: 18, packagings: [] }
        ];
        render(<PurchaseOrderForm isOpen onClose={() => {}} products={products} suppliers={[]} onSave={() => {}}
            initial={{ items: [
                { productId: 'a', quantity: 2, unitCost: '100' },
                { productId: 'b', quantity: 1, unitCost: '50' }
            ] }} />);
        await waitFor(() => expect(screen.getByTestId('po-subtotal').textContent).toMatch(/250\.00/));
        expect(screen.getByTestId('po-itbis').textContent).toMatch(/36\.00/);
        expect(screen.getByTestId('po-total').textContent).toMatch(/286\.00/);
        fireEvent.change(screen.getByLabelText('Cantidad', { selector: '#po-qty-1' }), { target: { value: '3' } });
        expect(screen.getByTestId('po-subtotal').textContent).toMatch(/350\.00/);
    });
});

describe('ReceiveModal: gastos de importación', () => {
    const order = { number: 'OC-1', items: [{ id: 'i1', quantity: 1, receivedQuantity: 0, unitCost: '120', packagingFactor: '12', product: { name: 'Agua' }, packagingName: 'Caja x12' }] };
    const abrir = (onSubmit = vi.fn()) => { render(<ReceiveModal isOpen onClose={() => {}} order={order} onSubmit={onSubmit} />); return onSubmit; };

    it('sección plegable con cuatro campos, nota del ITBIS y vista previa 11.0000', () => {
        abrir();
        expect(screen.getByText('Gastos de importación')).toBeTruthy();
        for (const l of ['Flete', 'Seguro', 'Aranceles', 'Otros']) expect(screen.getByLabelText(l)).toBeTruthy();
        expect(screen.getByText('No incluyas el ITBIS de aduana: es crédito fiscal')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Flete'), { target: { value: '12' } });
        expect(screen.getByTestId('rc-cost-i1').textContent).toBe('11.0000');
    });

    it('manda charges numéricos al confirmar', async () => {
        const onSubmit = abrir();
        fireEvent.change(screen.getByLabelText('Flete'), { target: { value: '12' } });
        fireEvent.click(screen.getByText('Registrar recepción'));
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0].charges).toEqual({ flete: 12, seguro: 0, aranceles: 0, otros: 0 });
    });

    it('un monto negativo muestra error y no envía', () => {
        const onSubmit = abrir();
        fireEvent.change(screen.getByLabelText('Seguro'), { target: { value: '-5' } });
        fireEvent.click(screen.getByText('Registrar recepción'));
        expect(screen.getByRole('alert').textContent).toMatch(/seguro/i);
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
