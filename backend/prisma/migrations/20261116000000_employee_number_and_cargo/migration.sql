-- Número de empleado estándar (EMP-00001) por empresa: el administrador principal primero y luego por antigüedad.
-- Reemplaza los números aleatorios anteriores (NE#####), que podían repetirse.
UPDATE "users" AS u
SET "employeeId" = 'EMP-' || LPAD(s.n::text, 5, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "isAdmin" DESC, "createdAt", id) AS n
  FROM "users"
) AS s
WHERE u.id = s.id;

-- El administrador principal que no tenía cargo guardado queda como Administrador
UPDATE "users" SET "cargo" = 'Administrador' WHERE "isAdmin" = true AND ("cargo" IS NULL OR "cargo" = '');

CREATE UNIQUE INDEX "users_companyId_employeeId_key" ON "users"("companyId", "employeeId");
