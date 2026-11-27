import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const update = vi.fn();
vi.mock('../src/api/client.js', () => ({ settings: { update: (...a) => update(...a) } }));
const confirmDialog = vi.fn(async () => true);
vi.mock('../src/utils/confirmDialog.jsx', () => ({ confirmDialog: (...a) => confirmDialog(...a) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import RemindersTab from '../src/components/settings/RemindersTab.jsx';

const smtp = { host: 'smtp.x.com', user: 'a@x.com', hasPassword: true };

beforeEach(() => { update.mockReset().mockImplementation(async (p) => p); confirmDialog.mockClear(); });

describe('RemindersTab', () => {
  it('guarda uno válido mandando solo collectionReminders con números', async () => {
    render(<RemindersTab companyProfile={{ smtp }} canEdit />);
    fireEvent.change(screen.getByLabelText('Hora del envío automático'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Enviar automáticamente'));
    fireEvent.click(screen.getByText('Guardar recordatorios'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const arg = update.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(['collectionReminders']);
    expect(arg.collectionReminders).toMatchObject({ auto: true, autoHour: 14, stages: [-3, 0, 7, 15] });
  });

  it('etapas repetidas muestran el error y no llaman a la API', async () => {
    render(<RemindersTab companyProfile={{ smtp }} canEdit />);
    fireEvent.change(screen.getByLabelText('Etapa 2'), { target: { value: '-3' } });
    fireEvent.click(screen.getByText('Guardar recordatorios'));
    expect((await screen.findByRole('alert')).textContent).toContain('repetidas');
    expect(update).not.toHaveBeenCalled();
  });

  it('agrega y quita etapas', () => {
    render(<RemindersTab companyProfile={{ smtp }} canEdit />);
    fireEvent.click(screen.getByText('Agregar etapa'));
    expect(screen.getByLabelText('Etapa 5')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Quitar etapa 5'));
    expect(screen.queryByLabelText('Etapa 5')).toBeNull();
  });

  it('sin SMTP el interruptor automático está deshabilitado y lo explica', () => {
    render(<RemindersTab companyProfile={{ smtp: { host: '', user: '', hasPassword: false } }} canEdit />);
    expect(screen.getByLabelText('Enviar automáticamente').disabled).toBe(true);
    expect(screen.getByText('Configura el correo de la empresa para activar el envío automático.')).toBeTruthy();
  });

  it('restaurar pide confirmación', async () => {
    render(<RemindersTab companyProfile={{ smtp, collectionReminders: { stages: [1], subject: 'X', body: 'Y' } }} canEdit />);
    fireEvent.click(screen.getByText('Restaurar valores iniciales'));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Asunto').value).toContain('Recordatorio de pago'));
  });

  it('muestra la vista previa con la factura de ejemplo y sin permiso no hay botones', () => {
    render(<RemindersTab companyProfile={{ smtp }} />);
    expect(screen.getByTestId('reminder-preview').textContent).toContain('B0100000001');
    expect(screen.queryByText('Guardar recordatorios')).toBeNull();
  });

  it('perfil sin smtp con auto true: guardar conserva auto true y avisa', async () => {
    render(<RemindersTab companyProfile={{ collectionReminders: { auto: true } }} canEdit />);
    expect(screen.getByText(/está encendido, pero no se enviará nada/)).toBeTruthy();
    expect(screen.getByLabelText('Enviar automáticamente').disabled).toBe(true);
    fireEvent.click(screen.getByText('Guardar recordatorios'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].collectionReminders.auto).toBe(true);
  });
});
