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
