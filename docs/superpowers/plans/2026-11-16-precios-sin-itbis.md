# Precios sin ITBIS e ITBIS según el tipo de cliente — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los precios del catálogo pasan a ser sin ITBIS; el servidor suma el ITBIS por línea según el producto y el cliente (exento con carnet vigente), y todas las pantallas y documentos muestran precio unitario sin ITBIS + ITBIS aparte.

**Architecture:** Un módulo puro de cálculo fiscal (`tax.js`) con dos copias idénticas (servidor y app), probado con los mismos casos sobre ambas. El servidor decide la tasa en `POST /invoices` y valida el comprobante en `/bill`; las facturas viejas se marcan `pricesIncludeTax = true` y siguen su cálculo de siempre. Las apps 1.1.x (sin la bandera `pricesExcludeTax`) siguen por el camino viejo.

**Tech Stack:** Express + Prisma + Postgres (backend), React + Vite + Electron (app), Vitest (`npm test` = `vitest --run --globals`, pruebas en `test/`).

**Spec:** `docs/superpowers/specs/2026-11-16-precios-sin-itbis-design.md`

## Global Constraints

- Precios de catálogo (`salePrice`, `wholesalePrice`, `ProductVariant.salePrice`, `priceAdjustment`) son **sin ITBIS**. **No se migra ningún precio.**
- Redondeo por línea: `base = round2(qty * unitPrice * (1 - discountPercent/100))`, `itbis = round2(base * rate/100)`; factura: `subtotal = Σ base`, `taxAmount = Σ itbis`, `total = subtotal + taxAmount`. `round2(n) = Math.round((n + Number.EPSILON) * 100) / 100`.
- Exento ⇔ `taxpayerType ∈ {zona_franca, regimen_especial, diplomatico, ong}` **y** `exemptionNumber` no vacío **y** `exemptionExpiresAt >= hoy` (fecha de RD, `YYYY-MM-DD`, vence el mismo día inclusive).
- Tipos de cliente (valor → etiqueta): `consumidor_final` → "Consumidor final", `persona_fisica` → "Persona física (crédito fiscal)", `empresa` → "Empresa", `gubernamental` → "Gubernamental", `zona_franca` → "Zona franca", `regimen_especial` → "Régimen especial", `diplomatico` → "Diplomático / organismo internacional", `ong` → "ONG / sin fines de lucro". Sin `exportacion`.
- Facturas existentes y facturas creadas sin `pricesExcludeTax: true`: `pricesIncludeTax = true`, cálculo de siempre, sin exención. Nunca se cambian sus montos guardados.
- Textos de la app en español, como los existentes. Sin dependencias nuevas.
- La base de datos de producción solo se toca en el servidor (`zenda@zenda-server`), y solo al desplegar; nada de este plan la toca.

## Review Focus

1. Pedido creado con la app vieja (o antes del despliegue) y facturado después con la app nueva → su e-CF y su ticket salen con los montos guardados, sin sumar ITBIS otra vez (Task 5 y 7).
2. Cliente con carnet que vence hoy → exento; vencido ayer → paga ITBIS y la app avisa (Task 1 y 6).
3. Cliente exento + descuento general → ITBIS 0 y total = base descontada (Task 1 y 3).
4. Cajero cambia el comprobante a E44/B14 para un cliente no exento, o a B02/E32 para una venta exenta → el servidor responde 400 (Task 4).
5. Factura con líneas de 18 %, 16 % y exento mezcladas → ticket, PDF, factura guardada y XML coinciden al céntimo (Task 1 y 5).

---

### Task 1: Módulo fiscal compartido

**Files:**
- Create: `backend/src/services/tax.js`
- Create: `src/utils/tax.js` (copia exacta; primera línea: `// Copia de backend/src/services/tax.js — mantener iguales (test/tax.spec.js prueba ambas)`)
- Test: `test/tax.spec.js`

**Interfaces:**
- Produces (ambas copias, mismos nombres):
  - `TAXPAYER_TYPES: Array<{ value: string, label: string, exemptible: boolean }>` (los 8 de Global Constraints; `exemptible` true en los 4 de la regla).
  - `round2(n: number) => number`
  - `todayRD(now = new Date()) => 'YYYY-MM-DD'` (fecha en `America/Santo_Domingo`).
  - `isTaxExempt(customer: { taxpayerType, exemptionNumber, exemptionExpiresAt } | null, today: 'YYYY-MM-DD') => boolean` (`exemptionExpiresAt` puede llegar como `Date` o string ISO; comparar por los primeros 10 caracteres de su ISO).
  - `exemptionStatus(customer, today) => 'none' | 'valid' | 'expired' | 'missing'` (`none` si el tipo no es exemptible; `missing` si es exemptible sin número o sin fecha).
  - `lineAmounts({ quantity, unitPrice, discountPercent, taxRate }) => { base, itbis }`
  - `invoiceTotals(lines) => { subtotal, taxAmount, total }` (suma de `lineAmounts`, cada suma pasada por `round2`).
  - `suggestedVoucher(customer, { ecf: boolean, exempt: boolean }) => 'E31'|'E32'|'E44'|'E45'|'B01'|'B02'|'B14'|'B15'`: exento → E44/B14; `gubernamental` → E45/B15; `consumidor_final` o sin cliente → E32/B02; el resto → E31/B01.
  - `voucherError(ncfType, { exemptApplied: boolean, taxpayerType }) => string | null`: venta exenta y tipo ∉ {E44, B14} → `'Venta exenta de ITBIS: use el comprobante de Régimen Especial (E44/B14).'`; no exenta y tipo ∈ {E44, B14} → `'El comprobante de Régimen Especial (E44/B14) solo aplica a clientes exentos con carnet vigente.'`; tipo ∈ {E45, B15} y `taxpayerType !== 'gubernamental'` → `'El comprobante Gubernamental (E45/B15) solo aplica a clientes gubernamentales.'`; si no, `null`.
  - `netUnitPrice(item: { unitPrice, taxRate }, pricesIncludeTax: boolean) => number` — si `pricesIncludeTax`, `round2(unitPrice / (1 + taxRate/100))`; si no, `unitPrice`.

- [ ] **Step 1: Write the failing test** — `test/tax.spec.js` importa ambas copias y corre cada caso con `describe.each([['servidor', server], ['app', app]])`:
  - `lineAmounts({quantity:2, unitPrice:100, discountPercent:0, taxRate:18})` → `{base:200, itbis:36}`; con `discountPercent:10` → `{base:180, itbis:32.4}`; `{quantity:3, unitPrice:33.33, taxRate:18}` → `{base:99.99, itbis:18}`; `taxRate:0` → itbis 0.
  - `invoiceTotals` de líneas 18 % (100), 16 % (50), 0 % (25) → `{subtotal:175, taxAmount:26, total:201}`.
  - `isTaxExempt({taxpayerType:'zona_franca', exemptionNumber:'ZF-1', exemptionExpiresAt:'2026-11-16'}, '2026-11-16')` → true; con expiración `'2026-11-15'` → false; sin número → false; `taxpayerType:'empresa'` con número y fecha → false; `null` → false; `exemptionExpiresAt: new Date('2026-12-31T00:00:00Z')` → true.
  - `exemptionStatus`: empresa → `'none'`; ong sin fecha → `'missing'`; vencido → `'expired'`; vigente → `'valid'`.
  - `suggestedVoucher`: exento ecf → `'E44'`, exento papel → `'B14'`; gubernamental papel → `'B15'`; `null` ecf → `'E32'`; empresa ecf → `'E31'`; zona_franca no exenta papel → `'B01'`.
  - `voucherError('B02', {exemptApplied:true})` → mensaje E44/B14; `voucherError('E44', {exemptApplied:false, taxpayerType:'empresa'})` → mensaje "solo aplica a clientes exentos"; `voucherError('B15', {exemptApplied:false, taxpayerType:'empresa'})` → mensaje gubernamental; `voucherError('E31', {exemptApplied:false, taxpayerType:'empresa'})` → null.
  - `netUnitPrice({unitPrice:118, taxRate:18}, true)` → 100; `(…, false)` → 118.
  - `todayRD(new Date('2026-11-17T02:00:00Z'))` → `'2026-11-16'`.
  - El texto de las dos copias es idéntico salvo la primera línea (leer ambos archivos con `fs` y comparar desde la línea 2).
- [ ] **Step 2:** `npx vitest --run --globals test/tax.spec.js` → FAIL (módulos no existen).
- [ ] **Step 3:** Implementar `backend/src/services/tax.js` y copiarlo a `src/utils/tax.js`. Solo JS puro, sin imports.
- [ ] **Step 4:** Misma orden → PASS.
- [ ] **Step 5: Commit** `git add backend/src/services/tax.js src/utils/tax.js test/tax.spec.js && git commit -m "Módulo fiscal: ITBIS por línea, exención y comprobante sugerido"`

### Task 2: Datos — cliente con tipo y carnet, factura con marca de precio

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelos `Customer`, `Invoice`)
- Create: `backend/prisma/migrations/20261116020000_taxpayer_type_and_exemption/migration.sql`
- Modify: `backend/src/routes/customers.js`
- Test: `test/customerTax.spec.js`

**Interfaces:**
- Consumes: `TAXPAYER_TYPES` (Task 1).
- Produces:
  - `Customer.taxpayerType String @default("consumidor_final")`, `Customer.exemptionNumber String?`, `Customer.exemptionExpiresAt DateTime? @db.Date`.
  - `Invoice.pricesIncludeTax Boolean @default(false)`, `Invoice.exemptionNumber String?`.
  - `export function customerTaxFields(body) => { taxpayerType, exemptionNumber, exemptionExpiresAt }` en `backend/src/routes/customers.js` (o un servicio que importe), que lanza `httpError(400, …)` si el tipo no está en `TAXPAYER_TYPES` o la fecha no es válida; para tipos no exemptible devuelve `exemptionNumber: null, exemptionExpiresAt: null`. Acepta `taxpayerType` o, si falta, el `type` viejo del formulario mapeado: `Persona`→`consumidor_final`, `Empresa`→`empresa`, `Zona Franca`→`zona_franca`, `Gubernamental`→`gubernamental`, `ONG`→`ong`.

- [ ] **Step 1: Write the failing test** `test/customerTax.spec.js`: `customerTaxFields({taxpayerType:'zona_franca', exemptionNumber:' ZF-9 ', exemptionExpiresAt:'2027-01-31'})` → `{taxpayerType:'zona_franca', exemptionNumber:'ZF-9', exemptionExpiresAt: Date 2027-01-31}`; `{taxpayerType:'empresa', exemptionNumber:'X'}` → número y fecha `null`; `{type:'Zona Franca'}` → `zona_franca`; `{taxpayerType:'exportacion'}` lanza 400; `{taxpayerType:'ong', exemptionExpiresAt:'no-fecha'}` lanza 400; `{}` → `consumidor_final`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Schema + migración SQL: agregar columnas; `UPDATE customers SET "taxpayerType"='empresa' WHERE length(regexp_replace(coalesce(rnc,''),'\D','','g')) = 9;` `UPDATE invoices SET "pricesIncludeTax" = true;` (la columna se crea con default false y luego se marcan todas las existentes). Usar los nombres de tabla/columna que ya genera Prisma en las migraciones anteriores (revisar una migración existente). En `customers.js`: create y update guardan `customerTaxFields(req.body)`; GET devuelve los tres campos.
- [ ] **Step 4:** Test PASS y `cd backend && npx prisma validate` → "The schema … is valid".
- [ ] **Step 5: Commit** "Clientes: tipo de contribuyente y carnet de exención; facturas marcan si el precio incluye ITBIS".

### Task 3: Servidor — `POST /invoices` con precios sin ITBIS

**Files:**
- Modify: `backend/src/routes/invoices.js` (esquema zod ~línea 81-95 y `POST /` desde ~197)
- Modify: `backend/src/services/pricing.js` (solo si hace falta exportar algo; la regla de precio de lista no cambia)
- Test: `test/invoiceTax.spec.js`

**Interfaces:**
- Consumes: `isTaxExempt`, `todayRD`, `lineAmounts`, `invoiceTotals` (Task 1); campos de Task 2.
- Produces: `export function priceInvoiceLines(items, { pricesExcludeTax: boolean, exempt: boolean }) => { items /* con subtotal y taxRate finales */, subtotal, taxAmount, total }` en `backend/src/services/invoiceAmounts.js` (nuevo, para probarla sin Express). Camino `pricesExcludeTax:false` = cálculo actual exacto (extrae ITBIS del precio, `subtotal` por línea = base sin redondear como hoy); camino `true` = `lineAmounts`/`invoiceTotals`, y si `exempt` todas las tasas = 0.
- El cuerpo acepta `pricesExcludeTax: z.boolean().optional()`. La factura guarda `pricesIncludeTax: !pricesExcludeTax` y `exemptionNumber: exempt ? customer.exemptionNumber : null`, donde `exempt = pricesExcludeTax && isTaxExempt(customer, todayRD())`.

- [ ] **Step 1: Write the failing test** `test/invoiceTax.spec.js` sobre `priceInvoiceLines`:
  - `[{quantity:1, unitPrice:100, discountPercent:0, taxRate:18}]`, `{pricesExcludeTax:true, exempt:false}` → total 118, taxAmount 18, `items[0].subtotal` 100.
  - Mismo con `exempt:true` → total 100, taxAmount 0, `items[0].taxRate` 0.
  - Exento con `discountPercent:10` → total 90, taxAmount 0.
  - `[{quantity:1, unitPrice:100, discountPercent:0, taxRate:18}]` con `{pricesExcludeTax:false}` → total 100, `taxAmount` ≈ 15.25 (`toBeCloseTo(15.25, 2)`), `subtotal` ≈ 84.75 — igual que hoy.
  - `{pricesExcludeTax:false, exempt:true}` → se ignora `exempt`: `taxAmount` ≈ 15.25.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Crear `backend/src/services/invoiceAmounts.js` y usarlo en `POST /`, reemplazando el bloque "unitPrice viene del frontend ya con ITBIS incluido" (~líneas 223-245). `checkLinePrice` sigue fijando `item.taxRate` primero; después se aplica la exención. El cálculo de límite de crédito y el cambio (`changeAmount`) usan el `total` nuevo.
- [ ] **Step 4:** `npx vitest --run --globals test/invoiceTax.spec.js test/pricing.spec.js test/invoiceStock.spec.js` → PASS; `node --check backend/src/routes/invoices.js`.
- [ ] **Step 5: Commit** "Facturas: precio sin ITBIS e ITBIS según el cliente (con compatibilidad para apps viejas)".

### Task 4: Servidor — comprobante según la venta (`/bill`)

**Files:**
- Modify: `backend/src/routes/invoices.js` (`POST /:id/bill`, ~495-575)
- Test: `test/tax.spec.js` ya cubre `voucherError`; agregar `test/billVoucher.spec.js` solo si se extrae lógica nueva.

**Interfaces:**
- Consumes: `voucherError` (Task 1); `Invoice.exemptionNumber`, `Customer.taxpayerType` (Task 2).

- [ ] **Step 1:** En `/bill`, antes de las ramas e-CF y papel: cargar el cliente de la factura (si tiene) y llamar `voucherError(ncfType, { exemptApplied: !!invoice.exemptionNumber, taxpayerType: customer?.taxpayerType })`; si devuelve texto → `400 { error }`. `NoFiscal` también se rechaza en venta exenta (la regla ya lo cubre porque no está en {E44, B14}).
- [ ] **Step 2:** Rama papel: aceptar `B14` y `B15` además de `B01`, `B02`, `NoFiscal`; los cuatro fiscales toman número con `takeNcf(tx, companyId, ncfType)` (ya soporta secuencias de `settings.ncfSequences`). `ncfType` guardado tal cual.
- [ ] **Step 3:** Verificar a mano con `node --check backend/src/routes/invoices.js` y `npx vitest --run --globals test/tax.spec.js test/voidInvoices.spec.js` → PASS.
- [ ] **Step 4: Commit** "Facturación: B14/B15 en papel y comprobante validado según exención y tipo de cliente".

### Task 5: e-CF — mismos montos que la factura

**Files:**
- Modify: `backend/src/services/ecfXmlBuilder.js` (`calcularTotalesPorTasa` ~213, construcción de ítems ~180-205, `buildEcfFromNote` ~265)
- Test: `test/ecfNotes.spec.js` (ampliar) y `test/ecfAmounts.spec.js` (nuevo)

**Interfaces:**
- Consumes: `lineAmounts`, `netUnitPrice`, `round2` (Task 1); `Invoice.pricesIncludeTax` (Task 2).

- [ ] **Step 1: Write the failing test** `test/ecfAmounts.spec.js` con `buildEcfFromInvoice` (o la función exportada que arme totales/ítems; exportar `calcularTotalesPorTasa` si hace falta):
  - Factura nueva (`pricesIncludeTax:false`) con líneas 18 % `{qty 3, unitPrice 33.33}`, 16 % `{qty 1, unitPrice 50}`, exento `{qty 1, unitPrice 25}` → `MontoGravadoTotal` 149.99, `TotalITBIS` 26.00 (18.00 + 8.00), `MontoExento` 25.00, `MontoTotal` 200.99 = `invoiceTotals` de las mismas líneas.
  - Factura vieja (`pricesIncludeTax:true`) con una línea 18 % `unitPrice 118, qty 1, subtotal 100` → `PrecioUnitarioItem` "100.00", `MontoGravadoTotal` 100.00, `TotalITBIS` 18.00, `MontoTotal` 118.00. Regla para facturas viejas: `PrecioUnitarioItem = netUnitPrice(item, true)`, `MontoItem = round2(item.subtotal)` (base guardada, ya con descuento), ITBIS de la línea = `round2(MontoItem * taxRate/100)`.
  - En `test/ecfNotes.spec.js`: nota de crédito total sobre factura vieja con líneas 18 % y exento mezcladas → el reparto por línea usa `netUnitPrice(i, true)` como peso, y `MontoTotal` = `note.amount`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `calcularTotalesPorTasa` suma `lineAmounts` por línea (redondeo por línea) en vez de acumular sin redondear. En facturas `pricesIncludeTax`, cada ítem se normaliza antes: base = `Number(item.subtotal)`, `unitPrice` = `netUnitPrice(item, true)`. `buildEcfFromNote`: `net(i)` usa `netUnitPrice(i, !!originalInvoice.pricesIncludeTax)`. `IndicadorMontoGravado` queda en `'0'`.
- [ ] **Step 4:** `npx vitest --run --globals test/ecfAmounts.spec.js test/ecfNotes.spec.js test/ecfRetry.spec.js` → PASS.
- [ ] **Step 5: Commit** "e-CF: montos por línea iguales a la factura; facturas con ITBIS incluido se declaran por su base".

### Task 6: App — POS y Pedidos calculan sin ITBIS

**Files:**
- Modify: `src/views/POSBillingOrdersView.jsx` (`rateOf`, `computeTotals` ~31-55, fila ~256, armado de `orderData` ~700-725, selector de comprobante ~477)
- Modify: `src/views/OrdersViewSQL.jsx` (líneas que calculan `basePrice`/`itbisAmount` ~206-218 y ~261-277, `taxSummary` ~306, `orderData` ~412-442)
- Test: `test/posTotals.spec.js` (actualizar)

**Interfaces:**
- Consumes: `lineAmounts`, `invoiceTotals`, `isTaxExempt`, `exemptionStatus`, `suggestedVoucher`, `todayRD` (Task 1, `src/utils/tax.js`); campos de cliente de Task 2.
- Produces: `computeTotals(rows, globalDisc, { exempt = false } = {}) => { gross, discAmt, subtotal, tax, total }` donde `subtotal` = base tras descuentos, `tax` = ITBIS sobre esa base, `total = subtotal + tax`, `gross` = base antes de descuentos. Las líneas usan el descuento combinado (`combinedDiscount`) igual que lo que se envía al servidor, y la tasa 0 si `exempt`.

- [ ] **Step 1: Update tests** `test/posTotals.spec.js`: fila `{price:100, qty:1, disc:0, taxable:true, taxRate:18}` sin descuento → `{subtotal:100, tax:18, total:118}`; con `globalDisc 10` → `{subtotal:90, tax:16.2, total:106.2}`; `{exempt:true}` → `{tax:0, total:100}`; mezcla 18 %/exento → coincide con `invoiceTotals` sobre las mismas líneas con `discountPercent = combinedDiscount(...)`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. Ambas vistas: (a) envían `pricesExcludeTax: true` y `unitPrice` = precio de lista sin ITBIS; (b) al elegir cliente calculan `exempt = isTaxExempt(cliente, todayRD())` y lo pasan al cálculo; (c) preseleccionan el comprobante con `suggestedVoucher(cliente, { ecf: company.ecfEnabled, exempt })` cuando cambia el cliente (el cajero puede cambiarlo); (d) si `exemptionStatus` es `'expired'` muestran el aviso "Carnet de exención vencido el DD/MM/AAAA: se cobra ITBIS." y si es `'valid'` una etiqueta "Exento de ITBIS (carnet N.º …)". En la fila del carrito: columna "Precio" = precio sin ITBIS; columna ITBIS = `lineAmounts(...).itbis` o "Exento". Quitar el comentario "Totales con ITBIS incluido en el precio".
- [ ] **Step 4:** `npx vitest --run --globals test/posTotals.spec.js` → PASS y `npx vite build` → "built in".
- [ ] **Step 5: Commit** "POS y Pedidos: precio sin ITBIS, ITBIS según el cliente y comprobante sugerido".

### Task 7: App — documentos y reportes

**Files:**
- Modify: `src/components/modals/InvoiceDetailModal.jsx`, `src/components/modals/ReceivableDetailModal.jsx`, `src/utils/escposGenerator.js` (~80-95), `src/utils/pdfGenerator.js` (~295, ~348, ~552), `src/utils/ecfPrint.js` (si arma montos por línea), `src/views/DashboardViewSQL.jsx` (~138), `src/views/ReportsViewSQL.jsx` (~177, ~401)
- Test: `test/receiptAmounts.spec.js`

**Interfaces:**
- Consumes: `netUnitPrice`, `lineAmounts` (Task 1); `Invoice.pricesIncludeTax`, `Invoice.exemptionNumber` (Task 2).

- [ ] **Step 1: Write the failing test** `test/receiptAmounts.spec.js`: el generador ESC/POS (o la función de texto que use) con una factura nueva `{pricesIncludeTax:false, items:[{quantity:2, unitPrice:100, taxRate:18, subtotal:200}], subtotal:200, taxAmount:36, total:236}` imprime precio unitario "100.00" y total "236.00"; con una vieja `{pricesIncludeTax:true, items:[{quantity:1, unitPrice:118, taxRate:18, subtotal:100}], subtotal:100, taxAmount:18, total:118}` imprime "100.00" y total "118.00". Si la factura tiene `exemptionNumber`, el ticket incluye "Exento de ITBIS — Carnet N.º <número>".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** En todos los documentos y modales: precio unitario mostrado = `netUnitPrice(item, invoice.pricesIncludeTax)`; importe de línea = `item.subtotal` (base); subtotal/ITBIS/total = los guardados en la factura (no recalcular). Reportes y dashboard: ingresos por producto = `Number(item.subtotal)` en vez de `unitPrice * quantity`. El cupón de `InvoiceDetailModal` (~227) sigue usando `unitPrice` tal cual (solo es para validar el cupón).
- [ ] **Step 4:** `npx vitest --run --globals test/receiptAmounts.spec.js` → PASS; `npx vite build` OK.
- [ ] **Step 5: Commit** "Tickets, PDF, detalle y reportes: precio unitario sin ITBIS y montos guardados".

### Task 8: App — formularios de producto y cliente

**Files:**
- Modify: `src/components/modals/ProductModal.jsx` (~160-190), `src/views/ProductsViewSQL.jsx` (columna precio), `src/views/ProductsImportViewSQL.jsx` y el generador de plantilla (`downloadProductTemplate` en `src/utils/`), `src/components/modals/CustomerModal.jsx`, `src/views/CustomersViewSQL.jsx`, `src/views/POSBillingOrdersView.jsx` y `src/views/OrdersViewSQL.jsx` solo en sus formularios de "cliente nuevo" (que envíen `taxpayerType`)
- Test: `test/customerModal.spec.jsx`

**Interfaces:**
- Consumes: `TAXPAYER_TYPES`, `exemptionStatus`, `todayRD`, `lineAmounts` (Task 1); API de clientes de Task 2.

- [ ] **Step 1: Write the failing test** `test/customerModal.spec.jsx` (Testing Library, como `RegisterModal.spec.jsx`): el selector "Tipo de cliente" tiene las 8 etiquetas; al elegir "Zona franca" aparecen "Número de carnet / autorización" y "Vence"; al elegir "Empresa" desaparecen; al guardar envía `taxpayerType`, `exemptionNumber`, `exemptionExpiresAt`; un cliente viejo con `type:'Zona Franca'` y sin `taxpayerType` abre con "Zona franca" seleccionado. Si el tipo es exemptible y el número está vacío, se puede guardar igual (queda `missing`, no exento).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar:
  - Producto: etiqueta "Precio de venta (sin ITBIS)" y debajo "Con ITBIS: RD$ …" calculado con la tasa del producto (o "Exento"); igual para mayoreo. Eliminar "Precio final (ITBIS incluido)." Lista de productos: precio sin ITBIS y, en texto secundario, con ITBIS. Plantilla de importación: encabezado de precio "Precio venta (sin ITBIS)" (el importador acepta también el encabezado viejo).
  - Cliente: el selector usa `TAXPAYER_TYPES`; la etiqueta del documento sigue siendo "Cédula / Pasaporte" para `consumidor_final` y `persona_fisica`, "RNC" para el resto. Campos de carnet solo si `exemptible`, con ayuda: "Verifique el carnet con la app DGII antes de guardar." Lista de clientes: insignia "Exento" (vigente), "Carnet vencido" o nada, según `exemptionStatus`.
- [ ] **Step 4:** `npx vitest --run --globals test/customerModal.spec.jsx` → PASS; `npm test` completo → solo fallan los dos archivos que ya fallaban antes (`test/shipmentsView.spec.jsx` y el snapshot de `RegistrationReviewModal`); `npx vite build` OK.
- [ ] **Step 5: Commit** "Formularios: precio sin ITBIS en productos; tipo de cliente y carnet de exención".

### Task 9: Verificación final y PR

- [ ] **Step 1:** `npm test`, `npx vite build`, `cd backend && npx prisma validate`, `node --check` sobre cada archivo de `backend/src` tocado. Mismos dos fallos previos y nada más.
- [ ] **Step 2:** Buscar restos del supuesto viejo: `grep -rn "ITBIS incluido\|/ (1 + " src backend/src` — solo deben quedar el camino legado de `invoiceAmounts.js` y `netUnitPrice`.
- [ ] **Step 3:** Push de la rama y PR "Precios sin ITBIS e ITBIS según el tipo de cliente" con: qué cambia para el cajero, aviso de que **los precios suben 18 % para clientes que pagan ITBIS al actualizar la app**, orden de despliegue (OTA → copia de seguridad → backend → `docker exec zenda-backend npx prisma migrate deploy`), y la verificación previa del hallazgo e-CF (contar `EcfDocument` en producción antes de desplegar).
