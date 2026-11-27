import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as back from '../backend/src/services/supplierId.js';
import * as front from '../src/utils/supplierId.js';

const { formatSupplierId, legacySupplierId } = back;

for (const [name, mod] of [['backend', back], ['app', front]]) describe(`normalizeSupplierId (${name})`, () => {
    const n = mod.normalizeSupplierId;
    it('dígito verificador', () => {
        for (const v of ['501050302', '531056152', '101850043', '101010632', '100000004']) expect(n('empresa', v).error).toBeNull();
        expect(n('empresa', '100000003').error).toBe('El RNC no es válido (dígito verificador).');
    });
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

describe('legacySupplierId (apps 1.1.x sin supplierType)', () => {
    it('infiere el tipo y no valida', () => {
        expect(legacySupplierId('001-1234567-8')).toEqual({ supplierType: 'persona_fisica', identificationNumber: '00112345678' });
        expect(legacySupplierId('')).toEqual({ supplierType: 'empresa', identificationNumber: null });
        expect(legacySupplierId('123')).toEqual({ supplierType: 'empresa', identificationNumber: '123' });
        expect(legacySupplierId('AB-12')).toEqual({ supplierType: 'empresa', identificationNumber: 'AB-12' });
    });
});

it('las dos copias son idénticas desde la línea 2', () => {
    const body = (p) => readFileSync(p, 'utf8').split(/\r?\n/).slice(1).join('|');
    expect(body('src/utils/supplierId.js')).toBe(body('backend/src/services/supplierId.js'));
});

const AVISO = 'La cédula no pasa el dígito verificador; revísala.';
for (const [name, mod] of [['backend', back], ['app', front]]) describe(`cédula (${name})`, () => {
    it('cedulaValid', () => {
        expect(mod.cedulaValid('00113918205')).toBe(true);
        expect(mod.cedulaValid('001-1391820-5')).toBe(true);
        expect(mod.cedulaValid('00113918204')).toBe(false);
        expect(mod.cedulaValid('00113918215')).toBe(false);
        for (const v of ['', '1234', '001139182050', 'abc']) expect(mod.cedulaValid(v)).toBe(false);
    });
    it('normalizeSupplierId avisa sin bloquear', () => {
        expect(mod.normalizeSupplierId('informal', '00113918204')).toEqual({ value: '00113918204', error: null, warning: AVISO });
        expect(mod.normalizeSupplierId('persona_fisica', '00113918204').warning).toBe(AVISO);
        expect(mod.normalizeSupplierId('persona_fisica', '00113918205').warning).toBeUndefined();
        expect(mod.normalizeSupplierId('persona_fisica', '100000004').warning).toBeUndefined();
    });
});

it('las dos copias son idénticas desde la línea 2', () => {
    const body = (f) => readFileSync(f, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
    expect(body('src/utils/supplierId.js')).toBe(body('backend/src/services/supplierId.js'));
});
