import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/api/client.js', () => ({ auth: { approve: vi.fn() } }));
import { auth } from '../src/api/client.js';
import useApproval from '../src/hooks/useApproval.js';

const needsApproval = () => Object.assign(new Error('x'), { status: 403, data: { code: 'APPROVAL_REQUIRED', action: 'shift_open' } });

function Harness({ run, onResult }) {
  const { withApproval, approvalModal } = useApproval();
  return (
    <>
      <button onClick={() => withApproval('shift_open', run).then(r => onResult('ok:' + r), e => onResult('err:' + e.message))}>go</button>
      {approvalModal}
    </>
  );
}

describe('useApproval', () => {
  it('pide el PIN, reintenta con el permiso y muestra el error del servidor', async () => {
    const run = vi.fn().mockRejectedValueOnce(needsApproval()).mockResolvedValue('listo');
    const onResult = vi.fn();
    auth.approve.mockRejectedValueOnce(new Error('PIN incorrecto')).mockResolvedValueOnce({ approvalToken: 'tok' });
    render(<Harness run={run} onResult={onResult} />);
    fireEvent.click(screen.getByText('go'));
    const pin = await screen.findByLabelText('PIN');
    fireEvent.change(pin, { target: { value: '0000' } });
    fireEvent.keyDown(pin, { key: 'Enter' });
    await screen.findByText('PIN incorrecto');
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('Autorizar'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('ok:listo'));
    expect(auth.approve).toHaveBeenLastCalledWith('1234', 'shift_open');
    expect(run).toHaveBeenLastCalledWith('tok');
  });

  it('rechaza si se cancela', async () => {
    const run = vi.fn().mockRejectedValue(needsApproval());
    const onResult = vi.fn();
    render(<Harness run={run} onResult={onResult} />);
    fireEvent.click(screen.getByText('go'));
    await screen.findByLabelText('PIN');
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('err:Operación cancelada'));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
