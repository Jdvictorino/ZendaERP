import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PackagingsEditor from '../src/components/products/PackagingsEditor';

describe('PackagingsEditor', () => {
    it('Agregar empaque añade una fila nueva', () => {
        const onChange = vi.fn();
        render(<PackagingsEditor value={[]} onChange={onChange} baseUnitAbbr="ud." basePrice={50} />);
        fireEvent.click(screen.getByText('Agregar empaque'));
        expect(onChange).toHaveBeenCalledWith([{ name: '', factor: 1, unitCode: 6 }]);
    });

    it('precio vacío muestra la sugerencia base × equivalencia', () => {
        render(<PackagingsEditor value={[{ name: 'Caja', factor: 24, unitCode: 6 }]} onChange={() => {}} basePrice={50} />);
        expect(screen.getByLabelText(/Precio de venta/).placeholder).toBe('1,200.00');
    });

    it('quitar fila', () => {
        const onChange = vi.fn();
        render(<PackagingsEditor value={[{ name: 'Caja', factor: 24, unitCode: 6 }]} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText('Quitar empaque 1'));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
