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

  describe('concepto de retención', () => {
    const type = async (id, value) => {
      const el = container.querySelector(id);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const pick = async (id, value) => {
      const el = container.querySelector(id);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    const suppliers = [{ id: 's1', name: 'Pedro', supplierType: 'informal', identificationNumber: '00112345678' }, { id: 's2', name: 'Ana', supplierType: 'persona_fisica' }];
    const val = (id) => container.querySelector(id).value;

    it('honorarios llena 1800 / 1500 / tipo 2 y recalcula al cambiar montos', async () => {
      await act(async () => root.render(<ExpenseForm suppliers={suppliers} onClose={() => {}} onSave={vi.fn()} />));
      await pick('#exp-supplierId', 's2');
      await type('#exp-montoServicios', '10000');
      await type('#exp-itbisFacturado', '1800');
      await pick('#exp-concept', 'honorarios');
      expect([val('#exp-itbisRetenido'), val('#exp-montoRetencionIsr'), val('#exp-retencionIsrTipo')]).toEqual(['1800', '1500', '2']);
      await type('#exp-montoServicios', '20000');
      expect(val('#exp-montoRetencionIsr')).toBe('3000');
    });

    it('si el usuario edita la retención a mano, cambiar montos no la pisa', async () => {
      await act(async () => root.render(<ExpenseForm suppliers={suppliers} onClose={() => {}} onSave={vi.fn()} />));
      await pick('#exp-supplierId', 's2');
      await type('#exp-montoServicios', '10000');
      await pick('#exp-concept', 'honorarios');
      await type('#exp-montoRetencionIsr', '999');
      await type('#exp-montoServicios', '20000');
      expect(val('#exp-montoRetencionIsr')).toBe('999');
    });

    it('al cambiar a un proveedor al que el concepto no aplica, deja de recalcular', async () => {
      const list = [...suppliers, { id: 's3', name: 'Acme', supplierType: 'empresa' }];
      await act(async () => root.render(<ExpenseForm suppliers={list} onClose={() => {}} onSave={vi.fn()} />));
      await pick('#exp-supplierId', 's2');
      await type('#exp-montoServicios', '10000');
      await pick('#exp-concept', 'honorarios');
      await pick('#exp-supplierId', 's3');
      expect(val('#exp-concept')).toBe('');
      await type('#exp-montoServicios', '20000');
      expect(val('#exp-montoRetencionIsr')).toBe('1500');
    });

    it('un proveedor informal preselecciona el concepto B11 en un gasto nuevo', async () => {
      await act(async () => root.render(<ExpenseForm suppliers={suppliers} onClose={() => {}} onSave={vi.fn()} />));
      await type('#exp-itbisFacturado', '180');
      await pick('#exp-supplierId', 's1');
      expect(val('#exp-concept')).toBe('informal');
      expect(val('#exp-itbisRetenido')).toBe('180');
    });

    it('abrir un gasto guardado no cambia sus retenciones', async () => {
      const expense = { id: 'g2', supplierId: 's1', itbisFacturado: '180', montoServicios: '1000', itbisRetenido: '50', montoRetencionIsr: '0', invoiceDate: '2026-11-15' };
      await act(async () => root.render(<ExpenseForm expense={expense} suppliers={suppliers} onClose={() => {}} onSave={vi.fn()} />));
      expect(val('#exp-itbisRetenido')).toBe('50');
      expect(val('#exp-concept')).toBe('');
    });
  });
});
