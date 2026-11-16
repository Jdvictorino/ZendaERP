// Número de empleado: EMP-00001, secuencial por empresa. Lo asigna siempre el servidor
// (el cliente no lo puede elegir ni cambiar) y la base de datos lo hace único por empresa.
export const formatEmployeeId = (n) => `EMP-${String(n).padStart(5, '0')}`;

const PATTERN = /^EMP-(\d+)$/;

// Usar dentro de una transacción: el bloqueo evita que dos altas a la vez reciban el mismo número
export async function nextEmployeeId(tx, companyId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`employee:${companyId}`}))::text`;
  const rows = await tx.user.findMany({
    where: { companyId, employeeId: { startsWith: 'EMP-' } },
    select: { employeeId: true }
  });
  const last = rows.reduce((max, r) => Math.max(max, Number(PATTERN.exec(r.employeeId)?.[1] || 0)), 0);
  return formatEmployeeId(last + 1);
}
