import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CustomerModal from '../src/components/modals/CustomerModal';

const LABELS = ['Consumidor final', 'Persona física (crédito fiscal)', 'Empresa', 'Gubernamental', 'Zona franca', 'Régimen especial', 'Diplomático / organismo internacional', 'ONG / sin fines de lucro'];

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
});
