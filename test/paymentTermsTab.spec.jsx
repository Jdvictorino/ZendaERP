import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const update = vi.fn();
vi.mock('../src/api/client.js', () => ({ settings: { update: (...a) => update(...a) } }));
vi.mock('../src/utils/confirmDialog.jsx', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import toast from 'react-hot-toast';
import PaymentTermsTab from '../src/components/settings/PaymentTermsTab.jsx';

beforeEach(() => { toast.success.mockClear(); update.mockReset().mockImplementation(async (p) => p); });

describe('PaymentTermsTab', () => {
  it('restaura los valores iniciales tras confirmar', async () => {
    render(<PaymentTermsTab companyProfile={{}} canEdit />);
    fireEvent.change(screen.getByLabelText('Nombre de 15 días'), { target: { value: 'Otro' } });
    expect(screen.getByLabelText('Nombre de Otro')).toBeTruthy();
    fireEvent.click(screen.getByText('Restaurar valores iniciales'));
    await waitFor(() => expect(screen.getByLabelText('Nombre de 15 días')).toBeTruthy());
  });

  it('cuotas que no suman 100 muestran el error y no llaman a la API', async () => {
    render(<PaymentTermsTab companyProfile={{}} canEdit />);
    fireEvent.change(screen.getByLabelText('Porcentaje de la cuota 1 de 15 días'), { target: { value: '90' } });
    fireEvent.click(screen.getByText('Guardar condiciones'));
    expect((await screen.findByRole('alert')).textContent).toContain('deben sumar 100');
    expect(update).not.toHaveBeenCalled();
  });

  it('guarda un plazo válido mandando solo paymentTerms y con números', async () => {
    render(<PaymentTermsTab companyProfile={{}} canEdit />);
    fireEvent.change(screen.getByLabelText('Días de la cuota 1 de 15 días'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Guardar condiciones'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const arg = update.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(['paymentTerms']);
    const t = arg.paymentTerms.find((x) => x.id === '15-dias');
    expect(t.installments[0]).toEqual({ percent: 100, days: 20, fromMonthEnd: false });
    expect(arg.paymentTerms.find((x) => x.id === '30-dias-2-10').discount).toEqual({ percent: 2, days: 10 });
    expect(t.discount).toBeNull();
  });

  it('un plazo guardado no se borra y contado no se desactiva; uno nuevo sí se quita y conserva su id', async () => {
    render(<PaymentTermsTab companyProfile={{}} canEdit />);
    expect(screen.queryByLabelText('Quitar 15 días')).toBeNull();
    expect(screen.getByLabelText('Activo: Contado').disabled).toBe(true);
    fireEvent.click(screen.getByText('Agregar plazo'));
    fireEvent.change(screen.getByLabelText('Nombre de plazo nuevo'), { target: { value: 'A 90' } });
    fireEvent.change(screen.getByLabelText('Días de la cuota 1 de A 90'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Nombre de A 90'), { target: { value: 'A 90 días' } });
    fireEvent.click(screen.getByText('Guardar condiciones'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const list = update.mock.calls[0][0].paymentTerms;
    const nuevo = list.find((x) => x.name === 'A 90 días');
    expect(nuevo.id).toBeTruthy();
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByLabelText('Quitar A 90 días')).toBeNull(); // ya guardado: no se quita
    fireEvent.click(screen.getByText('Agregar plazo'));
    fireEvent.click(screen.getByLabelText('Quitar plazo nuevo'));
    expect(screen.queryByLabelText('Nombre de plazo nuevo')).toBeNull();
  });

  it('es de solo lectura sin permiso', () => {
    render(<PaymentTermsTab companyProfile={{}} canEdit={false} />);
    expect(screen.queryByText('Guardar condiciones')).toBeNull();
    expect(screen.getByLabelText('Nombre de 15 días').disabled).toBe(true);
  });
});
