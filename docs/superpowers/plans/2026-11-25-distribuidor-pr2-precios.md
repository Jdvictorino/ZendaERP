# Distribuidor PR 2 — Precios por categoría con escalones · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada categoría de cliente puede tener precio propio por producto o empaque, con escalones por cantidad; la caja lo aplica sola y el servidor lo acepta sin PIN.

**Architecture:** Tabla nueva `CategoryPrice`; una regla pura `resolveUnitPrice` con dos copias idénticas (app y servidor, como `tax.js`/`units.js`); los precios viajan dentro del producto (GET/POST/PUT `/api/products`); el servidor valida cada línea con la regla; Configuración renombra/borra precios junto con la categoría y ofrece pasar el precio al por mayor a "Mayorista".

**Tech Stack:** Express 4 + Prisma 5.22 + Postgres 16 (ESM), React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-distribuidor-base-design.md`, sección "PR 2 — Precios por categoría con escalones" (aprobada). Rama `distribuidor-precios` desde `origin/main` 2d47ada.

## Global Constraints

- Precios sin ITBIS (`Decimal(12,2)`); el ITBIS lo calcula el servidor como hoy.
- `minQuantity Decimal(14,3) @default(1)`, en la unidad de la línea (unidad base, o cantidad de empaques si la fila tiene `packagingId`). La API lo entrega como número JSON (agregarlo a `QUANTITY_FIELDS`).
- Categoría = nombre tal como está en `settings.customerCategories`; se compara sin distinguir mayúsculas y sin espacios a los lados (como `categoryDiscount`). Cliente sin categoría = "Sin categoría" (no tiene precios propios).
- Si aplica un precio propio de la categoría: precio = el de la fila de mayor `minQuantity ≤ cantidad`, descuento sugerido 0, y el % de la categoría **no** se permite encima sin PIN. Si no aplica: precio base y % de la categoría, como hoy.
- El precio propio reemplaza el de la variante (las filas son por producto, valen para todas sus variantes).
- `wholesalePrice` se sigue aceptando sin PIN como hoy; no se migra solo.
- Las apps instaladas viejas siguen funcionando: el servidor no exige campos nuevos y los campos nuevos de la respuesta se ignoran.
- Copias `src/utils/categoryPricing.js` y `backend/src/services/categoryPricing.js` idénticas desde la línea 2.
- Pruebas por archivo con `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>` (la corrida completa se cuelga). Compilar con `npx -y node@22 node_modules/vite/bin/vite.js build`.
- Commits solo con rutas explícitas (nunca `git add -A`), mensaje en español, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Cliente cambia a mitad de la venta: las líneas se re-precian, salvo las que el cajero editó a mano (precio o descuento).
- Escalón exacto: cantidad igual a `minQuantity` usa ese escalón; 0.999 por debajo no.
- Empaque desactivado con precios propios: sus filas no aplican a ninguna línea y no rompen la ficha.
- Renombrar una categoría con clientes y precios: ambos pasan al nombre nuevo; borrarla borra sus precios y nunca toca otras categorías. Un guardado de Configuración sin `customerCategories` (o vacío) no borra nada.
- Pulsar dos veces "Usar los precios al por mayor…" no duplica filas.

---

### Task 1: Regla de precio compartida

**Files:** Create `src/utils/categoryPricing.js`, `backend/src/services/categoryPricing.js` (línea 1 distinta, resto idéntico). Test: `test/categoryPricing.spec.js`.

**Interfaces — Produces:**
- `sameCategory(a: string, b: string) => boolean` (trim + sin mayúsculas; vacío = "Sin categoría").
- `resolveUnitPrice({ basePrice: number, category: string|null, packagingId: string|null, quantity: number, categoryPrices: Array<{category, packagingId, minQuantity, price}>, categoryDiscountPercent: number }) => { price: number, discountPercent: number, fromCategory: boolean }`.

- [ ] Pruebas: sin filas → `{ price: base, discountPercent: categoría, fromCategory: false }`; escalones 1→100, 10→90, 50→80 con cantidad 9.999 → 100, 10 → 90, 60 → 80; fila de empaque no aplica a línea base y viceversa; "mayorista" encuentra fila de "Mayorista"; cliente sin categoría → base; prueba de copias idénticas (patrón de `test/tax.spec.js:67`).
- [ ] Implementar; correr; commit `Precios por categoría: regla compartida con escalones`.

### Task 2: Tabla, migración y API de productos

**Files:** Modify `backend/prisma/schema.prisma`, `backend/src/services/quantityFields.js`, `backend/src/routes/products.js`. Create `backend/prisma/migrations/20261125000000_precios_categoria/migration.sql`, `backend/src/services/categoryPrices.js`. Test: `test/categoryPrices.spec.js`.

**Interfaces — Produces:**
- Modelo `CategoryPrice` (`category_prices`): `id uuid`, `companyId`, `category String`, `productId` (relación con `Product`, `onDelete: Cascade`), `packagingId String?` (relación con `ProductPackaging`), `minQuantity Decimal(14,3) @default(1)`, `price Decimal(12,2)`, `createdAt`; `@@index([companyId, productId])`. Sin índice único en BD (Postgres trata `NULL` como distinto): la unicidad la garantiza el servicio.
- `validateCategoryPrices(rows, { categories: string[], packagingIds: Set<string>, allowFractions: boolean }) => string|null` (primer error en español): categoría existente, precio ≥ 0, `minQuantity > 0` con la regla de cantidad de `units.js` (`quantityError` con `hasPackaging` según la fila), empaque del producto y activo, sin duplicados (categoría sin mayúsculas + empaque + `minQuantity`).
- `saveCategoryPrices(tx, { companyId, productId, rows, categories, packagingIds, allowFractions })`: valida y reemplaza todas las filas del producto (borra y crea).
- `GET/POST/PUT /api/products` incluyen `categoryPrices` (todas las filas del producto, orden categoría, empaque, `minQuantity`). POST/PUT aceptan `categoryPrices` opcional: sin la llave no se tocan (apps viejas). Se guarda después de `savePackagings` dentro de la misma transacción; las categorías salen de `company.settings.customerCategories`.

- [ ] Pruebas de `validateCategoryPrices` (cada error y el caso válido) y de `QUANTITY_FIELDS` (`categoryPrice: ['minQuantity']`).
- [ ] Migración SQL a mano (CREATE TABLE + FKs + índice), `npx prisma validate`; `node --check` de las rutas.
- [ ] Commit `Precios por categoría: tabla, migración y API de productos`.

### Task 3: El servidor acepta el precio de la categoría

**Files:** Modify `backend/src/services/pricing.js`, `backend/src/routes/invoices.js`. Test: `test/pricing.spec.js`, `test/invoiceQuantities.spec.js`.

**Interfaces — Consumes:** `resolveUnitPrice`, `sameCategory` (Task 1). **Produces:**
- `allowedDiscountPercent(pricing, customer, { withCategory = true } = {})`: con `withCategory: false` no cuenta el % de la categoría.
- `checkLinePrice(item, product, variant, maxDiscount, packaging, ctx = {})` con `ctx = { category, categoryDiscountPercent, maxDiscountNoCategory }`: además de los precios de lista acepta el que resuelve la regla con `product.categoryPrices`; si la regla da `fromCategory`, el tope sin PIN es `maxDiscountNoCategory`.
- `validateInvoiceLines(items, productsById, maxDiscount, ctx = {})` pasa `ctx` a cada línea.
- POST `/api/invoices`: carga `categoryPrices` filtradas por la categoría del cliente (`mode: 'insensitive'`) y arma `ctx`.

- [ ] Pruebas: precio de escalón sin PIN; precio de escalón con cantidad menor pide PIN; línea con precio propio + % de la categoría pide PIN, con el descuento propio del cliente no; sin `ctx` todo igual que hoy (las pruebas existentes no cambian).
- [ ] Commit `Precios por categoría: el servidor acepta el precio de la categoría del cliente`.

### Task 4: Configuración — renombrar, borrar, contar y pasar el precio al por mayor

**Files:** Modify `backend/src/routes/settings.js`, `backend/src/services/categoryPrices.js`. Create `backend/src/routes/categoryPrices.js` (montar en `/api/category-prices` donde se montan las demás rutas). Test: `test/categoryPrices.spec.js`.

**Interfaces — Produces:**
- `planCategoryChanges(oldList, newList, migrations) => { renames: Array<{from,to}>, removed: string[] }` (puro): solo renombres cuyo `to` está en la lista nueva y `from` no; `removed` = lo que estaba y ya no está, menos lo renombrado. Lista nueva vacía o ausente → nada.
- PUT `/api/settings`: dentro de la transacción, aplica `_categoryMigrations.entries` a `customer.category` y `categoryPrice.category`, y borra los precios de las categorías quitadas. (Hoy `_categoryMigrations` llega y se ignora: esto arregla también la reasignación de clientes.)
- `wholesaleRows(products, existing, category) => rows` (puro): una fila (`packagingId` null, `minQuantity` 1, `price` = `wholesalePrice`) por producto con `wholesalePrice > 0` sin fila base de `minQuantity` 1 en esa categoría.
- `GET /api/category-prices/summary` → `{ [categoría]: cantidad }`. `POST /api/category-prices/import-wholesale` (admin, manager) → agrega "Mayorista" a `customerCategories` si falta, crea las filas de `wholesaleRows`, responde `{ created }`.

- [ ] Pruebas de `planCategoryChanges` (renombre, borrado, renombre en cadena, lista vacía) y `wholesaleRows` (idempotente: segunda pasada → 0 filas).
- [ ] Commit `Precios por categoría: renombrar y borrar con la categoría, y pasar el precio al por mayor`.

### Task 5: Ficha del producto

**Files:** Create `src/components/products/CategoryPricesEditor.jsx`. Modify `src/components/modals/ProductModal.jsx`, `src/api/client.js` (si hace falta). Test: `test/categoryPricesEditor.spec.jsx`.

**Interfaces — Consumes:** forma de `categoryPrices` de Task 2.
- Editor con filas: Categoría (select de `companyProfile.customerCategories`), Empaque (select: unidad base + empaques **ya guardados**, con nota "Guarda el producto para usar un empaque nuevo"), Desde cantidad, Precio sin ITBIS; agregar/quitar fila. Mismo estilo que `PackagingsEditor`.
- `ProductModal` envía `categoryPrices` solo si se tocó (patrón `packagingsTouched`).

- [ ] Prueba: agrega una fila y `onChange` recibe `{ category, packagingId: null, minQuantity: 1, price }`; el select de empaques no lista los nuevos sin id.
- [ ] Commit `Precios por categoría: sección en la ficha del producto`.

### Task 6: Configuración en la app

**Files:** Modify `src/views/SettingsViewSQL.jsx`, `src/api/client.js`.

- Cada categoría muestra "N precios propios" (de `/summary`).
- Borrar una categoría con precios: el diálogo dice que también se borran sus N precios.
- Botón "Usar los precios al por mayor como precios de la categoría Mayorista" con confirmación que explica que cambia lo que pagan esos clientes; al terminar, toast con `created`.
- El guardado envía `_categoryMigrations` siempre que haya renombres pendientes (hoy depende de `applyMigrations`).

- [ ] Verificación en el navegador local (capturas) y commit `Precios por categoría: Configuración muestra y administra los precios propios`.

### Task 7: La caja aplica el precio de la categoría

**Files:** Modify `src/views/pos/catalogEntries.js`, `src/views/POSBillingOrdersView.jsx`. Create `src/views/pos/linePricing.js`. Test: `test/linePricing.spec.js`, `test/catalogEntries.spec.js`.

**Interfaces — Consumes:** `resolveUnitPrice` (Task 1). **Produces:**
- Cada entrada del catálogo lleva `categoryPrices` de su producto y `basePrice` (precio de lista de esa unidad).
- `repriceRow(row, { category, categoryDiscountPercent }) => row`: si `row.manualPrice`/`row.manualDisc` no los toca; si no, aplica `resolveUnitPrice` con `row.basePrice`, `row.packagingId`, `row.qty`.
- La caja llama `repriceRow` al agregar, al cambiar cantidad o unidad, y a todas las líneas al cambiar de cliente. `onPrice`/`onDisc` marcan `manualPrice`/`manualDisc`. Se envía `discountPercent` por línea como hoy.

- [ ] Pruebas de `repriceRow` (escalón al subir cantidad, vuelve al base al bajarla, cliente sin categoría, línea manual intacta, % de la categoría solo sin precio propio).
- [ ] Prueba en el navegador local con un cliente Mayorista: el precio cambia al llegar al escalón y la venta se cobra sin PIN.
- [ ] Commit `Precios por categoría: la caja aplica precio y descuento de la categoría del cliente`.
