import { describe, it, expect } from 'vitest';
import { customerTaxId, invoiceTitle, showNotesColumn } from '../src/utils/docLines.js';
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
    expect(html).not.toContain('RNC/Ced');
  });
  it('con RNC lo imprime y el título sigue al comprobante', () => {
    const html = generateThermalReceiptHTML({ ...docData, ncfType: 'B01', ncfNumber: 'B0100000012' }, 'invoice', {}, { name: 'Empresa', rnc: '100000004' }, null);
    expect(html).toContain('RNC/Ced: 100000004');
    expect(html).toContain('FACTURA DE CRÉDITO FISCAL');
  });
});
