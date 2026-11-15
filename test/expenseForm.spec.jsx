// Formulario de gastos como página: comprobante que emite la empresa y gasto ya emitido (bloqueado)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ExpenseForm from '../src/components/forms/ExpenseForm.jsx';

const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const labelText = () => [...document.querySelectorAll('label, legend')].map((l) => l.textContent).join(' | ');

describe('ExpenseForm', () => {
  let container, root;
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('es una página (no un modal) y al elegir B11 pide la cédula del vendedor', async () => {
    const onSave = vi.fn();
    await act(async () => root.render(<ExpenseForm onClose={() => {}} onSave={onSave} />));
    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(labelText()).toContain('NCF de la factura');

    const b11 = [...container.querySelectorAll('input[type=radio]')][1];
    await act(async () => b11.click());
    expect(labelText()).toContain('Cédula del vendedor');
    expect(labelText()).not.toContain('NCF de la factura');

    await act(async () => button('Guardar y emitir B11').click());
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('El B11 lleva la cédula del vendedor');
  });

  it('pago al exterior (B17): pide los datos del 609', async () => {
    const onSave = vi.fn();
    await act(async () => root.render(<ExpenseForm onClose={() => {}} onSave={onSave} />));
    await act(async () => [...container.querySelectorAll('input[type=radio]')][3].click());
    expect(labelText()).toContain('Pago al exterior (609)');
    expect(container.querySelector('#exp-country').options.length).toBeGreaterThan(200);
    await act(async () => button('Guardar y emitir B17').click());
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Elige el país al que se paga');
  });

  it('un gasto con comprobante emitido muestra el NCF y bloquea los montos', async () => {
    const expense = { id: 'g1', ncf: 'B1100000007', issuedVoucher: 'B11', invoiceDate: '2026-11-15T00:00:00.000Z', montoBienes: '100.00', montoServicios: '0.00', rncCedula: '00112345678', supplierName: 'Juan' };
    await act(async () => root.render(<ExpenseForm expense={expense} onClose={() => {}} onSave={vi.fn()} />));
    expect(container.textContent).toContain('B1100000007');
    expect(container.querySelector('#exp-montoBienes').readOnly).toBe(true);
    expect(container.querySelector('#exp-paymentDate').readOnly).toBe(false);
    expect(container.querySelectorAll('input[type=radio]')).toHaveLength(0);
  });
});
