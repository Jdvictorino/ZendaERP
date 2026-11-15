// @vitest-environment node
// Notas electrónicas (E33/E34) según el Formato e-CF v1.0 de la DGII
import { buildEcfFromNote, buildEcfFromInvoice, ecfToXml } from '../backend/src/services/ecfXmlBuilder.js';

const company = { rnc: '131000000', name: 'Empresa Prueba' };
const sequence = { fechaVencimiento: new Date('2027-12-31T00:00:00Z') };
const invoice = {
  date: new Date('2026-11-01T15:00:00Z'), ncfNumber: 'E310000000010', ncfType: 'E31', customerRnc: '101010101', customerName: 'Cliente SRL',
  paymentMethod: 'Efectivo', total: 1062,
  items: [
    { productName: 'Taza', quantity: 2, unitPrice: 300, discountPercent: 0, taxRate: 18 }, // 708 con ITBIS
    { productName: 'Libro', quantity: 1, unitPrice: 354, discountPercent: 0, taxRate: 0 },  // exento
  ],
};
const sumTotals = (t) => Number(t.MontoGravadoTotal || 0) + Number(t.MontoExento || 0) + Number(t.TotalITBIS || 0);

describe('E34 nota de crédito', () => {
  it('anulación total: código 1, sin vencimiento ni formas de pago, con IndicadorNotaCredito', () => {
    const note = { amount: 1062, reason: 'Devolución', createdAt: new Date('2026-11-10T15:00:00Z') };
    const { ECF } = buildEcfFromNote(note, invoice, company, 'E34', 'E340000000001', sequence, { full: true });
    const { IdDoc, Totales, Comprador } = ECF.Encabezado;
    expect(Object.keys(IdDoc).slice(0, 3)).toEqual(['TipoeCF', 'eNCF', 'IndicadorNotaCredito']);
    expect(IdDoc.IndicadorNotaCredito).toBe('0');
    expect(IdDoc.FechaVencimientoSecuencia).toBeUndefined();
    expect(IdDoc.TablaFormasPago).toBeUndefined();
    expect(ECF.InformacionReferencia).toMatchObject({ NCFModificado: 'E310000000010', FechaNCFModificado: '01-11-2026', CodigoModificacion: '1', RazonModificacion: 'Devolución' });
    expect(Comprador.RNCComprador).toBe('101010101');
    expect(ECF.Encabezado.Emisor.FechaEmision).toBe('10-11-2026');
    expect(Number(Totales.MontoTotal)).toBeCloseTo(sumTotals(Totales), 2);
    expect(Number(Totales.MontoTotal)).toBeCloseTo(1062, 0);
  });

  it('parcial por artículos devueltos: código 3 y solo esas líneas; más de 30 días → indicador 1', () => {
    const note = { amount: 354, reason: 'Una taza rota', createdAt: new Date('2026-12-20T15:00:00Z') };
    const lines = [{ productName: 'Taza', quantity: 1, unitPrice: 300, discountPercent: 0, taxRate: 18 }];
    const { ECF } = buildEcfFromNote(note, invoice, company, 'E34', 'E340000000002', sequence, { lines });
    expect(ECF.Encabezado.IdDoc.IndicadorNotaCredito).toBe('1');
    expect(ECF.InformacionReferencia.CodigoModificacion).toBe('3');
    expect([ECF.DetallesItems.Item].flat()).toHaveLength(1);
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(354, 2);
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(sumTotals(ECF.Encabezado.Totales), 2);
  });
});

describe('XML de la nota', () => {
  it('respeta el orden del esquema: IndicadorNotaCredito tras eNCF; InformacionReferencia antes de FechaHoraFirma', () => {
    const ecf = buildEcfFromNote({ amount: 1062, reason: 'Devolución', createdAt: new Date('2026-11-10T15:00:00Z') }, invoice, company, 'E34', 'E340000000003', sequence, { full: true });
    const xml = ecfToXml(ecf);
    const at = (tag) => xml.indexOf(`<${tag}>`);
    expect(at('eNCF')).toBeLessThan(at('IndicadorNotaCredito'));
    expect(at('IndicadorNotaCredito')).toBeLessThan(at('TipoIngresos'));
    expect(at('DetallesItems')).toBeLessThan(at('InformacionReferencia'));
    expect(at('InformacionReferencia')).toBeLessThan(at('FechaHoraFirma'));
  });
});

describe('E33 nota de débito y E32', () => {
  it('E33 lleva el vencimiento de su secuencia y corrige montos (código 3), sin IndicadorNotaCredito', () => {
    const { ECF } = buildEcfFromNote({ amount: 118, reason: 'Flete' }, invoice, company, 'E33', 'E330000000001', sequence);
    expect(ECF.Encabezado.IdDoc.FechaVencimientoSecuencia).toBe('31-12-2027');
    expect(ECF.Encabezado.IdDoc.IndicadorNotaCredito).toBeUndefined();
    expect(ECF.InformacionReferencia.CodigoModificacion).toBe('3');
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(sumTotals(ECF.Encabezado.Totales), 2);
  });

  it('la factura de consumo E32 no lleva fecha de vencimiento', () => {
    const { ECF } = buildEcfFromInvoice({ ...invoice, customerRnc: null }, company, 'E32', 'E320000000001', sequence);
    expect(ECF.Encabezado.IdDoc.FechaVencimientoSecuencia).toBeUndefined();
  });
});
