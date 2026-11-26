import { describe, it, expect } from 'vitest';
import { customerTaxId, invoiceTitle, showNotesColumn, termLines } from '../src/utils/docLines.js';
import { generateThermalReceiptHTML } from '../src/utils/escposGenerator.js';

describe('identificación del cliente en documentos', () => {
  it('usa la copia de la factura, luego el rnc del cliente', () => {
    expect(customerTaxId({ rnc: '100000004' }, { customerRnc: '00112345678' })).toBe('00112345678');
    expect(customerTaxId({ rnc: '100000004' }, {})).toBe('100000004');
  });
  it('sin identificación devuelve null y nunca el id interno', () => {
    expect(customerTaxId({ id: 'uuid-1' }, { customerId: '6f1c2a54-0000-4000-8000-000000000000' })).toBeNull();
    expect(customerTaxId(null, null)).toBeNull();
  });
});

describe('título de la factura', () => {
  it('según el comprobante', () => {
    expect(invoiceTitle({ ncfNumber: 'B0100000012' })).toBe('Factura de Crédito Fiscal');
    expect(invoiceTitle({ ncfNumber: 'B0200000001' })).toBe('Factura de Consumo');
    expect(invoiceTitle({ ncfNumber: 'B1500000001' })).toBe('Factura Gubernamental');
    expect(invoiceTitle({ ncfNumber: 'B1400000001' })).toBe('Factura de Régimen Especial');
    expect(invoiceTitle({ ecfData: { eNcf: 'E320000000001' } })).toBe('Factura de Consumo Electrónica');
    expect(invoiceTitle({ ncfNumber: 'NoFiscal', ncfType: 'NoFiscal' })).toBe('Factura');
    expect(invoiceTitle({})).toBe('Factura');
  });
});

describe('columna Notas', () => {
  it('solo en modo Tienda con Personalizar activo', () => {
    expect(showNotesColumn({})).toBe(true);
    expect(showNotesColumn({ allowCustomization: true })).toBe(true);
    expect(showNotesColumn({ allowCustomization: false })).toBe(false);
    expect(showNotesColumn({ orderMode: 'distributor' })).toBe(false);
    expect(showNotesColumn({ settings: { orderMode: 'distributor' }, allowCustomization: true })).toBe(false);
  });
});

describe('recibo', () => {
  const docData = { invoiceNumber: 'F-1', ncfType: 'NoFiscal', customerName: 'Juan', customerId: '6f1c2a54-0000-4000-8000-000000000000', items: [], total: 0 };
  it('sin identificación no imprime RNC/Céd ni el id interno', () => {
    const html = generateThermalReceiptHTML(docData, 'invoice', {}, { id: 'x', name: 'Juan' }, null);
    expect(html).not.toContain('6f1c2a54');
    expect(html).not.toContain('RNC/Céd');
  });
  it('con RNC lo imprime y el título sigue al comprobante', () => {
    const html = generateThermalReceiptHTML({ ...docData, ncfType: 'B01', ncfNumber: 'B0100000012' }, 'invoice', {}, { name: 'Empresa', rnc: '100000004' }, null);
    expect(html).toContain('RNC/Céd.: 100000004');
    expect(html).toContain('FACTURA DE CRÉDITO FISCAL');
  });
});

import { qtyText, lineDiscount, isEcfDoc, modificationInfo, lateNoteInfo } from '../src/utils/docLines.js';

describe('representación impresa e-CF', () => {
  it('en e-CF la unidad va en palabras; fuera de e-CF, abreviada', () => {
    expect(qtyText({ quantity: 1.5, product: { unit: 'libra' } }, { words: true })).toBe('1.5 libras');
    expect(qtyText({ quantity: 1, product: { unit: 'unidad' } }, { words: true })).toBe('1 unidad');
    expect(qtyText({ quantity: 3, product: { unit: 'unidad' } }, { words: true })).toBe('3 unidades');
    expect(qtyText({ quantity: 2, product: { unit: 'galon' } }, { words: true })).toBe('2 galones');
    expect(qtyText({ quantity: 2, packagingName: 'Caja de 24', product: { unit: 'unidad' } }, { words: true })).toBe('2');
    expect(qtyText({ quantity: 1.5, product: { unit: 'libra' } })).toBe('1.5 lb');
  });
  it('isEcfDoc mira el comprobante', () => {
    expect(isEcfDoc({ ncfNumber: 'E320000000001' })).toBe(true);
    expect(isEcfDoc({ ecfData: { eNcf: 'E310000000001' } })).toBe(true);
    expect(isEcfDoc({ ncfNumber: 'B0200000001' })).toBe(false);
    expect(isEcfDoc({})).toBe(false);
  });
  it('descuento de la línea solo si tiene porcentaje', () => {
    expect(lineDiscount({ unitPrice: 100, quantity: 2, discountPercent: 10, taxRate: 18, subtotal: 180 }, false)).toBe(20);
    expect(lineDiscount({ unitPrice: 33.33, quantity: 3, taxRate: 18, subtotal: 100 }, false)).toBe(0);
  });
  it('código de modificación en palabras', () => {
    expect(modificationInfo('invoice', {})).toBeNull();
    expect(modificationInfo('credit-note', { ecfData: { modificationCode: '1', modifiedNcf: 'E310000000012' } }))
      .toEqual({ ncf: 'E310000000012', label: 'Anula el NCF modificado' });
    expect(modificationInfo('credit-note', { noteType: 'Anulación de Factura', originalNcf: 'B0100000003' }).label).toBe('Anula el NCF modificado');
    expect(modificationInfo('credit-note', { reason: 'Devolución: 1 caja', originalNcf: 'B0100000003' }).label).toBe('Corrige montos del NCF modificado');
    expect(modificationInfo('debit-note', { originalNcf: 'B0100000003' }).label).toBe('Corrige montos del NCF modificado');
  });
});

import { baseSplit } from '../src/utils/docLines.js';

describe('subtotal gravado y exento', () => {
  it('se separa por la tasa de cada línea', () => {
    expect(baseSplit({ subtotal: 187.5, items: [{ taxRate: 0, subtotal: 67.5 }, { taxRate: 18, subtotal: 120 }] })).toEqual({ gravado: 120, exento: 67.5 });
  });
  it('sin líneas guardadas usa lo del documento', () => {
    expect(baseSplit({ montoGravado: 3000, montoExento: 0, items: [] })).toEqual({ gravado: 3000, exento: 0 });
    expect(baseSplit({ subtotal: 100, items: [] })).toEqual({ gravado: 100, exento: 0 });
  });
});

describe('ticket térmico (representación impresa)', () => {
  const profile = { name: 'Colmado', rnc: '131000001', currency: 'DOP' };
  const venta = {
    ncfNumber: 'E320000000005', ncfType: 'E32', pricesIncludeTax: false, total: 209.1, taxAmount: 21.6, subtotal: 187.5,
    ecfData: { eNcf: 'E320000000005', qrCodeUrl: 'https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?x=1', securityCode: 'Ab12Cd', signedAt: '24-11-2026 11:00:00' },
    items: [
      { productName: 'Arroz Selecto', quantity: 1.5, unitPrice: 45, taxRate: 0, subtotal: 67.5, product: { unit: 'libra' } },
      { productName: 'Refresco', quantity: 3, unitPrice: 40, taxRate: 18, subtotal: 120, product: { unit: 'unidad' } },
    ],
  };
  const html = generateThermalReceiptHTML(venta, 'invoice', profile, null, { fullName: 'Ana Pérez', employeeId: 'EMP-7', id: 'uuid-interno' });
  it('título, e-NCF, unidad en palabras e indicador E', () => {
    expect(html).toContain('FACTURA DE CONSUMO ELECTRÓNICA');
    expect(html).toContain('e-NCF E320000000005');
    expect(html).toContain('1.5 libras');
    expect(html).toContain('<b>E</b> Arroz Selecto');
    expect(html).not.toContain('<b>E</b> Refresco');
  });
  it('subtotal gravado y exento, ITBIS por línea', () => {
    expect(html).toMatch(/<span>Subtotal gravado<\/span><span>120\.00/);
    expect(html).toMatch(/<span>Subtotal exento<\/span><span>67\.50/);
    expect(html).toContain('ITBIS 21.60');
  });
  it('consumo sin cliente no imprime el bloque del cliente', () => {
    expect(html).not.toContain('Cliente:');
  });
  it('QR, código de seguridad, firma y quien atendió', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('Código de seguridad: Ab12Cd');
    expect(html).toContain('Fecha de firma digital: 24-11-2026 11:00:00');
    expect(html).toContain('Atendido por: Ana Pérez · Emp. EMP-7');
    expect(html).not.toContain('uuid-interno');
  });
  it('nota de crédito: comprobante modificado y código en palabras', () => {
    const nota = generateThermalReceiptHTML({ ncfNumber: 'B0400000002', reason: 'Anulación de Factura: error', amount: 100, originalNcf: 'B0100000012' }, 'credit-note', profile, null, null);
    expect(nota).toContain('NCF modificado B0100000012');
    expect(nota).toContain('Anula el NCF modificado');
  });
});

describe('termLines: condición de pago impresa', () => {
  const snap = (name, schedule, discount = null) => ({ total: 1000, paymentTerm: { id: 'x', name, saleDate: '2026-11-25', discount, schedule } });
  const at = (d) => `${d}T12:00:00.000Z`;
  it('contado: sin líneas', () => {
    expect(termLines({ total: 1000 })).toEqual([]);
    expect(termLines({ total: 1000, paymentTerm: null })).toEqual([]);
  });
  it('un solo vencimiento', () => {
    expect(termLines(snap('30 días', [{ dueDate: at('2026-12-25'), amount: 1000 }]))).toEqual(['Condición: 30 días', 'Vence: 25/12/2026']);
  });
  it('varias cuotas', () => {
    expect(termLines(snap('50/50', [{ dueDate: at('2026-11-25'), amount: 500 }, { dueDate: at('2026-12-25'), amount: 500 }]))).toEqual([
      'Condición: 50/50', 'Cuota 1: 25/11/2026 — RD$ 500.00', 'Cuota 2: 25/12/2026 — RD$ 500.00',
    ]);
  });
  it('descuento con saleDate inválida: omite la línea sin lanzar', () => {
    const inv = snap('x', [{ dueDate: at('2026-12-25'), amount: 1000 }], { percent: 2, days: 10 });
    inv.paymentTerm.saleDate = undefined;
    expect(termLines(inv)).toEqual(['Condición: x', 'Vence: 25/12/2026']);
  });
  it('con descuento por pronto pago', () => {
    expect(termLines(snap('30 días, 2 % a 10 días', [{ dueDate: at('2026-12-25'), amount: 1000 }], { percent: 2, days: 10 }))).toEqual([
      'Condición: 30 días, 2 % a 10 días', 'Vence: 25/12/2026', '2 % de descuento si paga todo antes del 05/12/2026',
    ]);
  });
});

describe('lateNoteInfo: nota tardía', () => {
  const inv = { date: new Date('2026-11-01T15:00:00Z'), billedDate: new Date('2026-11-01T15:00:00Z'), pricesIncludeTax: false, items: [
    { id: 'i1', productName: 'Taza', quantity: 2, unitPrice: 300, discountPercent: 0, taxRate: 18 },
    { id: 'i2', productName: 'Libro', quantity: 1, unitPrice: 354, discountPercent: 0, taxRate: 0 } ] };
  const note = (d) => ({ amount: 354, createdAt: new Date(d), items: [{ itemId: 'i1', quantity: 1 }] });
  it('tardía: total = base + exento e ITBIS que asume la empresa', () => {
    expect(lateNoteInfo(note('2026-12-02T15:00:00Z'), inv)).toEqual({ total: 300, itbis: 54 });
  });
  it('30 días o menos, o sin factura: null', () => {
    expect(lateNoteInfo(note('2026-12-01T15:00:00Z'), inv)).toBeNull();
    expect(lateNoteInfo(note('2026-12-02T15:00:00Z'), null)).toBeNull();
  });
});

describe('impresión térmica de la nota tardía', () => {
  const base = { ncfNumber: 'B0400000002', reason: 'Reembolso: x', amount: 354, originalNcf: 'B0100000012' };
  it('muestra ITBIS 0, total sin ITBIS y la leyenda', () => {
    const html = generateThermalReceiptHTML({ ...base, lateNote: { total: 300, itbis: 54 } }, 'credit-note', {}, null, null);
    expect(html).toContain('Nota emitida después de 30 días: sin ITBIS (Reglamento 293-11)');
    expect(html).toContain('ITBIS');
    expect(html).toContain('300.00');
  });
  it('nota de 30 días o menos: sin leyenda', () => {
    expect(generateThermalReceiptHTML(base, 'credit-note', {}, null, null)).not.toContain('Reglamento 293-11');
  });
});
