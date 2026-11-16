// @vitest-environment node
// GET /api/expenses/report/606: el mes completo (último día con hora incluido) y sin los pagos al exterior (van al 609).
import { vi } from 'vitest';

const findMany = vi.fn(async () => []);
vi.mock('../backend/src/db.js', () => ({ default: { expense: { findMany: (...a) => findMany(...a) } } }));
vi.mock('../backend/src/middleware/auth.js', () => ({ authenticate: (q, s, n) => n(), authorize: () => (q, s, n) => n() }));
vi.mock('../backend/src/services/ecfService.js', () => ({ emitExpenseEcf: vi.fn() }));

const { default: router } = await import('../backend/src/routes/expenses.js');
const handler = router.stack.find((l) => l.route?.path === '/report/606').route.stack[0].handle;

async function run(query) {
  const res = { json: (b) => { res.body = b; return res; }, status: (c) => { res.code = c; return res; } };
  await handler({ query, companyId: 'c1' }, res, (e) => { throw e; });
  return res;
}

describe('reporte 606 del servidor', () => {
  it('el rango cubre el último día del mes aunque tenga hora', async () => {
    await run({ year: '2026', month: '11' });
    const { invoiceDate } = findMany.mock.calls.at(-1)[0].where;
    expect(invoiceDate.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    const lastDayNoon = new Date('2026-11-30T12:00:00Z');
    const inRange = (d) => d >= invoiceDate.gte && (invoiceDate.lt ? d < invoiceDate.lt : d <= invoiceDate.lte);
    expect(inRange(lastDayNoon)).toBe(true);
    expect(inRange(new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });

  it('deja fuera los comprobantes de pago al exterior (B17/E47) y conserva los que no emitieron comprobante', async () => {
    await run({ year: '2026', month: '11' });
    const { OR } = findMany.mock.calls.at(-1)[0].where;
    expect(OR).toEqual([{ issuedVoucher: null }, { issuedVoucher: { notIn: ['B17', 'E47'] } }]);
  });
});
