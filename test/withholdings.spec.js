import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as app from '../src/utils/withholdings.js';
import * as srv from '../backend/src/services/withholdings.js';

describe.each([['app', app], ['backend', srv]])('withholdings (%s)', (_n, w) => {
  const byId = (id) => w.DEFAULT_WITHHOLDINGS.find((c) => c.id === id);
  const ok = () => structuredClone(w.DEFAULT_WITHHOLDINGS);

  it('valores iniciales', () => {
    expect(w.DEFAULT_WITHHOLDINGS.map((c) => c.id)).toEqual(['honorarios', 'servicios-tecnicos', 'alquiler', 'informal', 'empresa-30', 'rst']);
    expect(w.validateWithholdings(w.DEFAULT_WITHHOLDINGS)).toBeNull();
  });

  it('withholdingsOf: guardada o iniciales', () => {
    expect(w.withholdingsOf({})).toBe(w.DEFAULT_WITHHOLDINGS);
    expect(w.withholdingsOf(null)).toBe(w.DEFAULT_WITHHOLDINGS);
    expect(w.withholdingsOf({ withholdings: [] })).toEqual([]);
  });

  it('withholdingFor', () => {
    expect(w.withholdingFor(byId('honorarios'), { itbisFacturado: '1800', montoBienes: 0, montoServicios: '10000' }))
      .toEqual({ itbisRetenido: 1800, montoRetencionIsr: 1500, retencionIsrTipo: '2' });
    expect(w.withholdingFor(byId('empresa-30'), { itbisFacturado: 1800, montoBienes: 0, montoServicios: 10000 }))
      .toEqual({ itbisRetenido: 540, montoRetencionIsr: 0, retencionIsrTipo: null });
  });

  it('conceptsFor por tipo', () => {
    const ids = (t) => w.conceptsFor(w.DEFAULT_WITHHOLDINGS, t).map((c) => c.id);
    expect(ids('persona_fisica')).toEqual(['honorarios', 'servicios-tecnicos', 'alquiler', 'rst']);
    expect(ids('informal')).toEqual(['informal', 'rst']);
    expect(ids('exterior')).toEqual(['rst']);
    const l = ok(); l[0].active = false;
    expect(w.conceptsFor(l, 'persona_fisica').map((c) => c.id)).not.toContain('honorarios');
  });

  it('validateWithholdings: cada error', () => {
    const bad = (fn) => { const l = ok(); fn(l); return w.validateWithholdings(l); };
    expect(bad((l) => { l[0].name = ' '; })).toMatch(/nombre/);
    expect(bad((l) => { l[0].itbisPercent = 101; })).toMatch(/porcentajes/);
    expect(bad((l) => { l[0].isrPercent = -1; })).toMatch(/porcentajes/);
    expect(bad((l) => { l[0].isrType = null; })).toMatch(/ISR/);
    expect(bad((l) => { l[0].isrType = '9'; })).toMatch(/ISR/);
    expect(bad((l) => { l[0].supplierTypes = []; })).toMatch(/proveedor/);
    expect(bad((l) => { l[0].supplierTypes = ['x']; })).toMatch(/proveedor/);
    expect(bad((l) => { l[1].id = l[0].id; })).toMatch(/id/);
    expect(w.validateWithholdings('x')).toBeTruthy();
  });

  it('saldo y estado', () => {
    const i = { total: '1180', amountPaid: '1000', itbisRetenido: '180', retencionRenta: '0' };
    expect(w.invoiceBalance(i)).toBe(0);
    expect(w.invoiceStatus(i)).toBe('Pagado');
    expect(w.invoiceBalance({ total: 1180, amountPaid: 500 })).toBe(680);
    expect(w.invoiceStatus({ total: 1180, amountPaid: 500 })).toBe('Pagado Parcialmente');
    expect(w.invoiceStatus({ total: 1180, amountPaid: 0 })).toBe('Pendiente');
    expect(w.invoiceBalance({ total: 100, amountPaid: 150 })).toBe(0);
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (p) => readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
  expect(body('src/utils/withholdings.js')).toBe(body('backend/src/services/withholdings.js'));
});

describe.each([['app', app], ['backend', srv]])('saldo con notas de crédito (%s)', (_n, w) => {
  it('creditedAmount resta del saldo y cuenta en el estado', () => {
    expect(w.invoiceBalance({ total: 1000, amountPaid: '0', creditedAmount: '200' })).toBe(800);
    expect(w.invoiceBalance({ total: 1000, amountPaid: 800 })).toBe(200);
    expect(w.invoiceStatus({ total: 1000, amountPaid: 800, creditedAmount: 200 })).toBe('Pagado');
    expect(w.invoiceStatus({ total: 1000, amountPaid: 0, creditedAmount: 200 })).toBe('Pagado Parcialmente');
  });
});
