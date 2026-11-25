# Distribuidor PR 3 — Compras y reabastecimiento · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Órdenes de compra a suplidores, recepción parcial que suma inventario y actualiza el último costo, factura del suplidor que crea el gasto 606 sin contar dos veces, y sugerencia de compra que nada crea sin confirmar.

**Architecture:** Reglas puras en `backend/src/services/purchases.js` (totales, recepción, estado, montos de factura, sugerencia) usadas por un router nuevo `/api/purchase-orders`. Tres tablas nuevas y un enlace en `Expense`. Vista nueva "Compras" en la app con lista, formulario, recepción, factura y sugerencias; PDF de la orden con el generador existente.

**Tech Stack:** Express 4 + Prisma 5.22 + Postgres 16 (ESM), React 19 + Vite, jsPDF (ya cargado por `pdfGenerator.js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-distribuidor-base-design.md`, secciones "PR 3 — Compras y reabastecimiento" y "PR 3 — Recortes aprobados por el dueño (2026-11-25)". Rama `distribuidor-compras` desde `origin/main` ca80fc4.

## Global Constraints

- Sin envío por correo (solo PDF). Sin empaque de compra por defecto (sugerencia: empaque de la última línea de orden del producto, si no unidad base). Sin variantes: órdenes solo con productos sin variantes; `PurchaseOrderItem` sin `variantId`.
- `quantity`, `receivedQuantity`, `invoicedQuantity`: `Decimal(14,3)`; agregarlos a `QUANTITY_FIELDS` (la API los entrega como números JSON). `unitCost` `Decimal(12,2)`, **por empaque y sin ITBIS**. Dinero sin ITBIS en catálogo; ITBIS por línea con `taxRate` (0, 16 o 18).
- Cantidades con la regla de `backend/src/services/units.js` (`quantityError({ quantity, allowFractions, hasPackaging })`): línea con empaque = entera; sin empaque, fracciones solo si el producto las permite.
- En el servidor la aritmética de existencias y costos acumula con `Prisma.Decimal`, no con `Number` (anti-objetivo de la spec).
- Estados: `borrador`, `enviada`, `parcial`, `recibida`, `cancelada`. Editar solo en `borrador`; cancelar solo sin recepciones.
- Número `OC-00001`, secuencial por empresa, único (`@@unique([companyId, number])`).
- Permisos (iguales en `backend/src/permissions.js` y `src/utils/permissions.js`; `test/permissions.spec.js` compara): `purchases`: admin, manager, supervisor; `purchases-view`: admin, manager, supervisor, accountant. Registrar la factura del suplidor: `finance-expenses`.
- Gasto creado desde una orden: tipo `'09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA'`, `montoServicios` 0, `montoFacturado = montoBienes`, NCF del suplidor (sin `issueVoucher`).
- Pruebas por archivo con `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>` (la corrida completa se cuelga). Build con `npx -y node@22 node_modules/vite/bin/vite.js build`.
- Commits solo con rutas explícitas, mensaje en español, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Dos recepciones simultáneas de la misma orden no pueden pasar de lo pedido (bloqueo de la fila de la orden dentro de la transacción).
- Recibir 2 cajas de 24 suma 48 unidades y el costo queda `unitCost / 24`; una recepción de 0 en una línea no toca esa línea.
- Facturar dos veces la misma mercancía: la segunda factura solo admite lo recibido y aún no facturado.
- Producto sin suplidor bajo mínimo aparece en "sin suplidor"; producto con variantes bajo mínimo aparece en "revisar a mano", nunca en un borrador.
- Una orden de otra empresa, un producto de otra empresa o un suplidor de otra empresa dan 404/400, nunca se mezclan.

---

### Task 1: Reglas puras de compras

**Files:** Create `backend/src/services/purchases.js`. Test: `test/purchases.spec.js`.

**Interfaces — Produces:**
- `orderTotals(items: Array<{quantity, unitCost, taxRate}>) => { subtotal, itbis, total }` (redondeo a 2 decimales por línea).
- `planReceipt(orderItems, receiptLines: Array<{itemId, quantity}>, productsById) => { changes: Array<{ itemId, productId, quantity, baseQuantity, newReceived, costPrice }>, error: string|null }`: ignora líneas con cantidad 0; error si `itemId` no es de la orden, si la cantidad no cumple `quantityError` (con `hasPackaging` = la línea tiene empaque), si supera lo pendiente (`quantity − receivedQuantity`), o si no queda nada que recibir. `baseQuantity = quantity × packagingFactor`, `costPrice = unitCost / packagingFactor` (2 decimales).
- `nextStatus(items: Array<{quantity, receivedQuantity}>) => 'parcial' | 'recibida'`.
- `planInvoice(orderItems, lines: Array<{itemId, quantity}>) => { montoBienes, itbisFacturado, updates: Array<{itemId, newInvoiced}>, error }`: cantidad ≤ `receivedQuantity − invoicedQuantity`; montos = cantidad × `unitCost` y su ITBIS por `taxRate`.
- `purchaseSuggestions({ products, pendingByProduct, lastPackagingByProduct }) => { bySupplier: { [supplierId]: lines }, noSupplier: lines, reviewByHand: products }` con línea `{ productId, packagingId|null, packagingName, packagingFactor, quantity, unitCost }`: productos activos con `minStock > 0` y `stock ≤ minStock`; objetivo = `maxStock` o `2 × minStock`; necesidad base = objetivo − existencia − pendiente; ≤ 0 se omite; convertida al empaque y **redondeada hacia arriba**; `unitCost` = `costPrice × factor`. Con variantes → `reviewByHand`.

- [ ] Pruebas con valores: totales (2 × 100 al 18 % + 1 × 50 al 0 % → 250 / 36 / 286); recibir 2 cajas de 24 a 1200 → base 48, costo 50.00; sobre-recepción → error; fracción en línea con empaque → error; `nextStatus`; factura de lo recibido y no facturado, y segunda factura que excede → error; sugerencia (min 10, max 50, stock 4, pendiente 6, caja de 12 → 4 cajas; sin max → objetivo 20; sin suplidor; con variantes).
- [ ] Implementar; correr; commit `Compras: reglas de totales, recepción, factura y sugerencia`.

### Task 2: Tablas, migración, permisos y API de órdenes

**Files:** Modify `backend/prisma/schema.prisma`, `backend/src/services/quantityFields.js`, `backend/src/permissions.js`, `src/utils/permissions.js`, `backend/src/index.js` (montar). Create `backend/prisma/migrations/20261126000000_compras/migration.sql`, `backend/src/routes/purchaseOrders.js`. Test: `test/purchases.spec.js`, `test/permissions.spec.js`, `test/quantityFields.spec.js`.

**Interfaces — Produces:**
- Modelos: `PurchaseOrder` (`purchase_orders`): `id`, `companyId`, `number`, `supplierId`, `status @default("borrador")`, `expectedDate DateTime? @db.Date`, `notes?`, `createdById`, `subtotal`, `itbis`, `total` (`Decimal(12,2)`), `sentAt?`, `createdAt`, `updatedAt`; `@@unique([companyId, number])`. `PurchaseOrderItem` (`purchase_order_items`): `id`, `purchaseOrderId` (Cascade), `productId`, `packagingId?`, `packagingName?`, `packagingFactor Decimal(14,3) @default(1)`, `quantity`, `receivedQuantity @default(0)`, `invoicedQuantity @default(0)`, `unitCost`, `taxRate Decimal(5,2)`. `PurchaseReceipt` (`purchase_receipts`): `id`, `purchaseOrderId`, `userId`, `receivedAt @default(now())`, `items Json`, `notes?`. `Expense.purchaseOrderId String?` con relación.
- Router `/api/purchase-orders`: `GET /` (filtros `status`, `supplierId`; `purchases-view`), `GET /:id` (con líneas, recepciones, gastos enlazados), `POST /` (crea borrador; valida suplidor, productos de la empresa, sin variantes, empaque activo del producto, cantidades; calcula totales con `orderTotals`; número `OC-` + 5 dígitos = mayor + 1 dentro de la transacción, reintenta una vez si choca el único), `PUT /:id` (solo borrador; reemplaza líneas), `POST /:id/send` (borrador → `enviada`, `sentAt`), `POST /:id/cancel` (sin recepciones → `cancelada`). Escritura con `purchases`.

- [ ] Pruebas de permisos y `QUANTITY_FIELDS`; migración a mano; `npx prisma validate` (DATABASE_URL de prueba si hace falta); `node --check`.
- [ ] Commit `Compras: tablas, migración, permisos y API de órdenes`.

### Task 3: Recibir mercancía

**Files:** Modify `backend/src/routes/purchaseOrders.js`. Test: `test/purchases.spec.js` (si se extrae algo puro nuevo).

**Interfaces — Consumes:** `planReceipt`, `nextStatus`. **Produces:** `POST /api/purchase-orders/:id/receive` (`purchases`), cuerpo `{ lines: [{ itemId, quantity }], notes? }`, en una transacción: `SELECT ... FOR UPDATE` de la orden (estado `enviada` o `parcial`); `planReceipt`; por cada cambio, existencia `+= baseQuantity` con `Prisma.Decimal`, `InventoryLog` tipo `entrada` (`referenceType: 'purchase_receipt'`, `referenceId` = id de la recepción, existencias antes/después), `costPrice` del producto, `receivedQuantity`; crea `PurchaseReceipt`; estado con `nextStatus`. Responde la orden actualizada.

- [ ] `node --check`; commit `Compras: recepción parcial que suma inventario y actualiza el último costo`.

### Task 4: Factura del suplidor y sugerencia

**Files:** Modify `backend/src/routes/purchaseOrders.js`.

**Interfaces — Consumes:** `planInvoice`, `purchaseSuggestions`. **Produces:**
- `POST /api/purchase-orders/:id/invoice` (`finance-expenses`), cuerpo `{ lines: [{ itemId, quantity }], ncf, invoiceDate, paymentType? }`: en una transacción con la orden bloqueada, `planInvoice`, crea el `Expense` (suplidor, nombre, RNC del suplidor, `montoBienes`, `itbisFacturado`, `montoFacturado`, tipo de las restricciones, `purchaseOrderId`, `userId`) y suma `invoicedQuantity`. Responde el gasto.
- `GET /api/purchase-orders/suggestions` (`purchases`): productos activos de la empresa con existencia, mínimos, `costPrice`, suplidor y si tienen variantes; pendiente por producto = Σ (`quantity − receivedQuantity`) × factor de órdenes `enviada`/`parcial`/`borrador`; último empaque por producto desde la línea de orden más reciente; responde `purchaseSuggestions(...)`.

- [ ] `node --check`; commit `Compras: factura del suplidor al 606 y sugerencia de compra`.

### Task 5: PDF de la orden

**Files:** Modify `src/utils/pdfGenerator.js`. Test: `test/invoiceFormat.spec.js` (o uno nuevo) para lo puro que se agregue.

**Interfaces — Produces:** `generatePDF(order, 'purchase-order', companyProfile, supplier, emitterInfo, action)`: título "Orden de Compra", número `order.number`, fecha, bloque "Suplidor" (nombre, RNC, teléfono), tabla Cant. | Descripción (con empaque) | Costo | ITBIS | Valor con los `unitCost`, totales (subtotal, ITBIS, total), notas y fecha esperada. Sin datos bancarios ni QR. Reutiliza encabezado, tarjetas y tabla existentes.

- [ ] Verificación: generar un PDF de muestra y mirarlo; commit `Compras: PDF de la orden de compra`.

### Task 6: Vista "Compras" en la app

**Files:** Create `src/views/PurchasesView.jsx`, `src/components/purchases/PurchaseOrderForm.jsx`, `src/components/purchases/ReceiveModal.jsx`, `src/components/purchases/SupplierInvoiceModal.jsx`. Modify `src/api/client.js`, `src/hooks/useNavigationItems.js` (entrada "Compras" en Gestión de Almacén con permiso `purchases-view`), `src/App.jsx` (ruta). Test: `test/purchasesView.spec.jsx` (lo esencial: lista y totales del formulario).

- Lista con filtros por estado y suplidor; botones según estado y permiso: editar (borrador), enviar, descargar PDF, recibir (enviada/parcial), registrar factura (con lo recibido sin facturar y permiso `finance-expenses`), cancelar (sin recepciones).
- Formulario: suplidor, fecha esperada, notas, líneas (producto sin variantes, unidad base o empaque, cantidad, costo por unidad de la línea sin ITBIS prellenado con `costPrice × factor`, ITBIS del producto); totales en vivo con la misma fórmula que `orderTotals`.
- Recepción: por línea, pendiente y cantidad a recibir (por defecto todo lo pendiente).
- Factura del suplidor: por línea, recibido sin facturar y cantidad a facturar; NCF, fecha y forma de pago; muestra bienes, ITBIS y total antes de confirmar.
- Pestaña "Sugerencias": por suplidor con cantidades editables y "Crear borrador" (un `POST /` por suplidor); "sin suplidor" con selector de suplidor; "revisar a mano" solo lista.

- [ ] Prueba de componente; build con Node 22; commit `Compras: vista de órdenes, recepción, factura del suplidor y sugerencias`.
