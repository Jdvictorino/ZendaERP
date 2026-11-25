import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CategoryPricesEditor from '../src/components/products/CategoryPricesEditor';

const cats = ['General', 'VIP'];
const pks = [{ id: 'p1', name: 'Caja de 24' }, { name: 'Nuevo' }];

describe('CategoryPricesEditor', () => {
    it('Agregar precio añade una fila con la primera categoría', () => {
        const onChange = vi.fn();
        render(<CategoryPricesEditor value={[]} onChange={onChange} categories={cats} packagings={[]} baseUnitLabel="Unidad" />);
        fireEvent.click(screen.getByText('Agregar precio'));
        expect(onChange).toHaveBeenCalledWith([{ category: 'General', packagingId: null, minQuantity: 1, price: '' }]);
    });

    it('el select de empaque lista la unidad base y solo empaques con id', () => {
        const row = { category: 'VIP', packagingId: null, minQuantity: 1, price: '90' };
        render(<CategoryPricesEditor value={[row]} onChange={() => {}} categories={cats} packagings={pks} baseUnitLabel="Unidad" />);
        const opts = [...screen.getByLabelText('Empaque 1').options].map((o) => o.textContent);
        expect(opts).toEqual(['Unidad', 'Caja de 24']);
        expect(screen.getByText('Guarda el producto para usar un empaque nuevo')).toBeTruthy();
    });

    it('editar el precio y quitar la fila', () => {
        const onChange = vi.fn();
        const row = { category: 'VIP', packagingId: null, minQuantity: 1, price: '90' };
        render(<CategoryPricesEditor value={[row]} onChange={onChange} categories={cats} packagings={[]} baseUnitLabel="Unidad" />);
        fireEvent.change(screen.getByLabelText('Precio sin ITBIS 1'), { target: { value: '85' } });
        expect(onChange).toHaveBeenCalledWith([{ ...row, price: '85' }]);
        fireEvent.click(screen.getByLabelText('Quitar precio 1'));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
