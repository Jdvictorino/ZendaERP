import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SupplierModal from '../src/components/modals/SupplierModal';

const setup = (onSave = vi.fn()) => {
    render(<SupplierModal supplier={{}} onClose={() => {}} onSave={onSave} />);
    return onSave;
};

describe('SupplierModal', () => {
    it('cambiar el tipo cambia la etiqueta', () => {
        setup();
        expect(screen.getByLabelText('RNC *')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Tipo de proveedor'), { target: { value: 'informal' } });
        expect(screen.getByLabelText('Cédula del vendedor *')).toBeTruthy();
        expect(screen.getByText(/comprobante de compras \(B11\)/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Tipo de proveedor'), { target: { value: 'exterior' } });
        expect(screen.getByLabelText('Pasaporte o identificación extranjera')).toBeTruthy();
    });

    it('muestra el RNC con formato y lo envía solo con dígitos', async () => {
        const onSave = setup();
        fireEvent.change(screen.getByLabelText('Nombre / Razón Social'), { target: { value: 'Prov SA' } });
        fireEvent.change(screen.getByLabelText('RNC *'), { target: { value: '100000004' } });
        expect(screen.getByLabelText('RNC *').value).toBe('1-00-00000-4');
        fireEvent.click(screen.getByText('Guardar Proveedor'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toMatchObject({ supplierType: 'empresa', identificationNumber: '100000004' });
    });

    it('empresa sin RNC no guarda', async () => {
        const onSave = setup();
        fireEvent.change(screen.getByLabelText('Nombre / Razón Social'), { target: { value: 'Prov SA' } });
        fireEvent.click(screen.getByText('Guardar Proveedor'));
        await screen.findByText('El RNC es obligatorio para una empresa.');
        expect(onSave).not.toHaveBeenCalled();
    });
});
