// @vitest-environment node
// Comprobantes que emite la empresa al comprar (B11/B13/B17 → E41/E43/E47), 606 y QR impreso
import { vi } from 'vitest';
import { buildEcfFromExpense, ecfToXml } from '../backend/src/services/ecfXmlBuilder.js';
import { generate606Data } from '../src/utils/dgiiReportGenerator.js';

vi.mock('../backend/src/db.js', () => ({ default: {} }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/services/ecfService.js', () => ({ emitExpenseEcf: vi.fn(), generateENCF: vi.fn() }));
vi.mock('../src/api/client.js', () => ({ default: {} }));
const { voucherProblem } = await import('../backend/src/routes/expenses.js');
const { qrModules, qrSvg } = await import('../src/utils/ecfPrint.js');

const company = { rnc: '131000000', name: 'Empresa Prueba' };
const sequence = { fechaVencimiento: new Date('2027-12-31T00:00:00Z') };
const compra = {
  invoiceDate: new Date('2026-11-15T15:00:00Z'), rncCedula: '001-1234567-8', supplierName: 'Juan Pérez',
  montoBienes: 1000, montoServicios: 2000, itbisFacturado: 540, itbisRetenido: 540, montoRetencionIsr: 200,
  paymentType: '01', description: 'Reparación de mobiliario',
};

describe('E41 Comprobante de Compras', () => {
  const { ECF } = buildEcfFromExpense(compra, company, 'E41', 'E410000000001', sequence);
  const items = [ECF.DetallesItems.Item].flat();

  it('lleva al vendedor en Comprador y no lleva TipoIngresos', () => {
    expect(ECF.Encabezado.Comprador).toEqual({ RNCComprador: '00112345678', RazonSocialComprador: 'Juan Pérez' });
    expect(ECF.Encabezado.IdDoc.TipoIngresos).toBeUndefined();
    expect(ECF.Encabezado.IdDoc.FechaVencimientoSecuencia).toBe('31-12-2027');
  });

  it('retención en cada línea: ITBIS según el peso de la línea y el ISR en los servicios', () => {
    expect(items.map((i) => i.Retencion.MontoITBISRetenido)).toEqual(['180.00', '360.00']);
    expect(items[0].Retencion.MontoISRRetenido).toBeUndefined();
    expect(items[1].Retencion.MontoISRRetenido).toBe('200.00');
    expect(items.every((i) => i.UnidadMedida === '43' && i.IndicadorFacturacion === '1')).toBe(true);
    expect(ECF.Encabezado.Totales).toMatchObject({ MontoGravadoTotal: '3000.00', TotalITBIS: '540.00', MontoTotal: '3540.00', TotalITBISRetenido: '540.00', TotalISRRetencion: '200.00' });
  });

  it('en el XML la retención va entre el indicador de facturación y el nombre del ítem', () => {
    const xml = ecfToXml(buildEcfFromExpense(compra, company, 'E41', 'E410000000001', sequence));
    expect(xml.indexOf('<IndicadorFacturacion>')).toBeLessThan(xml.indexOf('<Retencion>'));
    expect(xml.indexOf('<Retencion>')).toBeLessThan(xml.indexOf('<NombreItem>'));
  });
});

describe('E43 Gastos Menores y E47 Pagos al Exterior', () => {
  it('E43: sin comprador ni retenciones, todo exento', () => {
    const { ECF } = buildEcfFromExpense({ ...compra, itbisFacturado: 0 }, company, 'E43', 'E430000000001', sequence);
    const items = [ECF.DetallesItems.Item].flat();
    expect(ECF.Encabezado.Comprador).toBeUndefined();
    expect(items.every((i) => i.IndicadorFacturacion === '4' && !i.Retencion)).toBe(true);
    expect(ECF.Encabezado.Totales).toEqual({ MontoExento: '3000.00', MontoTotal: '3000.00' });
  });

  it('E47: exento, con retención de ISR y sin ITBIS retenido', () => {
    const { ECF } = buildEcfFromExpense({ ...compra, montoBienes: 0, itbisFacturado: 540 }, company, 'E47', 'E470000000001', sequence);
    const [item] = [ECF.DetallesItems.Item].flat();
    expect(item.IndicadorFacturacion).toBe('4');
    expect(item.Retencion).toEqual({ IndicadorAgenteRetencionoPercepcion: '1', MontoISRRetenido: '200.00' });
    expect(ECF.Encabezado.Totales).toMatchObject({ MontoExento: '2000.00', MontoTotal: '2000.00', TotalISRRetencion: '200.00' });
    expect(ECF.Encabezado.Totales.TotalITBISRetenido).toBeUndefined();
  });
});

describe('voucherProblem: lo que cada comprobante exige', () => {
  const base = { montoBienes: 100, montoServicios: 0, itbisFacturado: 0, montoRetencionIsr: 0, rncCedula: '00112345678', supplierName: 'Juan' };
  it('B11 pide cédula, ITBIS al 18 % y servicios para retener ISR', () => {
    expect(voucherProblem('B11', base)).toBe(null);
    expect(voucherProblem('B11', { ...base, rncCedula: '123' })).toContain('cédula');
    expect(voucherProblem('B11', { ...base, itbisFacturado: 10 })).toContain('18 %');
    expect(voucherProblem('B11', { ...base, montoRetencionIsr: 10 })).toContain('servicios');
  });
  it('sin monto no se emite nada; B13 no pide vendedor', () => {
    expect(voucherProblem('B13', { ...base, montoBienes: 0 })).toContain('monto');
    expect(voucherProblem('B13', { ...base, rncCedula: '', supplierName: '' })).toBe(null);
  });
});

describe('606', () => {
  it('usa los campos guardados y deja fuera los pagos al exterior (van en el 609)', () => {
    const rows = generate606Data([
      { ...compra, ncf: 'B1100000001', issuedVoucher: 'B11', expenseType: '02-GASTOS POR TRABAJOS', montoFacturado: 3000, retencionIsrTipo: '2', propina: 0 },
      { ...compra, ncf: 'B1700000001', issuedVoucher: 'B17' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 'RNC o Cédula': '00112345678', 'Tipo Id': '2', 'Tipo Bienes y Servicios Comprados': '02', 'Total Monto Facturado': 3000, 'Monto Facturado en Servicios': 2000, 'Tipo de Retención en ISR': '2', 'Monto Retención Renta': 200, 'Forma de Pago': '01' });
  });
});

describe('QR de la representación impresa', () => {
  it('genera una matriz cuadrada y un SVG sin servicios externos', () => {
    const url = 'https://ecf.dgii.gov.do/testecf/ConsultaTimbre?RncEmisor=131000000&RncComprador=101010101&ENCF=E310000000010&FechaEmision=01-11-2026&MontoTotal=1062.00&FechaFirma=01-11-2026%2010:00:00&CodigoSeguridad=AbC123';
    const m = qrModules(url);
    expect(m.length).toBeGreaterThan(20);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect(qrSvg(url)).toMatch(/^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  });
});

describe('609, 607 y PDF del comprobante', async () => {
  const { generate609Data, generate607Data, isFiscalInvoice } = await import('../src/utils/dgiiReportGenerator.js');
  const { voucherDocData } = await import('../src/utils/pdfGenerator.js');

  it('609: solo pagos al exterior, con los datos que pide la plantilla', () => {
    const rows = generate609Data([
      { ...compra, issuedVoucher: 'B17', ncf: 'B1700000001', montoFacturado: 2000, paymentDate: '2026-11-20T00:00:00.000Z', foreignPayment: { idType: 'Persona Jurídica', taxId: '98-765', country: 'US', serviceType: 'Gastos de representación', serviceDetail: 'Publicidad', relatedParty: false, documentNumber: 'INV-77' } },
      { ...compra, issuedVoucher: 'B11' },
    ]);
    expect(rows).toEqual([expect.objectContaining({ 'ID Tributaria': '98-765', 'País de Destino': 'US', 'Detalle del Servicio Adquirido': 'Publicidad', 'Parte Relacionada': 'No', 'Número de Documento': 'INV-77', 'Monto Facturado': 2000, 'Renta Presunta': 2000, 'ISR Retenido': 200, 'Fecha de Retención ISR': '20261120' })]);
  });

  it('607/608 leen las facturas como las entrega la API (ncfNumber, customerRnc, taxAmount)', () => {
    const inv = { ncfNumber: 'B0100000005', ncfType: 'B01', customerRnc: '1-01-01010-1', taxAmount: '180.00', subtotal: 1000, total: 1180, status: 'Pagado', date: '2026-11-10' };
    expect(isFiscalInvoice(inv)).toBe(true);
    expect(isFiscalInvoice({ ncfNumber: 'NoFiscal' })).toBe(false);
    expect(generate607Data([inv])[0]).toMatchObject({ 'NCF': 'B0100000005', 'RNC o Cédula': '101010101', 'Tipo Id': '1', 'ITBIS Facturado': 180 });
  });

  it('el PDF del B11 lleva totales, retenciones y la firma del vendedor', () => {
    const d = voucherDocData({ ...compra, issuedVoucher: 'B11', ncf: 'B1100000003' }, 'DOP');
    expect(d).toMatchObject({ ncfNumber: 'B1100000003', montoGravado: 3000, itbis: 540, total: 3540, customerName: 'Juan Pérez' });
    expect(d.items.map((i) => i.productName)).toEqual(['Bienes', 'Servicios']);
    expect(d.notes).toContain('ISR retenido');
    expect(d.notes).toContain('firma del vendedor');
    expect(voucherDocData({ ...compra, itbisFacturado: 0, issuedVoucher: 'B13' }).montoExento).toBe(3000);
  });

  it('B17 exige los datos del 609', () => {
    const base = { montoBienes: 0, montoServicios: 100, itbisFacturado: 0, montoRetencionIsr: 0, supplierName: 'Acme Inc.' };
    expect(voucherProblem('B17', base)).toContain('609');
    expect(voucherProblem('B17', { ...base, foreignPayment: { country: 'US', taxId: '1', serviceType: 'Gastos de seguros', serviceDetail: 'Gastos de seguros' } })).toBe(null);
  });
});
