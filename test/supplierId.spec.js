import { describe, it, expect } from 'vitest';
import { normalizeSupplierId as n } from '../backend/src/services/supplierId.js';
import { formatSupplierId } from '../src/utils/supplierId.js';

describe('normalizeSupplierId', () => {
    it('empresa', () => {
        expect(n('empresa', '1-00-00000-4')).toEqual({ value: '100000004', error: null });
        expect(n('empresa', '').error).toBe('El RNC es obligatorio para una empresa.');
        expect(n('empresa', '12345').error).toBe('El RNC debe tener 9 dígitos.');
        expect(n('empresa', '100000005').error).toBe('El RNC no es válido (dígito verificador).');
    });
    it('persona_fisica', () => {
        expect(n('persona_fisica', '001-1234567-8').value).toBe('00112345678');
        expect(n('persona_fisica', '100000004').value).toBe('100000004');
        for (const v of ['', '12345', '100000005', 'abc']) expect(n('persona_fisica', v).error).toBe('Escribe una cédula (11 dígitos) o un RNC (9) válidos.');
    });
    it('informal', () => {
        expect(n('informal', '001-1234567-8').value).toBe('00112345678');
        for (const v of ['', '100000004']) expect(n('informal', v).error).toBe('La cédula del vendedor informal es obligatoria (11 dígitos).');
    });
    it('exterior', () => {
        expect(n('exterior', 'ab 123-456').value).toBe('AB123456');
        expect(n('exterior', '')).toEqual({ value: null, error: null });
        expect(n('exterior', 'x'.repeat(21)).error).toBeTruthy();
    });
    it('tipo desconocido', () => {
        expect(n('otro', '1').error).toBe('Tipo de proveedor no válido.');
    });
});

describe('formatSupplierId', () => {
    it('formatos', () => {
        expect(formatSupplierId('131000001')).toBe('1-31-00000-1');
        expect(formatSupplierId('00112345678')).toBe('001-1234567-8');
        expect(formatSupplierId('12345')).toBe('12345');
    });
});
