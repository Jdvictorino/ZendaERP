// @vitest-environment node
// Reintento de un e-CF: si la DGII ya lo tiene, no se reenvía (un reenvío vuelve "Rechazado").
import { vi } from 'vitest';

const doc = {
  id: 'd1', companyId: 'c1', tipoEcf: 'E31', eNcf: 'E310000000007', montoTotal: '1180.00',
  rncEmisor: '101000000', rncComprador: '131000000', securityCode: 'ABC123', xmlSigned: '<ECF/>',
  dgiiStatus: 'error', trackId: null, enviadoAt: null,
  company: { rnc: '101000000', ecfCertificateB64: 'x', ecfCertificatePass: 'x', ecfEnvironment: 'test' },
};
const client = { authenticate: vi.fn(), checkDocumentStatus: vi.fn(), sendElectronicDocument: vi.fn(), sendSummary: vi.fn() };
const updates = [];

vi.mock('../backend/src/db.js', () => ({
  default: {
    ecfDocument: {
      findUnique: vi.fn(async () => ({ ...doc, ...Object.assign({}, ...updates) })),
      update: vi.fn(async ({ data }) => { updates.push(data); }),
    },
  },
}));
// el servicio resuelve dgii-ecf desde backend/node_modules
vi.mock('../backend/node_modules/dgii-ecf/dist/index.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    default: vi.fn(function () { return client; }),
    P12Reader: vi.fn(function () { return { getKeyFromStringBase64: () => ({ key: 'k', cert: 'c' }) }; }),
    Signature: vi.fn(function () { return { signXml: (x) => x }; }),
  };
});

const { retryEcfSend } = await import('../backend/src/services/ecfService.js');

beforeEach(() => { updates.length = 0; vi.clearAllMocks(); });

describe('retryEcfSend', () => {
  it('no reenvía un e-CF que la DGII ya aceptó; toma su estado y trackId', async () => {
    client.checkDocumentStatus.mockResolvedValue({ status: 'Aceptado', trackId: 't-9', source: 'ConsultaTrackIds' });
    const r = await retryEcfSend('d1', 'c1');
    expect(client.sendElectronicDocument).not.toHaveBeenCalled();
    expect(r.success).toBe(true);
    expect(r.document).toMatchObject({ dgiiStatus: 'aceptado', trackId: 't-9' });
    expect(client.checkDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ encf: 'E310000000007', montoTotal: '1180.00' }));
  });

  it('reenvía cuando la DGII no lo encontró', async () => {
    client.checkDocumentStatus.mockResolvedValue({ status: 'No encontrado', source: 'ConsultaTrackIds' });
    client.sendElectronicDocument.mockResolvedValue({ trackId: 't-new' });
    const r = await retryEcfSend('d1', 'c1');
    expect(client.sendElectronicDocument).toHaveBeenCalledOnce();
    expect(r.document).toMatchObject({ dgiiStatus: 'enviado', trackId: 't-new' });
  });

  it('si la consulta falla, no reenvía a ciegas: queda en error para reintentar', async () => {
    client.checkDocumentStatus.mockRejectedValue(new Error('DGII no responde'));
    const r = await retryEcfSend('d1', 'c1');
    expect(client.sendElectronicDocument).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: false, error: 'DGII no responde' });
  });
});

describe('retryEcfSend con un e-CF rechazado', () => {
  it('no lo reenvía: hay que facturar de nuevo con otro e-NCF', async () => {
    const { default: prisma } = await import('../backend/src/db.js');
    prisma.ecfDocument.findUnique.mockResolvedValueOnce({ ...doc, dgiiStatus: 'rechazado' });
    await expect(retryEcfSend('d1', 'c1')).rejects.toThrow(/rechazado/);
    expect(client.checkDocumentStatus).not.toHaveBeenCalled();
    expect(client.sendElectronicDocument).not.toHaveBeenCalled();
  });
});

describe('getQRCodeUrl', () => {
  const xml = (total) => `<ECF><Encabezado><IdDoc><FechaEmision>09-11-2026</FechaEmision></IdDoc><Totales><MontoTotal>${total}</MontoTotal></Totales></Encabezado><FechaHoraFirma>09-11-2026 21:30:00</FechaHoraFirma></ECF>`;

  it('e-CF de crédito fiscal: lleva fecha de emisión y de firma del XML firmado', async () => {
    const { getQRCodeUrl } = await import('../backend/src/services/ecfService.js');
    const url = getQRCodeUrl({ ...doc, xmlSigned: xml('1180.00') }, doc.company, 'test');
    expect(url).toContain('/consultatimbre?');
    expect(url).toContain('fechaemision=09-11-2026');
    expect(url).toContain('fechafirma=09-11-2026%2021%3A30%3A00');
    expect(url).toContain('montototal=1180.00');
  });

  it('E32 de RD$250,000 o más usa la consulta de e-CF, no la de factura de consumo', async () => {
    const { getQRCodeUrl } = await import('../backend/src/services/ecfService.js');
    const big = getQRCodeUrl({ ...doc, tipoEcf: 'E32', eNcf: 'E320000000001', xmlSigned: xml('300000.00') }, doc.company, 'test');
    const small = getQRCodeUrl({ ...doc, tipoEcf: 'E32', eNcf: 'E320000000002', xmlSigned: xml('1390.00') }, doc.company, 'test');
    expect(big).toContain('/consultatimbre?');
    expect(small).toContain('/consultatimbrefc?');
  });
});
