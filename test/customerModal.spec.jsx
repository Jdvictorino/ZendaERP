import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CustomerModal from '../src/components/modals/CustomerModal';

const LABELS = ['Consumidor final', 'Persona Física', 'Empresa', 'Gubernamental', 'Zona franca', 'Régimen especial', 'Diplomático / organismo internacional', 'ONG / sin fines de lucro'];

describe('CustomerModal tipo de contribuyente', () => {
    it('lista los 8 tipos', () => {
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={() => {}} />);
        const select = screen.getByLabelText('Tipo de cliente');
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(LABELS);
    });

    it('muestra carnet solo en tipos exentibles', () => {
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={() => {}} />);
        const select = screen.getByLabelText('Tipo de cliente');
        expect(screen.queryByLabelText('Número de carnet / autorización')).toBeNull();
        fireEvent.change(select, { target: { value: 'zona_franca' } });
        expect(screen.getByLabelText('Número de carnet / autorización')).toBeTruthy();
        expect(screen.getByLabelText('Vence')).toBeTruthy();
        fireEvent.change(select, { target: { value: 'empresa' } });
        expect(screen.queryByLabelText('Vence')).toBeNull();
    });

    it('envía taxpayerType y carnet', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'ZF SA' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 'zona_franca' } });
        fireEvent.change(screen.getByLabelText('Número de carnet / autorización'), { target: { value: 'ZF-1' } });
        fireEvent.change(screen.getByLabelText(/^RNC/), { target: { value: '100000004' } });
        fireEvent.change(screen.getByLabelText('Vence'), { target: { value: '2030-01-31' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const p = onSave.mock.calls[0][0];
        expect(p).toMatchObject({ taxpayerType: 'zona_franca', exemptionNumber: 'ZF-1', exemptionExpiresAt: '2030-01-31' });
        expect(p.type).toBeUndefined();
    });

    it('permite guardar exentible sin número', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'ONG X' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 'ong' } });
        fireEvent.change(screen.getByLabelText(/^RNC/), { target: { value: '100000004' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].exemptionNumber).toBe('');
    });

    it('cliente viejo con type Zona Franca abre como Zona franca', () => {
        render(<CustomerModal customer={{ id: 1, name: 'Viejo', type: 'Zona Franca' }} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByLabelText('Tipo de cliente').value).toBe('zona_franca');
    });

    it('muestra la fecha ISO sin desplazarla', () => {
        render(<CustomerModal customer={{ id: 1, name: 'N', taxpayerType: 'ong', exemptionNumber: 'A', exemptionExpiresAt: '2030-01-31T00:00:00.000Z' }} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByLabelText('Vence').value).toBe('2030-01-31');
    });

    it('empresa sin RNC no se guarda', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'Empresa SRL' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 'empresa' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(screen.getByText('Requerido')).toBeTruthy());
        expect(onSave).not.toHaveBeenCalled();
    });

    it('persona con pasaporte se guarda con letras', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'John Doe' } });
        fireEvent.change(screen.getByLabelText('Cédula / Pasaporte'), { target: { value: 'ab123456' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].identificationNumber).toBe('AB123456');
    });

    it('persona sin identificación se guarda', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'Juan' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
    });

    it('persona física sin cédula ni RNC no se guarda', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'Pedro' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 'persona_fisica' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(screen.getByText('Requerido')).toBeTruthy());
        expect(onSave).not.toHaveBeenCalled();
    });

    it('persona física acepta RNC de 9 dígitos', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'Pedro' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: 'persona_fisica' } });
        fireEvent.change(screen.getByLabelText(/^Cédula \/ RNC/), { target: { value: '100000004' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].identificationNumber).toBe('100000004');
    });

    it('al editar muestra el RNC guardado', () => {
        render(<CustomerModal customer={{ id: 'x', name: 'E', taxpayerType: 'empresa', rnc: '100000004' }} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByLabelText(/^RNC/).value).toBe('100000004');
    });
});

describe('CustomerModal recordatorios de cobro', () => {
    it('marcar la casilla manda remindersOff true; por defecto false', async () => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        const box = screen.getByLabelText('No enviarle recordatorios de cobro');
        expect(box.checked).toBe(false);
        fireEvent.click(box);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'ZF SA' } });
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].remindersOff).toBe(true);
    });

    it('un cliente con remindersOff abre marcado y uno sin el campo, desmarcado', () => {
        const { unmount } = render(<CustomerModal customer={{ id: 1, name: 'A', remindersOff: true }} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByLabelText('No enviarle recordatorios de cobro').checked).toBe(true);
        unmount();
        render(<CustomerModal customer={{ id: 2, name: 'B' }} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByLabelText('No enviarle recordatorios de cobro').checked).toBe(false);
    });
});

describe('CustomerModal aviso de cédula', () => {
    const AVISO = 'La cédula no pasa el dígito verificador; revísala.';
    const fill = (type, id) => {
        const onSave = vi.fn();
        render(<CustomerModal customer={{}} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText('Nombre Completo / Razón Social'), { target: { value: 'Juan' } });
        fireEvent.change(screen.getByLabelText('Tipo de cliente'), { target: { value: type } });
        fireEvent.change(screen.getByLabelText(/^(Cédula|RNC)/), { target: { value: id } });
        return onSave;
    };

    it('avisa con una cédula que falla y deja guardar', async () => {
        const onSave = fill('persona_fisica', '001-1391820-4');
        expect(screen.getByText(AVISO)).toBeTruthy();
        fireEvent.click(screen.getByText('Guardar Cliente'));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].identificationNumber).toBe('00113918204');
    });
    it('sin aviso con una cédula válida', () => {
        fill('persona_fisica', '00113918205');
        expect(screen.queryByText(AVISO)).toBeNull();
    });
    it('sin aviso con un RNC válido', () => {
        fill('persona_fisica', '100000004');
        expect(screen.queryByText(AVISO)).toBeNull();
    });
});
