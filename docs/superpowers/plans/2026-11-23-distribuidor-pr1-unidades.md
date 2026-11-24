# Distribuidor PR 1 — Unidades, empaques y fracciones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vender y ajustar inventario por unidad base con fracciones (si el producto lo permite) y por empaques con equivalencia, sin cambiar los totales de lo que ya se vende por unidad entera.

**Architecture:** Un módulo puro de unidades y reglas de cantidad, con dos copias idénticas (app y servidor, como `tax.js`). Las cantidades pasan a `Decimal(14,3)` en Postgres, pero el cliente Prisma las devuelve como `Number` mediante una extensión `result`, para que las apps instaladas sigan comparando y sumando bien. Una tabla nueva `ProductPackaging`; la línea de factura guarda una copia del empaque y descuenta `quantity × packagingFactor` del inventario.

**Tech Stack:** Express 4 + Prisma 5.22 + Postgres 16 (ESM), React 19 + Vite + Tailwind, Vitest. Las pruebas viven en `test/` en la raíz del repo.

**Spec:** `docs/superpowers/specs/2026-11-23-distribuidor-base-design.md` (secciones "Alcance por pantalla y variantes" y "PR 1").

## Global Constraints

- Verificado en el Formato e-CF v1.0 de la DGII: `CantidadItem` es "valor numérico de 16 enteros, 2 decimales; > 0"; `PrecioUnitarioItem` admite 4 decimales; `UnidadMedida` es opcional y se valida con la Tabla IV.
- **Regla de cantidad de una línea** (venta y ajuste): `quantity > 0`, con **a lo sumo 2 decimales**. Las fracciones solo se permiten **en la unidad base** de un producto con `allowFractions = true`. Una línea con empaque siempre lleva cantidad entera.
- Cantidad en unidad base = `quantity × packagingFactor`, redondeada a 3 decimales con `roundQty`. `packagingFactor` tiene a lo sumo 3 decimales.
- Unidades base (código, etiqueta, abreviatura, código DGII Tabla IV): `unidad` Unidad und 43; `docena` Docena doc 13; `libra` Libra lb 23; `onza` Onza oz 61; `kilogramo` Kilogramo kg 21; `gramo` Gramo g 17; `metro` Metro m 26; `centimetro` Centímetro cm 8; `pie` Pie pie 33; `yarda` Yarda yd 41; `litro` Litro L 24; `mililitro` Mililitro ml 59; `galon` Galón gal 15.
- Tipos de empaque (código DGII de la Tabla IV): Caja 6, Saco 46, Paquete 31, Fardo 14, Bolsa 2, Botella 5, Bulto 4, Cajetilla 7, Display 48, Lata 47, Bidón 49, Rollo 35, Docena 13, Unidad 43.
- Las cantidades de `stock`, `minStock`, `maxStock`, `ProductVariant.stock`, `InventoryLog.quantity/previousStock/newStock`, `InvoiceItem.quantity` y `packagingFactor` salen de la API como **números JSON**. Los montos siguen saliendo como texto, como hoy.
- El servidor sigue aceptando facturas sin `packagingId` y con cantidades enteras (apps 1.1.x).
- Una factura de hoy (unidad entera, sin empaque) produce los mismos totales y el mismo XML de e-CF que antes.
- Solo la caja del modo Distribuidor (`POSBillingOrdersView.jsx`) gana selector de empaque y cantidades decimales. La pantalla del modo Tienda (`OrdersViewSQL.jsx`) solo cambia para mostrar bien cantidades decimales.
- Textos de interfaz en español, con el sistema visual de la casa (`input-base`, `Card`, tokens `ink`/`line`/`surface`).
- Commits en español, con `git add` de rutas explícitas. Cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Un producto sin fracciones vendido con cantidad 1.5, por la API o por la caja, se rechaza con un mensaje claro y no descuenta inventario (Task 4, Task 6).
2. Una nota de crédito parcial de 0.5 lb sobre una línea de 2.25 lb devuelve 0.5 al inventario y deja 1.75 por devolver (Task 4).
3. Escanear el código de barras de un empaque agrega la línea con ese empaque y su precio, no la unidad suelta (Task 6).
4. Una app 1.1.x que manda `quantity: 3` sin `packagingId` factura y descuenta igual que hoy (Task 4).
5. Un código de barras de empaque repetido con el de otro producto o variante se rechaza al guardar (Task 3).

---

### Task 1: Módulo de unidades y reglas de cantidad

**Files:**
- Create: `src/utils/units.js`, `backend/src/services/units.js` (copias idénticas a partir de la línea 2; la línea 1 es un comentario distinto en cada una)
- Test: `test/units.spec.js`

**Interfaces:**
- Produces:
  - `BASE_UNITS: Array<{ code, label, abbr, dgii }>` y `PACKAGE_TYPES: Array<{ dgii, label }>`, con los valores de Global Constraints.
  - `unitOf(code) → BASE_UNITS item`; devuelve el de `unidad` si no lo conoce.
  - `roundQty(x) → number`, redondeo a 3 decimales.
  - `baseQuantity({ quantity, factor = 1 }) → number`.
  - `quantityError({ quantity, allowFractions, hasPackaging }) → string | null`.
  - `formatQty(quantity, label) → string`: sin ceros sobrantes, coma de miles es-DO, y la etiqueta detrás ("1.5 lb", "2 Caja de 24").

- [ ] **Step 1: Write the failing test** — en `test/units.spec.js`:
  - `quantityError({ quantity: 1.5, allowFractions: false, hasPackaging: false })` devuelve texto;
  - `quantityError({ quantity: 1.5, allowFractions: true, hasPackaging: false })` devuelve `null`;
  - `quantityError({ quantity: 1.5, allowFractions: true, hasPackaging: true })` devuelve texto;
  - `quantityError({ quantity: 1.555, allowFractions: true, hasPackaging: false })` devuelve texto (máximo 2 decimales);
  - `quantityError({ quantity: 0, … })` y `quantityError({ quantity: -1, … })` devuelven texto;
  - `baseQuantity({ quantity: 3, factor: 0.125 })` vale `0.375`;
  - `roundQty(0.1 + 0.2)` vale `0.3`;
  - `formatQty(1.5, 'lb')` vale `'1.5 lb'` y `formatQty(2, 'und')` vale `'2 und'`;
  - `unitOf('libra').dgii` vale `23` y `unitOf('desconocida').code` vale `'unidad'`;
  - las dos copias son idénticas desde la línea 2, comparadas con `readFileSync` igual que `test/tax.spec.js`.
- [ ] **Step 2:** `npx vitest run test/units.spec.js` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar ambos archivos.
- [ ] **Step 4:** `npx vitest run test/units.spec.js` → PASS.
- [ ] **Step 5: Commit** "Unidades: módulo compartido de unidades base, empaques y regla de cantidad".

### Task 2: Base de datos (cantidades decimales, unidad base, empaques)

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/db.js`
- Create: `backend/prisma/migrations/20261124000000_unidades_empaques/migration.sql`, `backend/src/services/quantityFields.js`
- Test: `test/quantityFields.spec.js`

**Interfaces:**
- Produces:
  - **Esquema:**
    - `Product.allowFractions Boolean @default(false)`; `Product.unit` queda con los códigos de `BASE_UNITS`.
    - `Decimal(14,3)` en: `Product.stock/minStock/maxStock`, `ProductVariant.stock`, `InventoryLog.quantity/previousStock/newStock` e `InvoiceItem.quantity`.
    - `InvoiceItem.packagingId String?` (relación con `ProductPackaging`, `onDelete: SetNull`), `packagingName String?` y `packagingFactor Decimal(14,3) @default(1)`.
  - **Modelo `ProductPackaging`:**
    - campos: `id`, `companyId`, `productId` (cascade), `name`, `factor Decimal(14,3)`, `unitCode Int @default(6)` (código DGII del tipo de empaque), `barcode String?`, `salePrice Decimal(12,2)?`, `isDefaultPurchase Boolean @default(false)`, `status String @default("active")`, `createdAt` y `updatedAt`;
    - índices en `companyId` y en `barcode`.
  - **`QUANTITY_FIELDS`:** objeto `{ product: ['stock','minStock','maxStock'], productVariant: ['stock'], inventoryLog: ['quantity','previousStock','newStock'], invoiceItem: ['quantity','packagingFactor'], productPackaging: ['factor'] }`.
  - **`resultExtension(fields) → objeto para prisma.$extends`:** cada campo listado se calcula como `Number(valor)`, y `null` sigue siendo `null`.
  - **`db.js`** exporta el cliente extendido (`prisma.$extends(resultExtension(QUANTITY_FIELDS))`). Las transacciones interactivas heredan la extensión.

- [ ] **Step 1: Write the failing test** — en `test/quantityFields.spec.js`:
  - `resultExtension(QUANTITY_FIELDS).result.product.stock.compute({ stock: new Prisma.Decimal('9.500') })` vale el número `9.5`;
  - `compute` de `maxStock` con `null` devuelve `null`;
  - cada modelo de `QUANTITY_FIELDS` tiene su entrada en `result`.
- [ ] **Step 2:** Ejecutar la prueba → FAIL.
- [ ] **Step 3:** Esquema y migración SQL:
  - `ALTER COLUMN … TYPE DECIMAL(14,3)` para cada columna de cantidad;
  - `ADD COLUMN` para los campos nuevos y `CREATE TABLE product_packagings`;
  - normalizar `products.unit` con un `CASE lower(trim(unit))`: `und`/`unid`/`unidad`/`u` → `unidad`; `lb`/`lbs`/`libra`/`libras` → `libra`; `kg`/`kilo`/`kilos`/`kilogramo` → `kilogramo`; `g`/`gr`/`gramo` → `gramo`; `oz`/`onza` → `onza`; `m`/`metro` → `metro`; `cm` → `centimetro`; `l`/`lt`/`litro` → `litro`; `ml` → `mililitro`; `gal`/`galon`/`galón` → `galon`; `pie` → `pie`; `yd`/`yarda` → `yarda`; `doc`/`docena` → `docena`; cualquier otro valor → `unidad`.
  - Implementar `quantityFields.js` y extender `db.js`.
- [ ] **Step 4:** Verificar:
  - la prueba pasa;
  - `cd backend && DATABASE_URL=postgresql://u:p@localhost:5432/x npx prisma validate` → "is valid";
  - `npx prisma generate` termina sin error.
- [ ] **Step 5: Commit** "Base de datos: cantidades decimales, unidad base y empaques de producto".

### Task 3: API de productos (unidad base, fracciones, empaques)

**Files:**
- Modify: `backend/src/routes/products.js`
- Create: `backend/src/services/packagings.js`
- Test: `test/packagings.spec.js`

**Interfaces:**
- Consumes: `BASE_UNITS`, `PACKAGE_TYPES` y `quantityError` (Task 1); modelo `ProductPackaging` (Task 2).
- Produces:
  - `validatePackagings(packagings, { takenBarcodes: Set<string> }) → string | null`. Exige `name` no vacío, `factor > 0` con a lo sumo 3 decimales, `unitCode` de `PACKAGE_TYPES`, a lo sumo un `isDefaultPurchase`, y barcodes únicos entre sí y fuera de `takenBarcodes`.
  - El producto en `POST /api/products` y `PUT /api/products/:id` acepta:
    - `unit`: uno de los códigos de `BASE_UNITS`;
    - `allowFractions: boolean`;
    - `packagings: [{ id?, name, factor, unitCode, barcode?, salePrice?, isDefaultPurchase? }]`. Reemplaza el conjunto: crea, actualiza y marca como `inactive` los que faltan. No borra, porque las líneas viejas los referencian.
  - `GET /api/products` y `GET /api/products/:id` incluyen `packagings` activos.
  - `stock`, `minStock` y `maxStock` aceptan decimales (`z.number()`). Si el producto no permite fracciones, los ajustes de `PATCH /:id/stock` validan con `quantityError` (sin empaque).
  - La importación masiva acepta columnas opcionales `unidad` (etiqueta o código) y `permiteFracciones` (sí/no).

- [ ] **Step 1: Write the failing test** — `validatePackagings` rechaza estos casos, cada uno con su mensaje:
  - `factor` 0;
  - `factor` 1.2345;
  - dos `isDefaultPurchase`;
  - barcode repetido dentro de la lista;
  - barcode presente en `takenBarcodes`;
  - `unitCode` 999.

  Y acepta `[{ name: 'Caja de 24', factor: 24, unitCode: 6, barcode: '7460000000017' }]`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar el servicio y las rutas.
  - `takenBarcodes` se arma dentro de la misma transacción con los barcodes de productos, variantes y empaques activos de la empresa, excepto los del producto que se está editando.
- [ ] **Step 4:** PASS. Además, `node --check backend/src/routes/products.js` pasa.
- [ ] **Step 5: Commit** "Productos: unidad base, fracciones y empaques en la API".

### Task 4: Facturas e inventario en el servidor

**Files:**
- Modify: `backend/src/routes/invoices.js`, `backend/src/services/pricing.js`
- Test: `test/invoiceQuantities.spec.js`; actualizar `test/invoiceStock.spec.js` si sus fakes cambian

**Interfaces:**
- Consumes: `quantityError`, `baseQuantity` y `roundQty` (Task 1); `packagings` en el producto (Task 3).
- Produces:
  - `invoiceItemSchema.quantity` pasa a `z.number().positive()`, y la línea acepta `packagingId: z.string().uuid().optional().nullable()`.
  - Al crear la factura, cada línea con producto valida, en este orden:
    1. `packagingId`, si viene, pertenece al producto y está activo; si no, responde 400 `"El empaque no pertenece al producto."`;
    2. `quantityError({ quantity, allowFractions: product.allowFractions, hasPackaging: !!packagingId })`; si hay error, responde 400 con ese texto.
  - `InvoiceItem` guarda `packagingId`, `packagingName` y `packagingFactor` (1 sin empaque).
  - `checkLinePrice(item, product, variant, maxDiscount, packaging?)`: con empaque, el precio de lista válido es `packaging.salePrice` o `roundMoney(factor × precio base)`, y en ambos casos se suma `variant.priceAdjustment` cuando aplica. Sin empaque no cambia nada.
  - `takeStock(tx, companyId, { productId, variantId, quantity, packagingFactor = 1 })` descuenta `baseQuantity({ quantity, factor: packagingFactor })`. `restoreStock` hace lo mismo con el `packagingFactor` guardado en la línea. `InventoryLog.quantity` registra la cantidad en unidad base.
  - Nota de crédito: `quantity` se lee con `Number` (no `parseInt`) y se valida con a lo sumo 2 decimales. Lo que queda por devolver (`left`) y `returnedByNotes` usan `roundQty`.

- [ ] **Step 1: Write the failing test** — con los fakes de `tx` que ya usa `test/invoiceStock.spec.js`:
  - `takeStock` con `quantity: 2, packagingFactor: 24` descuenta 48;
  - `restoreStock` de una línea `{ quantity: 2.25, packagingFactor: 1 }` incrementa 2.25;
  - una línea `quantity: 3` sin empaque ni `packagingFactor` descuenta 3 (compatibilidad 1.1.x);
  - `checkLinePrice` acepta el `salePrice` del empaque y el `factor × precio base`, y con otro precio pide aprobación;
  - `unreturnedLines` con una línea de 2.25 y una nota de 0.5 deja 1.75.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS. También pasan `test/invoiceStock.spec.js`, `test/pricing.spec.js` y `test/voidInvoices.spec.js`.
- [ ] **Step 5: Commit** "Facturas: cantidades decimales, empaques y existencias en unidad base".

### Task 5: e-CF con cantidad decimal y unidad de medida

**Files:**
- Modify: `backend/src/services/ecfXmlBuilder.js`
- Test: `test/ecfQuantities.spec.js`

**Interfaces:**
- Consumes: `unitOf` (Task 1); `InvoiceItem.packagingId`, `packagingFactor` y `unitCode` del empaque, que la carga de la factura para el e-CF incluye (`items: { include: { packaging: true, product: { select: { unit: true } } } }` en el lugar donde hoy se carga).
- Produces:
  - `CantidadItem` = la cantidad de la línea con a lo sumo 2 decimales, sin ceros sobrantes ("2.25", "3").
  - `UnidadMedida` = `packaging.unitCode` si la línea tiene empaque; si no, `unitOf(product.unit).dgii`; `43` si no hay producto.

- [ ] **Step 1: Write the failing test** — con el armado de ítems que ya prueba `test/ecfAmounts.spec.js`:
  - una línea de 2.25 lb da `<CantidadItem>2.25</CantidadItem>` y `<UnidadMedida>23</UnidadMedida>`;
  - una línea de 2 "Caja de 24" da `CantidadItem` 2 y `UnidadMedida` 6;
  - una línea por unidad entera produce exactamente el mismo `CantidadItem`, `UnidadMedida` y monto que antes (43).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS, más `test/ecfAmounts.spec.js`, `test/ecfFinal.spec.js` y `test/ecfNotes.spec.js`.
- [ ] **Step 5: Commit** "e-CF: cantidad con decimales y unidad de medida de la Tabla IV".

### Task 6: Caja del modo Distribuidor

**Files:**
- Modify: `src/views/POSBillingOrdersView.jsx`
- Create: `src/views/pos/catalogEntries.js`
- Test: `test/catalogEntries.spec.js`

**Interfaces:**
- Consumes: `formatQty`, `quantityError`, `baseQuantity` y `unitOf` (Task 1); `packagings` en `/products` (Task 3).
- Produces:
  - `catalogEntries(products) → entries`, que reemplaza el `useMemo` del catálogo. Cada producto, o cada variante como hoy, da una entrada base `{ …, packagingId: null, packagingName: null, factor: 1, unitAbbr }`, y además una entrada por empaque activo `{ id: \`${baseId}#${pk.id}\`, packagingId, packagingName: pk.name, factor, barcode: pk.barcode, salePrice: pk.salePrice ?? factor × precio base, name: \`${nombre} — ${pk.name}\` }`.
  - **Filas del carrito:** guardan `packagingId`, `packagingName`, `factor` y `allowFractions`. Debajo de la descripción va un selector "Unidad" con la opción base y los empaques, y al cambiarlo se reemplazan precio y empaque. La cantidad es un `input` numérico con `step` 0.01 si la fila permite fracciones (unidad base y `allowFractions`), y 1 si no. Los botones ± suman y restan 1. La cantidad se muestra con `formatQty`.
  - **Escaneo:** buscar el código en las entradas, incluidos los barcodes de empaque, y agregar esa entrada.
  - **Al enviar:** `quantity: Number(r.qty)`, `packagingId: r.packagingId || null`. Antes de enviar se valida con `quantityError` y se muestra un toast con el texto si hay error. El chequeo de existencias compara `baseQuantity` acumulada por producto o variante contra `stock`.

- La cola sin conexión (`src/utils/offlineQueue.js`) solo guarda cobros, no facturas: no necesita cambios.

- [ ] **Step 1: Write the failing test** — `catalogEntries`:
  - un producto con un empaque "Caja de 24" (factor 24, sin `salePrice`, precio base 50) da 2 entradas, y la del empaque tiene `salePrice` 1200 y su barcode;
  - un producto con variantes y un empaque da entrada base y entrada de empaque por cada variante;
  - un empaque `inactive` no aparece.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar `catalogEntries` y la vista. **Step 4:** PASS, y `npx vite build` compila.
- [ ] **Step 5: Commit** "Caja: venta por empaque y por fracción en el modo Distribuidor".

### Task 7: Ficha de producto, listado e inventario

**Files:**
- Modify: `src/components/modals/ProductModal.jsx`, `src/views/ProductsViewSQL.jsx`, `src/components/modals/StockModal.jsx`
- Create: `src/components/products/PackagingsEditor.jsx`
- Test: `test/packagingsEditor.spec.jsx`

**Interfaces:**
- Consumes: `BASE_UNITS`, `PACKAGE_TYPES` y `formatQty` (Task 1); contrato de la API de Task 3.
- Produces:
  - **`ProductModal`:** select "Unidad base" con `BASE_UNITS`, interruptor "Permite fracciones (vender por peso o medida)" y la sección "Empaques" con `PackagingsEditor`.
  - **`PackagingsEditor({ value, onChange, baseUnitAbbr, basePrice })`:** filas con nombre, tipo (`PACKAGE_TYPES`), "equivale a N {abbr}", código de barras, precio (vacío = automático, que se muestra como sugerencia) y "Empaque de compra"; botón "Agregar empaque" y quitar fila.
  - **Listado de productos:** existencia y mínimos se muestran con `formatQty`. Las comparaciones de "stock bajo" usan `Number`.
  - **`StockModal`:** permite decimales si el producto permite fracciones (`step` 0.01); si no, enteros.

- [ ] **Step 1: Write the failing test** — `PackagingsEditor`:
  - "Agregar empaque" llama a `onChange` con una fila nueva `{ name: '', factor: 1, unitCode: 6 }`;
  - con `basePrice` 50 y `factor` 24, el precio vacío muestra la sugerencia "1,200.00".
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS y `npx vite build`.
- [ ] **Step 5: Commit** "Productos: unidad base, fracciones y editor de empaques".

### Task 8: Documentos y pantallas que muestran cantidades

**Files:**
- Modify:
  - generador del recibo térmico (`generateThermalReceiptHTML`, en `src/utils/`);
  - `src/utils/escposGenerator.js`;
  - `src/utils/pdfGenerator.js`;
  - `src/components/modals/InvoiceDetailModal.jsx`;
  - `src/components/modals/CreditNoteModal.jsx`;
  - `src/views/OrdersViewSQL.jsx`, solo para mostrar.
- Test: `test/receiptAmounts.spec.js` (ampliar)

**Interfaces:**
- Consumes: `formatQty` y `unitOf` (Task 1); `packagingName` en las líneas (Task 4).
- Produces:
  - **Recibo, PDF y detalle de factura:** cada línea muestra su cantidad con `formatQty(quantity, packagingName || unitOf(product?.unit).abbr)`. Si la línea no tiene datos de unidad (facturas viejas), se muestra el número solo, como hoy.
  - **`CreditNoteModal`:** acepta devoluciones con decimales cuando la línea es fraccionaria (`step` 0.01, máximo lo que queda); con empaque o sin fracciones, solo enteros.

- [ ] **Step 1: Write the failing test** — en `receiptAmounts.spec.js`:
  - el recibo de una línea `{ quantity: 2.25, packagingName: null }` de un producto en libras contiene `2.25 lb`;
  - una línea vieja `{ quantity: 3 }` sigue mostrando `3` y el mismo total.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS, y la suite de recibos y notas no cambia en otros casos.
- [ ] **Step 5: Commit** "Documentos: cantidades con decimales y unidad en recibos, PDF y notas".

### Task 9: Verificación y PR

- [ ] **Step 1:**
  - `npx vitest run`: solo pueden fallar los 2 archivos que ya fallan en `main` (`test/shipmentsView.spec.jsx` y el snapshot huérfano de `RegistrationReviewModal`); restaura ese snapshot con `git restore` si la corrida lo modifica;
  - `npx vite build`;
  - `prisma validate`;
  - `node --check` en cada archivo de `backend/src` tocado.
- [ ] **Step 2:** Si hay Docker, restaura el último respaldo de producción en un Postgres local y corre `npx prisma migrate deploy`. Comprueba que las existencias enteras quedan iguales y que `products.unit` solo contiene códigos válidos. Si no hay Docker, anótalo en el PR como "no ensayado".
- [ ] **Step 3:** Push de la rama y PR "Distribuidor 1/3: unidades, empaques y fracciones". El PR lleva:
  - qué cambia para el usuario;
  - el orden de despliegue: respaldo → backend → migración → OTA y panel web;
  - el aviso de que la migración cambia el tipo de columnas grandes (tiempo de bloqueo breve);
  - lo que no se probó.
