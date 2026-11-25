import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const update = vi.fn();
vi.mock('../src/api/client.js', () => ({ settings: { update: (...a) => update(...a) } }));
vi.mock('../src/utils/confirmDialog.jsx', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import WithholdingsTab from '../src/components/settings/WithholdingsTab.jsx';

beforeEach(() => update.mockReset().mockImplementation(async (p) => p));

describe('WithholdingsTab', () => {
  it('restaura los valores iniciales tras confirmar', async () => {
    render(<WithholdingsTab companyProfile={{}} canEdit />);
    const name = screen.getByLabelText('Nombre de Honorarios profesionales');
    fireEvent.change(name, { target: { value: 'Otro' } });
    expect(screen.getByLabelText('Nombre de Otro')).toBeTruthy();
    fireEvent.click(screen.getByText('Restaurar valores iniciales'));
    await waitFor(() => expect(screen.getByLabelText('Nombre de Honorarios profesionales')).toBeTruthy());
  });

  it('no guarda una fila con % ISR sin tipo y muestra el mensaje', async () => {
    render(<WithholdingsTab companyProfile={{}} canEdit />);
    fireEvent.click(screen.getByText('Agregar retención'));
    fireEvent.change(screen.getByLabelText('Nombre de retención nueva'), { target: { value: 'Nueva' } });
    fireEvent.change(screen.getByLabelText('% ISR de Nueva'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Guardar retenciones'));
    expect((await screen.findByRole('alert')).textContent).toContain('Elige el tipo de ISR (1 a 8) en "Nueva"');
    expect(update).not.toHaveBeenCalled();
  });

  it('guarda una tabla válida con PUT de withholdings', async () => {
    render(<WithholdingsTab companyProfile={{}} canEdit />);
    fireEvent.click(screen.getByText('Guardar retenciones'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].withholdings).toHaveLength(6);
  });

  it('es de solo lectura sin permiso', () => {
    render(<WithholdingsTab companyProfile={{}} canEdit={false} />);
    expect(screen.queryByText('Guardar retenciones')).toBeNull();
    expect(screen.getByLabelText('Nombre de Honorarios profesionales').disabled).toBe(true);
  });
});
