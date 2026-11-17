import { httpError } from './ncfService.js';

// shortcut: denylist, no un rol de BD de solo lectura; frena un token robado, no a quien ya tiene shell. Mejorar con un rol dedicado.
// Al inicio de la sentencia: así UPDATE … SET y ON CONFLICT DO NOTHING siguen permitidos
const DENIED_START = /^\s*(do|execute|copy|set|reset|discard|begin|commit|rollback|start\s+transaction|savepoint)\b/i;
const DENIED_FN = /\b(query_to_xml\w*|table_to_xml\w*|cursor_to_xml|dblink\w*|lo_import|lo_export|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_terminate_backend|pg_cancel_backend)\b/i;

export function checkSql(sql) {
  const s = String(sql || '').trim();
  if (!s) return 'Escribe una consulta';
  // shortcut: un ';' dentro de un literal también se rechaza; basta para una consola de un solo dueño
  if (s.replace(/;\s*$/, '').includes(';')) return 'Una sola sentencia por consulta';
  if (/\bcopy\b[\s\S]*\bprogram\b/i.test(s)) return 'COPY … PROGRAM no está permitido';
  if (/platform_security|platform_audit_log/i.test(s)) return 'Esa tabla no se puede consultar desde aquí';
  if (DENIED_START.test(s.replace(/^(\s*(--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/))+/, '')) || DENIED_FN.test(s)) return 'Esta instrucción no está permitida en el editor.';
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
