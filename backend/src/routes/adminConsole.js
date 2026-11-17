import { Router } from 'express';
import prisma from '../db.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { audit } from '../services/platformAudit.js';
import { checkSql, runSql } from '../services/sqlConsole.js';
import { httpError } from '../services/ncfService.js';
import { requireConsole, ticketStore, setupTotp, confirmTotp, unlockConsole } from '../services/consoleAuth.js';

const router = Router();
router.use(requirePlatformAdmin);

const flow = (fn) => async (req, res, next) => {
  try {
    const r = await fn(req);
    res.status(r.status).json(r.body);
  } catch (e) { next(e); }
};

router.get('/totp/status', flow(async () => {
  const sec = await prisma.platformSecurity.findUnique({ where: { id: 1 } });
  return { status: 200, body: { configured: !!sec?.totpConfirmedAt } };
}));
router.post('/totp/setup', flow((req) => setupTotp(prisma, req)));
router.post('/totp/confirm', flow((req) => confirmTotp(prisma, req, req.body?.code)));
router.post('/unlock', flow((req) => unlockConsole(prisma, req, req.body?.code)));

router.post('/ticket', requireConsole, (req, res) => {
  res.json({ ticket: ticketStore.issue(req.platformOwner.email) });
});

const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
const listTables = () => prisma.$queryRawUnsafe(
  `SELECT c.relname AS name, GREATEST(c.reltuples, 0)::bigint AS rows FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT IN ('platform_security', '_prisma_migrations')
   ORDER BY c.relname`);

router.get('/db/tables', requireConsole, flow(async () => ({ status: 200, body: plain(await listTables()) })));

router.get('/db/tables/:name', requireConsole, flow(async (req) => {
  const name = req.params.name;
  if (!(await listTables()).some((t) => t.name === name)) throw httpError(404, 'Tabla no encontrada');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const search = String(req.query.search || '');
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, name);
  const q = `"${name.replace(/"/g, '""')}"`;
  const textCols = cols.filter((c) => ['text', 'character varying'].includes(c.data_type));
  const where = search && textCols.length
    ? `WHERE ${textCols.map((c) => `"${c.column_name.replace(/"/g, '""')}"::text ILIKE '%' || $1 || '%'`).join(' OR ')}` : '';
  const args = where ? [search] : [];
  const order = cols.length ? `ORDER BY "${cols[0].column_name.replace(/"/g, '""')}"` : '';
  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT * FROM ${q} ${where} ${order} LIMIT 50 OFFSET ${(page - 1) * 50}`, ...args),
    prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM ${q} ${where}`, ...args)
  ]);
  return { status: 200, body: plain({ columns: cols.map((c) => c.column_name), rows, total: n }) };
}));

router.post('/db/query', requireConsole, async (req, res, next) => {
  const sql = String(req.body?.sql || '');
  const log = (detail) => audit(prisma, { req, kind: 'sql', detail: `${sql} → ${detail}` });
  try {
    const bad = checkSql(sql);
    if (bad) throw httpError(400, bad);
    const r = await runSql(prisma, sql, { confirm: req.body?.confirm });
    await log(r.wrote ? `${r.rowCount} filas afectadas` : `${r.rowCount} filas`);
    res.json(plain(r));
  } catch (e) {
    await log(e.status === 409 ? 'requiere confirmación' : `error: ${e.message}`);
    next(e);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const where = req.query.kind ? { kind: String(req.query.kind) } : {};
    const [data, total] = await Promise.all([
      prisma.platformAuditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * 50, take: 50 }),
      prisma.platformAuditLog.count({ where })
    ]);
    res.json({ data, total });
  } catch (e) { next(e); }
});

export default router;
