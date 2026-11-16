import { buildLabelPayload } from '../src/utils/shipping.js';

describe('buildLabelPayload confirmUrl', () => {
  it('usa el qrCode del servidor si trae token', () => {
    const qr = 'https://app.zenda/delivery/confirm?token=abc';
    expect(buildLabelPayload({ qrCode: qr, deliveryToken: 'abc' }).confirmUrl).toBe(qr);
  });
  it('ignora un qrCode viejo con ?id= y arma desde el token', () => {
    const p = buildLabelPayload({ qrCode: 'https://x/delivery/confirm?id=9', deliveryToken: 'tok' });
    expect(p.confirmUrl).toContain('token=tok');
    expect(p.confirmUrl).not.toContain('id=9');
  });
});
