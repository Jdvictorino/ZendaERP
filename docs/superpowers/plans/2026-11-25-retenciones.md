# Retenciones de ITBIS e ISR · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La empresa propone sus retenciones en Gastos desde una tabla editable y registra las que le hacen en Cobros, con saldos, contabilidad y 606/607 correctos.

**Architecture:** Un módulo puro con dos copias idénticas (`src/utils/withholdings.js` y `backend/src/services/withholdings.js`): conceptos iniciales, validación, cálculo y saldo de factura. La tabla vive en `company.settings.withholdings`. `Invoice` gana tres columnas. La app usa el módulo en Gastos, Cobros, Cuentas por Pagar, contabilidad y 607.

**Tech Stack:** Express 4 + Prisma 5.22 + Postgres 16 (ESM), React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-retenciones-design.md`. Rama `fiscal-retenciones` desde `origin/main` deef8af.

## Global Constraints

- Valores iniciales exactos (todos "verifica con tu contador"): Honorarios profesionales (persona_fisica, 100 %, 15 %, tipo 2); Servicios técnicos (limpieza, fumigación…) (persona_fisica, 100 %, 2 %, tipo 3); Alquiler de local (persona_fisica, 100 %, 15 %, tipo 1); Compra a informal (B11) (informal, 100 %, 0 %, —); Servicios de empresas sujetos al 30 % (empresa, 30 %, 0 %, —); Proveedor del RST (any, 100 %, 0 %, —).
- Cálculo: `itbisRetenido = round2(itbisFacturado × itbisPercent / 100)`; `montoRetencionIsr = round2((montoBienes + montoServicios) × isrPercent / 100)`; `retencionIsrTipo = isrType` si `isrPercent > 0`, si no null.
- Saldo de factura: `total − amountPaid − itbisRetenido − retencionRenta` (nunca menor que 0). Estado `Pagado` si `amountPaid + itbisRetenido + retencionRenta ≥ total − 0.01`; `Pagado Parcialmente` si la suma > 0; si no `Pendiente` (salvo estados anulados, que no cambian).
- Tope: `amountPaid + itbisRetenido + retencionRenta ≤ total + 0.01`; `itbisRetenido ≤ ITBIS de la factura`; `retencionRenta ≤ base sin ITBIS`; reducir una retención guardada: solo gerente/administrador (misma regla que reducir `amountPaid`).
- Apps viejas: pagos sin los campos nuevos cuentan como 0; editar la tabla nunca cambia gastos ni facturas guardados; facturas y gastos sin retenciones no cambian de saldo, estado, contabilidad ni 607.
- Copias `src/utils/withholdings.js` y `backend/src/services/withholdings.js` idénticas desde la línea 2 (prueba como `test/tax.spec.js:67`).
- Pruebas por archivo con `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>` (la corrida completa se cuelga). Build con `npx -y node@22 node_modules/vite/bin/vite.js build`.
- Commits solo con rutas explícitas, mensaje en español, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Factura cobrada en dos partes con retención en la segunda: el saldo y el estado usan los totales acumulados.
- Gasto con retención en Cuentas por Pagar: se le debe al suplidor el total menos lo retenido; un pago por el neto lo deja saldado.
- Cambiar los montos de un gasto con concepto elegido recalcula; si el usuario escribió una retención a mano, no se pisa.
- Una empresa que nunca guardó la tabla ve los valores iniciales en Configuración y en Gastos.
- El cuadre de caja de un turno con un cobro con retención solo cuenta el dinero recibido.

---

### Task 1: Módulo de retenciones

**Files:** Create `src/utils/withholdings.js`, `backend/src/services/withholdings.js`. Test: `test/withholdings.spec.js`.

**Interfaces — Produces:**
- `DEFAULT_WITHHOLDINGS: Array<{ id, name, supplierTypes: string[], itbisPercent, isrPercent, isrType: string|null, active: true }>` (valores de las restricciones; ids estables: `honorarios`, `servicios-tecnicos`, `alquiler`, `informal`, `empresa-30`, `rst`).
- `withholdingsOf(settings) => Array` (la guardada o `DEFAULT_WITHHOLDINGS`).
- `conceptsFor(list, supplierType) => Array` (activos cuyo `supplierTypes` incluye el tipo o `'any'`).
- `withholdingFor(concept, { itbisFacturado, montoBienes, montoServicios }) => { itbisRetenido, montoRetencionIsr, retencionIsrTipo }`.
- `validateWithholdings(list) => string|null` (nombre obligatorio, porcentajes 0–100, `isrType` obligatorio si `isrPercent > 0` y dentro de '1'–'8', `supplierTypes` no vacío y de los valores válidos, ids únicos).
- `invoiceBalance(invoice) => number` y `invoiceStatus(invoice) => 'Pagado'|'Pagado Parcialmente'|'Pendiente'` (con `amountPaid`, `itbisRetenido`, `retencionRenta`, `total`; acepta Decimal como texto).

- [ ] Pruebas: honorarios sobre bienes 0 / servicios 10 000 / ITBIS 1 800 → ITBIS ret. 1 800, ISR 1 500, tipo '2'; empresa-30 → 540 / 0 / null; `conceptsFor` por tipo; validación (cada error); saldo/estado (1180 total, pagado 1000, ITBIS ret. 180 → 0 / Pagado; sin retenciones igual que hoy); copias idénticas.
- [ ] Implementar; correr; commit `Retenciones: módulo con conceptos iniciales, cálculo y saldo de factura`.

### Task 2: Servidor (configuración, factura y crédito)

**Files:** Modify `backend/src/routes/settings.js`, `backend/src/routes/invoices.js`, `backend/prisma/schema.prisma`. Create `backend/prisma/migrations/20261127000000_retenciones/migration.sql`. Test: `test/withholdings.spec.js` (helpers puros nuevos si los hay).

**Interfaces — Consumes:** Task 1. **Produces:**
- GET `/api/settings` devuelve `withholdings` (`withholdingsOf`). PUT acepta `withholdings` (validada con `validateWithholdings`, 400 con el mensaje), dentro del mismo `withSettingsLock`.
- `Invoice.itbisRetenido`, `Invoice.retencionRenta` (`Decimal(12,2) @default(0)`), `Invoice.retentionDate DateTime? @db.Date`.
- PUT `/api/invoices/:id` acepta `itbisRetenido`, `retencionRenta`, `retentionDate` con las reglas de tope, permisos y estado de las restricciones (el estado se calcula con `invoiceStatus` sobre los valores resultantes, también cuando solo cambia `amountPaid`).
- El límite de crédito (`pendingBalance` en POST `/api/invoices`) resta las retenciones.

- [ ] Prueba pura de la decisión de tope/estado; `npx prisma validate`; `node --check`; commit `Retenciones: tabla en Configuración y retenciones sufridas en la factura`.

### Task 3: Saldos, contabilidad y 607 en la app

**Files:** Modify `src/utils/chartOfAccounts.js`, `src/utils/dgiiReportGenerator.js`, `src/views/AccountsPayableViewSQL.jsx`, `src/views/AccountsReceivableViewSQL.jsx`, `src/hooks/useOverdueInvoiceChecker.js`, y cada otro lugar que calcule saldo de factura como `total − amountPaid` (buscar con grep). Test: `test/chartOfAccounts.spec.js` (o el existente), `test/dgiiReport*.spec.js` (o uno nuevo).

**Interfaces — Consumes:** `invoiceBalance` (Task 1).
- Cuentas nuevas en `ACCOUNTS`: `ITBIS_WITHHELD_BY_THIRDS` ('1105', 'ITBIS retenido por terceros', activo), `ISR_WITHHELD_BY_THIRDS` ('1106', 'ISR retenido por terceros (anticipo)', activo), `WITHHOLDINGS_PAYABLE` ('2104', 'Retenciones por pagar', pasivo) — usar el siguiente código libre si alguno existe.
- `invoiceToJournalEntries`: lo retenido va a las cuentas nuevas en lugar de Cuentas por Cobrar/Efectivo; el total de débitos sigue igual al de créditos.
- `expenseToJournalEntries`: `itbisRetenido + montoRetencionIsr` se acreditan a `WITHHOLDINGS_PAYABLE` y se descuentan de lo que va a Cuentas por Pagar/Efectivo.
- Cuentas por Pagar: saldo del gasto = total − retenciones − pagado.
- 607: `ITBIS Retenido por Terceros` = `itbisRetenido`, `Retención Renta por Terceros` = `retencionRenta`, `Fecha de Retención` = `retentionDate` con el formato del 607 (vacía si no hay).

- [ ] Pruebas: asientos cuadran con y sin retenciones; 607 con y sin retención; saldo de CxP. Commit `Retenciones: saldos, contabilidad y 607`.

### Task 4: Cobros con retención

**Files:** Modify `src/components/modals/PaymentModal.jsx` (el que usa Cuentas por Cobrar; confirmar cuál registra el cobro de una factura). Test: `test/paymentModal.spec.jsx` (nuevo si no existe).

- Campos "ITBIS retenido por el cliente", "ISR retenido por el cliente" y "Fecha de retención" (por defecto hoy en fecha local `toLocaleDateString('en-CA')`), con los valores guardados de la factura; el monto a cobrar sugerido es `invoiceBalance` restando lo que se escribe en las retenciones; se envían los totales con el `PUT` de siempre.

- [ ] Prueba: con ITBIS ret. 180 la sugerencia baja y el payload lleva `itbisRetenido: 180`. Commit `Retenciones: registrar lo que retiene el cliente al cobrar`.

### Task 5: Concepto de retención en Gastos

**Files:** Modify `src/components/forms/ExpenseForm.jsx`. Test: `test/expenseForm.spec.jsx` (existe; ampliar).

**Interfaces — Consumes:** `withholdingsOf`, `conceptsFor`, `withholdingFor` (Task 1); la tabla llega por `companyProfile.withholdings` (verificar cómo recibe el formulario el perfil; si no lo recibe, pasarlo desde `ExpensesViewSQL`).
- Selector "Concepto de retención" en la sección Retenciones con "Sin retención" + `conceptsFor(tabla, supplier.supplierType)`; al elegir llena ITBIS retenido, ISR retenido y tipo; recalcula al cambiar montos mientras el usuario no haya editado a mano esos campos; suplidor `informal` preselecciona `informal` si está activo. No cambia nada en gastos ya guardados al abrirlos.

- [ ] Pruebas: elegir honorarios llena 1 800 / 1 500 / '2'; editar a mano y cambiar montos no pisa; informal preseleccionado. Commit `Retenciones: concepto de retención en Gastos`.

### Task 6: Pestaña "Retenciones" en Configuración

**Files:** Modify `src/views/SettingsViewSQL.jsx` (o un componente nuevo `src/components/settings/WithholdingsTab.jsx` usado por la vista). Test: `test/withholdingsTab.spec.jsx`.

- Tabla editable (nombre, tipo de proveedor, % ITBIS, % ISR, tipo del 606 de la lista existente `TIPOS_RETENCION_ISR` — exportarla o duplicarla en un solo lugar compartido, activo), agregar fila, "Restaurar valores iniciales" con confirmación, aviso fijo "Las tasas cambian con la ley: verifícalas con tu contador.", validación con `validateWithholdings` antes de guardar, se guarda con el `PUT /api/settings` existente. Solo editable para admin/manager.

- [ ] Prueba: restaurar valores iniciales y validación; build con Node 22; commit `Retenciones: pestaña de Configuración`.

### Task 7: Guardar los pagos a suplidores (pedido del dueño el 2026-11-25)

Hoy Cuentas por Pagar manda `paidAmount`, `paymentStatus` y `payments` a `PUT /api/expenses/:id`, pero `Expense` no tiene esos campos y zod los descarta: los pagos se pierden al recargar.

**Files:** Modify `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261127000000_retenciones/migration.sql` (no desplegada: agregar ahí), `backend/src/routes/expenses.js`, `src/views/AccountsPayableViewSQL.jsx` (solo si hace falta ajustar lo que envía o lee). Create `backend/src/services/expensePayment.js`. Test: `test/expensePayment.spec.js`.

**Interfaces — Produces:**
- `Expense.paidAmount Decimal(12,2) @default(0)`, `Expense.payments Json?` (lista `{ date: 'YYYY-MM-DD', amount, method }`). El estado se calcula, no se guarda.
- `planExpensePayment(expense, body, { manager }) => { data, error, status }` (puro): `paidAmount` ≥ 0 y ≤ total − `itbisRetenido` − `montoRetencionIsr` + 0.01, donde total = `montoFacturado + itbisFacturado`; reducir lo pagado solo gerente/administrador (403); si queda saldado y el gasto no tiene `paymentDate`, `paymentDate` = fecha del último pago (lo usa el 606 como "Fecha Pago").
- `PUT /api/expenses/:id` acepta `paidAmount` y `payments` con esa regla; las respuestas de GET traen `paidAmount`, `payments` y `paymentStatus` calculado (`Pagado` / `Parcial` / `Pendiente`) para que la vista de CxP siga funcionando.
- El bloqueo de gastos enlazados a una orden de compra no cuenta `paidAmount`/`payments` como cambio de montos.

- [ ] Pruebas puras (pago parcial, pago del neto con retención deja `Pagado`, tope, reducción por no gerente, fecha de pago); `prisma validate`; `node --check`; build; commit `Cuentas por Pagar: los pagos a suplidores se guardan`.
