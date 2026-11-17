// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkSql, runSql } from '../backend/src/services/sqlConsole.js';

const roErr = () => Object.assign(new Error('x'), { code: 'P2010', meta: { code: '25006' } });
const fake = ({ rows = [], affected = 3, readFails = false } = {}) => {
  const calls = [];
  const tx = {
    $executeRawUnsafe: async (q) => { calls.push(q); return affected; },
    $queryRawUnsafe: async (q) => { calls.push(q); if (readFails) throw roErr(); return rows; }
  };
  return { calls, $transaction: (fn) => fn(tx) };
};

describe('checkSql', () => {
  it('valida', () => {
    expect(checkSql('select 1;')).toBeNull();
    expect(checkSql('select 1; drop table x')).toBe('Una sola sentencia por consulta');
    expect(checkSql("COPY t TO PROGRAM 'x'")).toBe('COPY … PROGRAM no está permitido');
    expect(checkSql('select * from platform_audit_log')).toBe('Esa tabla no se puede consultar desde aquí');
    expect(checkSql('')).toBe('Escribe una consulta');
  });
  it('rechaza instrucciones peligrosas', () => {
    for (const q of ["select query_to_xml('select 1', true, true, '')", 'DO $$ BEGIN PERFORM 1; END $$', "copy customers to '/tmp/x'",
      'set statement_timeout = 0', 'reset all', 'select pg_terminate_backend(1)']) {
      expect(checkSql(q), q).not.toBeNull();
    }
    expect(checkSql("copy customers to '/tmp/x'")).toBe('Esta instrucción no está permitida en el editor.');
  });
  it('no confunde columnas con palabras reservadas', () => {
    expect(checkSql('select offset_set, reset_at from t')).toBeNull();
  });
});

describe('runSql', () => {
  it('lectura: tope de 500 filas', async () => {
    const p = fake({ rows: Array.from({ length: 600 }, (_, i) => ({ i })) });
    const r = await runSql(p, 'select 1');
    expect(r).toMatchObject({ rowCount: 600, wrote: false });
    expect(r.rows).toHaveLength(500);
    expect(p.calls[0]).toBe('SET TRANSACTION READ ONLY');
  });
  it('escritura sin confirmar → 409', async () => {
    await expect(runSql(fake({ readFails: true }), 'delete from x')).rejects.toMatchObject({ status: 409, message: 'Esta consulta cambia datos: confírmala' });
  });
  it('escritura confirmada', async () => {
    const p = fake({ readFails: true });
    expect(await runSql(p, 'delete from x', { confirm: true })).toEqual({ rows: [], rowCount: 3, wrote: true });
    expect(p.calls.slice(-2)).toEqual(["SET LOCAL statement_timeout = '15s'", 'delete from x']);
  });
  it('otro error de Postgres → 400', async () => {
    const p = { $transaction: async () => { throw Object.assign(new Error('boom'), { code: 'P2010', meta: { code: '42P01', message: 'relation "x" does not exist' } }); } };
    await expect(runSql(p, 'select * from x')).rejects.toMatchObject({ status: 400, message: 'relation "x" does not exist' });
  });
});
