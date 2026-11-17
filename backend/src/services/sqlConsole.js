import { httpError } from './ncfService.js';

export function checkSql(sql) {
  const s = String(sql || '').trim();
  if (!s) return 'Escribe una consulta';
  // shortcut: un ';' dentro de un literal también se rechaza; basta para una consola de un solo dueño
  if (s.replace(/;\s*$/, '').includes(';')) return 'Una sola sentencia por consulta';
  if (/\bcopy\b[\s\S]*\bprogram\b/i.test(s)) return 'COPY … PROGRAM no está permitido';
  if (/platform_security|platform_audit_log/i.test(s)) return 'Esa tabla no se puede consultar desde aquí';
  return null;
}

const isReadOnlyErr = (e) => e?.meta?.code === '25006' || /25006|read-only transaction/i.test(e?.message || '');

export async function runSql(prisma, sql, { confirm } = {}) {
  const s = String(sql).trim().replace(/;\s*$/, '');
  const run = (write) => prisma.$transaction(async (tx) => {
    if (!write) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    return write ? tx.$executeRawUnsafe(s) : tx.$queryRawUnsafe(s);
  });
  try {
    const rows = await run(false);
    return { rows: rows.slice(0, 500), rowCount: rows.length, wrote: false };
  } catch (e) {
    if (isReadOnlyErr(e)) {
      if (confirm !== true) throw httpError(409, 'Esta consulta cambia datos: confírmala');
      try { return { rows: [], rowCount: await run(true), wrote: true }; } catch (e2) { throw pgError(e2); }
    }
    throw pgError(e);
  }
}

function pgError(e) {
  if (e.status) return e;
  return httpError(400, e?.meta?.message || String(e?.message || 'Error de base de datos').split('\n').pop());
}
