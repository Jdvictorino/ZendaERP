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
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(300, 2); // tardía: sin ITBIS, solo la base
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(sumTotals(ECF.Encabezado.Totales), 2);
  });
});

describe('E34 tardío (más de 30 días): sin ITBIS', () => {
  const lines = [{ productName: 'Taza', quantity: 1, unitPrice: 300, discountPercent: 0, taxRate: 18 }];
  const mk = (createdAt) => buildEcfFromNote({ amount: 354, reason: 'Taza rota', createdAt }, invoice, company, 'E34', 'E340000000005', sequence, { lines });

  it('líneas exentas (indicador 4), MontoExento = base y sin ITBIS; total = base', () => {
    const { ECF } = mk(new Date('2026-12-20T15:00:00Z'));
    const { Totales, IdDoc } = ECF.Encabezado;
    expect(IdDoc.IndicadorNotaCredito).toBe('1');
    const items = [ECF.DetallesItems.Item].flat();
    expect(items.map((i) => i.IndicadorFacturacion)).toEqual(['4']);
    expect(Totales.MontoExento).toBe('300.00');
    expect(Number(Totales.MontoGravadoTotal || 0)).toBe(0);
    expect(Number(Totales.TotalITBIS || 0)).toBe(0); // igual que cualquier factura toda exenta (el builder emite los totales ITBIS en 0)
    expect(Totales.MontoTotal).toBe('300.00');
    expect(items[0].MontoItem).toBe('300.00');
  });
  it('30 días justos: sigue con ITBIS 18% (354 = 300 + 54)', () => {
    const { ECF } = mk(new Date('2026-11-30T15:00:00Z'));
    expect(ECF.Encabezado.IdDoc.IndicadorNotaCredito).toBe('0');
    expect([ECF.DetallesItems.Item].flat()[0].IndicadorFacturacion).toBe('1');
    expect(ECF.Encabezado.Totales).toMatchObject({ MontoGravadoTotal: '300.00', TotalITBIS: '54.00', MontoTotal: '354.00' });
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

describe('nota sobre factura vieja (ITBIS incluido)', () => {
  it('nota de crédito total sobre factura vieja: MontoTotal = monto de la nota', () => {
    const items = [
      { productName: 'A', quantity: 2, unitPrice: 118, subtotal: 200, discountPercent: 0, taxRate: 18 },
      { productName: 'B', quantity: 1, unitPrice: 50, subtotal: 50, discountPercent: 0, taxRate: 0 },
    ];
    const inv = { date: invoice.date, paymentMethod: 'Efectivo', customerRnc: '101010101', pricesIncludeTax: true, ncfNumber: 'E310000000003', items, total: 286 };
    const { ECF } = buildEcfFromNote({ amount: 286, reason: 'Devolución' }, inv, company, 'E34', 'E340000000001', sequence, { full: true });
    expect(ECF.Encabezado.Totales.MontoTotal).toBe('286.00');
    expect(Number(ECF.Encabezado.Totales.MontoTotal)).toBeCloseTo(sumTotals(ECF.Encabezado.Totales), 2);
  });
});

describe('Notas sobre una factura con plazo', () => {
  const conPlazo = { ...invoice, paymentTerm: { id: 'x', name: '30 días', saleDate: '2026-11-01', discount: null, schedule: [{ dueDate: '2026-12-01T12:00:00.000Z', amount: 1062 }] } };
  it.each(['E33', 'E34'])('%s no hereda FechaLimitePago ni TipoPago 2', (tipo) => {
    const note = { amount: 118, reason: 'Flete', createdAt: new Date('2026-11-10T15:00:00Z') };
    const a = buildEcfFromNote(note, conPlazo, company, tipo, `${tipo}0000000001`, sequence).ECF.Encabezado.IdDoc;
    const b = buildEcfFromNote(note, invoice, company, tipo, `${tipo}0000000001`, sequence).ECF.Encabezado.IdDoc;
    expect(a.FechaLimitePago).toBeUndefined();
    expect(a).toEqual(b);
  });
});
