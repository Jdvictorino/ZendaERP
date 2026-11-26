# Condiciones de pago — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plazos de pago por empresa (días, fin de mes, cuotas, descuento por pronto pago con nota de crédito), asignados por cliente y usados en cada venta, con cuotas en Cuentas por Cobrar, factura, ticket, e-CF y 607.

**Architecture:** Un módulo puro `paymentTerms.js` (dos copias idénticas app/servidor, como `withholdings.js`) calcula calendario, cuotas y descuento. El plazo de la empresa vive en `company.settings.paymentTerms`; la factura guarda una copia con su calendario en `Invoice.paymentTerm` (JSON). Las notas de crédito parciales pasan a rebajar el saldo (`Invoice.creditedAmount`) y a declararse en el 607 con un reparto de ITBIS compartido.

**Tech Stack:** React 19 + Vite (Electron), Express 4 + Prisma 5.22 + Postgres 16 (ESM), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-condiciones-pago-design.md`

## Global Constraints

- Mensajes, etiquetas y comentarios en español.
- Valores iniciales exactos de la tabla del spec, ids: `contado`, `15-dias`, `30-dias`, `45-dias`, `60-dias`, `30-dias-fin-mes`, `50-ahora-50-30`, `30-dias-2-10`.
- Plazo: `{ id, name, installments: [{ percent, days, fromMonthEnd }], discount: { percent, days } | null, active }`.
- Copia en la factura: `Invoice.paymentTerm = { id, name, discount, schedule: [{ dueDate: 'YYYY-MM-DD', amount }] }`; contado = `null`. `paymentTermDays` = días de la última cuota y `dueDate` = última cuota se siguen llenando.
- Fechas locales de RD con `todayRD()` de `tax.js` (nunca `toISOString().slice(0,10)` para "hoy").
- Lo saldado de una factura = `amountPaid + itbisRetenido + retencionRenta + creditedAmount`; se reparte de la cuota más vieja a la más nueva.
- Descuento solo si: el plazo lo tiene, hoy ≤ fecha de venta + `discount.days`, no hay cobros previos (`amountPaid` 0), no hay nota `kind = 'pronto_pago'`, y el descuento ≤ saldo. Monto = `round2(total × percent / 100)`. El servidor solo emite la nota si cobro + nota + retenciones dejan saldo ≤ 0.01; si no, 400 y nada se crea.
- Módulos de copias idénticas (desde la línea 2): `withholdings.js`, `paymentTerms.js`, `noteSplit.js`; cada uno con su prueba de comparación como en `test/withholdings.spec.js`.
- Apps instaladas 1.1.20: el servidor acepta ventas con `paymentTermDays` o sin plazo, y clientes con `creditDays`/sin `paymentTermId`.
- Migración nueva, aditiva: `backend/prisma/migrations/20261128000000_condiciones_pago/migration.sql`.
- Pruebas por archivo: `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivos>` (nunca la suite completa). Build: `npx -y node@22 node_modules/vite/bin/vite.js build --logLevel error`. Servidor: `node --check`, `cd backend && npx prisma validate` (DATABASE_URL de prueba) y `npx prisma generate`.
- Commits solo con rutas explícitas; mensaje en español + línea en blanco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Factura anulada con cuotas vencidas: no debe salir en avisos ni en antigüedad de Cuentas por Cobrar.
2. Fin de mes con días que cruzan de año o caen en febrero (venta 31-ene, "30 días fin de mes" → 2-mar o 1-mar según año bisiesto): la fecha debe ser la correcta del calendario, no un 31 inexistente ni un día corrido por UTC.
3. Cuotas que no dividen exacto (3 × 33.33 %, total 100.00): la suma de montos debe ser el total exacto.
4. App vieja que manda `paymentTermDays: 30` sin `paymentTermId`: la factura queda con una cuota a 30 días y sale vencida a tiempo.
5. Pronto pago con retenciones ya registradas o cobro corto: el servidor responde 400 y no emite nota ni cobro.

---

### Task 1: Módulo de plazos y saldo con notas de crédito

**Files:**
- Create: `src/utils/paymentTerms.js`, `backend/src/services/paymentTerms.js` (idénticos desde la línea 2)
- Modify: `src/utils/withholdings.js`, `backend/src/services/withholdings.js` (`invoiceBalance` resta `creditedAmount`)
- Test: `test/paymentTerms.spec.js`; extender `test/withholdings.spec.js`

**Interfaces — Produces:**
- `DEFAULT_PAYMENT_TERMS` (8 plazos de Global Constraints).
- `paymentTermsOf(settings) => list` (guardada o iniciales).
- `validatePaymentTerms(list) => string | null` (nombres e ids únicos; % de cuotas suman 100 ±0.01; días enteros 0–365; descuento 0–100 % con `discount.days` < días de la última cuota; exactamente un plazo activo de una sola cuota a 0 días sin descuento = contado).
- `isCashTerm(term) => boolean`.
- `scheduleFor(term, total, saleDate: 'YYYY-MM-DD') => [{ dueDate, amount }]`.
- `termSnapshot(term, total, saleDate) => Invoice.paymentTerm | null` (null si contado).
- `legacySnapshot(days, total, saleDate)` (una cuota a `days`).
- `downPayment(snapshot) => number` (suma de cuotas con `dueDate === saleDate`).
- `installmentsOf(invoice, today) => [{ dueDate, amount, paid, remaining, overdue }]` (sin `paymentTerm`: una cuota por el total con `dueDate` o la fecha de venta).
- `nextDue(invoice, today) => { dueDate, overdueDays } | null` (cuota vencida más vieja o próxima por vencer; null si saldada o anulada).
- `discountFor(invoice, today) => { amount, until } | null`.

- [ ] **Step 1: Pruebas** (ambas copias con `describe.each`, como `withholdings.spec.js`):
  - `scheduleFor(30-dias, 1180, '2026-11-25')` → `[{ dueDate: '2026-12-25', amount: 1180 }]`.
  - `scheduleFor(30-dias-fin-mes, 100, '2026-01-31')` → `'2026-03-02'`; con `'2028-01-31'` → `'2028-03-01'`; con `'2026-12-15'` → `'2027-01-30'`.
  - Tres cuotas de 33.33/33.33/33.34 % sobre 100 → montos 33.33, 33.33, 33.34 y suma 100.
  - `50-ahora-50-30` sobre 1000 el 2026-11-25 → `downPayment` = 500.
  - `installmentsOf` con 1000 en 50/50, `amountPaid` 600 → primera pagada, segunda `paid` 100 `remaining` 400; con `today` posterior a la segunda → `overdue: true` solo en la segunda.
  - Factura `status: 'Anulado'` → `nextDue` null.
  - `discountFor` con `30-dias-2-10`, total 1180, venta 2026-11-25: el 2026-12-05 → `{ amount: 23.6, until: '2026-12-05' }`; el 2026-12-06 → null; con `amountPaid` 100 → null.
  - `validatePaymentTerms`: suma 90 % → error; sin contado → error; descuento con días ≥ última cuota → error; los iniciales → null.
  - `invoiceBalance({ total: 1000, amountPaid: 0, creditedAmount: 200 })` → 800.
  - Copias idénticas desde la línea 2.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. Fechas con aritmética de calendario en `Date.UTC` sobre la cadena 'YYYY-MM-DD' (no hora local); fin de mes = último día del mes de la venta; la última cuota absorbe el redondeo (`round2` local en el módulo).
- [ ] **Step 4:** `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run test/paymentTerms.spec.js test/withholdings.spec.js` → PASS.
- [ ] **Step 5:** Commit `Condiciones de pago: módulo de plazos y saldo con notas de crédito`.

### Task 2: Servidor — datos, plazos en Configuración, clientes y ventas

**Files:**
- Modify: `backend/prisma/schema.prisma`; Create: `backend/prisma/migrations/20261128000000_condiciones_pago/migration.sql`
- Modify: `backend/src/routes/settings.js`, `backend/src/routes/customers.js`, `backend/src/routes/invoices.js` (POST `/`, crédito, POST `/:id/credit-note`)
- Create: `backend/src/services/invoiceTerms.js`
- Test: `test/invoiceTerms.spec.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: `Customer.paymentTermId String?`; `Invoice.paymentTerm Json?`; `Invoice.creditedAmount Decimal(12,2) @default(0)`; `CreditNote.kind String @default("normal")`. Migración: columnas + `UPDATE invoices SET "creditedAmount" = suma de sus notas` para facturas no anuladas. Settings GET/PUT `paymentTerms` (validado con `validatePaymentTerms`, 400 antes del lock, como `withholdings`). Clientes aceptan `paymentTermId` (string o null); si llega `creditDays` sin `paymentTermId`, se toma el plazo activo de una cuota con esos días si existe.
- `planInvoiceTerms(body, terms, saleDate, total) => { paymentTerm, paymentTermDays, dueDate } | { error }` (puro, en `invoiceTerms.js`): `paymentTermId` desconocido o inactivo → error 400 "Condición de pago no válida."; contado → todo null; `paymentTermDays` sin id → `legacySnapshot`. `dueDate` = fecha de la última cuota (Date de 'YYYY-MM-DD').
- POST `/api/invoices`: `saleDate = todayRD()`; usa `planInvoiceTerms`; guarda los tres campos.
- Límite de crédito: el saldo pendiente resta también `creditedAmount`.
- POST `/:id/credit-note`: si la nota no completa el total, incrementa `creditedAmount` en la misma transacción.

- [ ] **Step 1: Pruebas** de `planInvoiceTerms`: id `30-dias` → copia con una cuota y `paymentTermDays` 30; `contado` → nulls; `paymentTermDays: 60` sin id → una cuota a 60 días; id inexistente → error. Prueba del mapeo de `creditDays` (función pura exportada desde `customers.js` o `invoiceTerms.js`).
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar esquema, migración y rutas.
- [ ] **Step 4:** Pruebas → PASS; `prisma validate`, `prisma generate`, `node --check` en las rutas.
- [ ] **Step 5:** Commit `Condiciones de pago: datos, Configuración, clientes y ventas en el servidor`.

### Task 3: Pronto pago en el servidor

**Files:**
- Modify: `backend/src/routes/invoices.js` (extraer la creación de nota de `/:id/credit-note` a una función reutilizable; ruta nueva `POST /:id/early-payment`)
- Create: `backend/src/services/earlyPayment.js`
- Modify: `src/api/client.js` (`invoices.earlyPayment(id, data)`)
- Test: `test/earlyPayment.spec.js`

**Interfaces:**
- Consumes: `discountFor`, `planInvoicePayment` (`backend/src/services/invoicePayment.js`), `invoiceBalance`.
- Produces: `planEarlyPayment(invoice, body, { today, manager }) => { discount, paymentData } | { error, status }` (puro). `POST /api/invoices/:id/early-payment` con el mismo cuerpo que el cobro de `PUT /:id` (`amountPaid` acumulado, `payments`/`paymentBreakdown`, retenciones), mismos roles que hoy registran cobros. En una transacción: nota `kind: 'pronto_pago'`, motivo "Descuento por pronto pago", sin artículos (no devuelve existencias), B04 o E34 como la ruta actual, `creditedAmount += descuento`, y el cobro con `planInvoicePayment`. El e-CF de la nota se envía después del commit, igual que hoy. Respuesta `{ invoice, creditNote, ecfResult }`.

- [ ] **Step 1: Pruebas** de `planEarlyPayment`: 1180 con `30-dias-2-10`, hoy dentro de la ventana, cobro 1156.40 → descuento 23.60 y factura saldada; cobro 1000 → 400 "El cobro con descuento debe saldar la factura."; fuera de la ventana → 400 "El descuento por pronto pago ya no aplica."; con nota de pronto pago previa → 400; con retenciones que dejan el descuento mayor que el saldo → 400.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; `node --check`.
- [ ] **Step 5:** Commit `Condiciones de pago: cobro con descuento por pronto pago`.

### Task 4: Reparto de ITBIS de notas, 607 y Contabilidad

**Files:**
- Create: `src/utils/noteSplit.js`, `backend/src/services/noteSplit.js` (idénticos)
- Modify: `backend/src/services/ecfXmlBuilder.js` (`buildEcfFromNote` usa `noteSplit`), `src/utils/dgiiReportGenerator.js` (`generate607Data(invoices, creditNotes)`), la vista que genera el 607 (grep `generate607Data`), `src/views/AccountingViewSQL.jsx` (deja de pasar `[]`)
- Create: `GET /api/invoices/credit-notes?from&to` en `backend/src/routes/invoices.js` (antes de `/:id`) con cada nota y de su factura: `ncfNumber`, fecha de comprobante, `customerRnc`/tipo de identificación, `total`, `taxAmount`, `items`; `src/api/client.js` `invoices.creditNotes(params)`
- Test: `test/noteSplit.spec.js`, extender la prueba del 607 (grep `generate607Data` en test/)

**Interfaces:**
- Produces: `noteAmounts(note, invoice) => { base, itbis, exempt }` — mismo resultado que hoy declara `buildEcfFromNote` (mover la lógica, no reinventarla).
- 607: una línea por nota del período (por fecha de la nota) con su NCF, "NCF ó Documento Modificado" = NCF de la factura, montos de `noteAmounts`. Antes de escribirlo, confirmar en el formato oficial del 607 de la DGII el signo y las columnas de las notas de crédito (ver memoria `dgii-docs` para leer PDFs de dgii.gov.do); anotar la fuente en un comentario de una línea.

- [ ] **Step 1: Pruebas:** `noteAmounts` igual a lo que producía `buildEcfFromNote` para una factura mixta (gravada 18 %, exenta) con nota parcial; el 607 con una factura y una nota parcial del mismo período lista dos líneas y la de la nota lleva el NCF modificado; ecfXmlBuilder sigue dando el mismo XML de nota (prueba existente o nueva).
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Notas de crédito: reparto de ITBIS compartido, 607 y contabilidad`.

### Task 5: Factura, ticket y e-CF con la condición

**Files:**
- Modify: `src/utils/docLines.js` (helper), `src/utils/pdfGenerator.js`, `src/utils/escposGenerator.js`, `backend/src/services/ecfXmlBuilder.js`
- Test: extender `test/docLines.spec.js` (o crear) y la prueba del e-CF (grep `buildEcfFromInvoice` en test/)

**Interfaces:**
- Produces: `termLines(invoice) => string[]` en `docLines.js`: `[]` para contado; `"Condición: 30 días"`, `"Vence: 25/12/2026"`; con varias cuotas, `"Cuota 1: 25/11/2026 — RD$ 500.00"`…; con descuento, `"2 % de descuento si paga todo antes del 05/12/2026"`.
- e-CF: `TipoPago = '2'` cuando la factura tiene `paymentTerm` (o `paymentMethod === 'Crédito'`, como hoy); `FechaLimitePago` = última cuota en dd-MM-AAAA. Antes de agregar un campo de texto del plazo, confirmar su nombre y posición en el Formato e-CF v1.0; si no existe, no se agrega.

- [ ] **Step 1: Pruebas:** `termLines` para contado, 30 días, 50/50 y con descuento; `buildEcfFromInvoice` con `paymentTerm` 30 días → `TipoPago '2'` y `FechaLimitePago '25-12-2026'`; contado → `'1'` y sin `FechaLimitePago`.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar; PDF y ticket imprimen `termLines` cerca de los totales (sin cambiar el resto del formato DGII).
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Condiciones de pago: factura, ticket y e-CF`.

### Task 6: Ventas en Distribuidor y modo craft

**Files:**
- Modify: `src/views/POSBillingOrdersView.jsx` (reemplaza `CONDICIONES` fijo), `src/views/OrdersViewSQL.jsx`, `src/components/modals/PaymentModal.jsx` (prop `minAmount`)
- Test: extender las pruebas de esas vistas si existen (grep), si no `test/saleTerms.spec.jsx` para el selector y el cobro inicial

**Interfaces:**
- Consumes: `paymentTermsOf(companyProfile)`, `isCashTerm`, `downPayment`; el cliente trae `paymentTermId`.
- Selector "Condición" con los plazos activos; propone el del cliente seleccionado (contado sin cliente o si su plazo ya no está activo). Se manda `paymentTermId` (ya no `paymentTermDays`). F9 alterna entre contado y el plazo del cliente (o `30-dias`).
- *Ruling del plan:* la venta se crea primero (como hoy) y el cobro de las cuotas a 0 días se hace en el `PaymentModal` que se abre justo después, con `minAmount = downPayment(factura.paymentTerm)`: el modal no deja confirmar menos. Si el cajero cierra el modal, la cuota queda pendiente como una venta de contado sin cobrar hoy. El servidor no rechaza la venta (el spec decía que sí, pero las ventas de contado ya funcionan así en dos pasos).
- Venta a crédito sin cuotas a 0 días: igual que hoy (sin modal, imprime el comprobante).

- [ ] **Step 1: Pruebas:** el selector propone el plazo del cliente; con `50-ahora-50-30` sobre 1000 se abre el cobro con mínimo 500 y no deja confirmar 400; con `30-dias` no se abre el cobro y el payload lleva `paymentTermId: '30-dias'`.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Condiciones de pago: ventas en Distribuidor y modo craft`.

### Task 7: Clientes

**Files:**
- Modify: `src/components/modals/CustomerModal.jsx`, `src/views/CustomersViewSQL.jsx` (columna y exportación)
- Test: extender la prueba de `CustomerModal` (grep) o crear `test/customerTerms.spec.jsx`

**Interfaces:**
- Consumes: `paymentTermsOf(companyProfile)`, `isCashTerm`; el servidor acepta `paymentTermId` (Task 2).
- "Tipo de cuenta" y "Días de crédito" se reemplazan por "Condición de pago" (plazos activos; contado por defecto). El límite de crédito se habilita solo si la condición no es contado. La lista muestra el nombre del plazo (o "Contado").

- [ ] **Step 1: Pruebas:** guardar con `30-dias` manda `paymentTermId: '30-dias'`; con contado el límite queda deshabilitado y en 0; la lista muestra "30 días".
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Condiciones de pago: plazo por cliente`.

### Task 8: Cuentas por Cobrar, avisos y cobro con descuento

**Files:**
- Modify: `src/views/AccountsReceivableViewSQL.jsx` (vencimiento y antigüedad con `nextDue`), `src/components/modals/ReceivableDetailModal.jsx` (calendario de cuotas), `src/hooks/useOverdueInvoiceChecker.js`, `src/components/modals/PaymentModal.jsx` (descuento, solo con `allowWithholdings`)
- Test: `test/paymentModal.spec.jsx` (extender), `test/receivables.spec.jsx` o la prueba existente del checker (grep)

**Interfaces:**
- Consumes: `installmentsOf`, `nextDue`, `discountFor` (Task 1); `invoices.earlyPayment` (Task 3).
- PaymentModal: si `discountFor(invoice, todayRD())`, casilla marcada "Descuento por pronto pago {percent} %: RD$ X (hasta dd/mm/aaaa)"; el monto sugerido baja en X; al confirmar con la casilla marcada llama `invoices.earlyPayment` en vez de `invoices.update`; desmarcada = cobro normal. El error del servidor se muestra tal cual (sin cola sin conexión para este camino).

- [ ] **Step 1: Pruebas:** factura 1180 `30-dias-2-10` dentro de la ventana → casilla visible, sugerido 1156.40, confirma con `earlyPayment`; desmarcar → `update` con 1180; fuera de ventana → sin casilla. Checker: factura 50/50 con primera cuota vencida y segunda no → aviso con la primera; anulada → sin aviso. AR: la columna de vencimiento muestra la cuota vencida más vieja.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Condiciones de pago: cuotas en Cuentas por Cobrar y pronto pago`.

### Task 9: Pestaña "Condiciones de pago" en Configuración

**Files:**
- Create: `src/components/settings/PaymentTermsTab.jsx`; Modify: `src/views/SettingsViewSQL.jsx`
- Test: `test/paymentTermsTab.spec.jsx`

**Interfaces:**
- Consumes: `DEFAULT_PAYMENT_TERMS`, `paymentTermsOf`, `validatePaymentTerms`; `settingsApi.update({ paymentTerms })` (PUT parcial ya seguro); `onProfileUpdate`.
- Igual que `WithholdingsTab.jsx`: tabla editable (nombre; cuotas con % , días y "desde fin de mes", agregar/quitar cuota; descuento % y días opcional; activo), agregar plazo, "Restaurar valores iniciales" con `confirmDialog`, validación antes de guardar, números como `Number`, etiquetas accesibles por fila, mismo permiso (`isMasterUser`).

- [ ] **Step 1: Pruebas:** restaurar tras confirmar; cuotas que no suman 100 muestran el error y no llaman a la API; guardar válido manda solo `{ paymentTerms }` con números; sin permiso, solo lectura.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pruebas → PASS; build.
- [ ] **Step 5:** Commit `Condiciones de pago: pestaña de Configuración`.
