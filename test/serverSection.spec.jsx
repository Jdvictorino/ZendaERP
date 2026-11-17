import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  unlocked: false,
  isUnlocked: () => api.unlocked,
  lock: vi.fn(),
  totpStatus: vi.fn(),
  totpSetup: vi.fn(),
  totpConfirm: vi.fn(),
  unlock: vi.fn(),
  ticket: vi.fn(),
  audit: vi.fn(),
  tables: vi.fn(),
  table: vi.fn(),
  query: vi.fn(),
  terminalUrl: vi.fn(),
}));
vi.mock('../src/api/client.js', () => ({ consoleApi: api }));
vi.mock('react-qr-code', () => ({ default: ({ value }) => <svg data-testid="qr" data-value={value} /> }));

import ServerSection from '../src/views/platform/ServerSection.jsx';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset?.());
  api.unlocked = false;
  api.audit.mockResolvedValue({ data: [], total: 0 });
  api.tables.mockResolvedValue([{ name: 'users', rows: 1 }]);
});

describe('ServerSection', () => {
  it('sin TOTP muestra el QR y el campo de código', async () => {
    api.totpStatus.mockResolvedValue({ configured: false });
    api.totpSetup.mockResolvedValue({ otpauthUri: 'otpauth://totp/x' });
    render(<ServerSection sessionToken="s" />);
    expect(await screen.findByTestId('qr')).toHaveAttribute('data-value', 'otpauth://totp/x');
    expect(screen.getByLabelText('Código de 6 dígitos')).toBeTruthy();
  });

  it('con TOTP, abrir Base de datos pide el código', async () => {
    api.totpStatus.mockResolvedValue({ configured: true });
    render(<ServerSection sessionToken="s" />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Base de datos' }));
    expect(await screen.findByLabelText('Código de verificación')).toBeTruthy();
  });

  it('un 409 pide confirmación con el texto y reenvía con confirm: true', async () => {
    api.unlocked = true;
    api.totpStatus.mockResolvedValue({ configured: true });
    const conflict = Object.assign(new Error('Requiere confirmación'), { status: 409 });
    api.query.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ rowCount: 3, wrote: true, rows: [] });
    render(<ServerSection sessionToken="s" />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Base de datos' }));
    fireEvent.change(await screen.findByLabelText('Consulta SQL'), { target: { value: 'DELETE FROM users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect((await screen.findByTestId('pending-sql')).textContent).toBe('DELETE FROM users');
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar de todos modos' }));
    await waitFor(() => expect(api.query).toHaveBeenLastCalledWith('s', 'DELETE FROM users', true));
  });

  it('la pestaña Registro muestra la nota', async () => {
    api.totpStatus.mockResolvedValue({ configured: true });
    render(<ServerSection sessionToken="s" />);
    expect(await screen.findByText(/El registro de comandos es aproximado/)).toBeTruthy();
  });
});
