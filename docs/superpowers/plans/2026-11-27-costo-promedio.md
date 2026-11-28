# Costo promedio y costos de importación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costo promedio ponderado al recibir compras, con los gastos de importación incluidos, y costo de ventas real guardado en cada línea vendida.

**Architecture:**
- Las funciones puras viven en `backend/src/services/purchases.js`: el reparto de gastos y el promedio.
- La ruta de recepción las aplica dentro de su transacción.
- La venta fija `InvoiceItem.costPrice` dentro de la transacción que descuenta la existencia.
- La contabilidad y el reporte de Costo de Ventas usan ese costo.

**Tech Stack:** Express 4 + Prisma 5.22 + Postgres 16 (ESM), React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-costo-promedio-design.md` (incluye las respuestas al revisor)

## Global Constraints
- Todo texto visible va en español.
- La fórmula del promedio es `nuevo = (max(stock,0) × costo actual + qBase × costoUnitFinal) ÷ (max(stock,0) + qBase)`. Si `max(stock,0) + qBase` es 0, el costo queda igual.
- El promedio se redondea a 4 decimales.
- Los gastos (`flete`, `seguro`, `aranceles`, `otros`, en RD$ y ≥ 0) se reparten **por valor** de línea (cantidad × costo unitario de la orden).
  - Si todo el valor es 0, se reparten por cantidad base.
  - La última línea absorbe el redondeo, y la suma de las partes es igual al total.
- El costo unitario final por unidad base es `unitCost/factor + parteGasto/qBase`, con 4 decimales.
- Una bonificación (costo 0) entra al promedio con costo 0.
- Lo devuelto por nota de crédito no cambia el promedio.
- La venta guarda `costPrice` por unidad base:
  - en una variante, el costo de la variante si es mayor que 0; si no, el del producto;
  - en una línea sin producto, null.
- El asiento de costo de ventas usa la cantidad base (`quantity × packagingFactor`) × `costPrice`.
- Migración `20261130000000_costo_promedio`, que solo agrega o amplía:
  - `products."costPrice" DECIMAL(14,4)`;
  - `invoice_items."costPrice" DECIMAL(14,4) NULL`;
  - `purchase_receipts.charges JSONB NULL`.
- Pruebas por archivo: `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>`.
- Build: `npx -y node@22 node_modules/vite/bin/vite.js build`.
- Commits con rutas explícitas.
- Las rutas no tienen prueba contra la BD: la lógica va en funciones puras con prueba.

## Review Focus
1. Existencia negativa o en cero al recibir: el costo nuevo es el de la recepción. → Tarea 1.
2. Recepción con empaque y gastos: el costo final es por unidad base. → Tarea 1.
3. Venta por caja: el costo de ventas del asiento es 12 × costo por unidad. → Tarea 3.
4. Facturas viejas sin `costPrice`: el asiento no inventa costo y el reporte usa el respaldo actual solo para ellas. → Tarea 3.
5. Recepción y venta simultáneas: el costo se lee dentro de la transacción. → Tarea 3, en revisión.

---

### Task 1: Funciones puras de reparto y promedio

**Files:** Modify `backend/src/services/purchases.js`; Test `test/purchases.spec.js` (extender)

**Interfaces (Produces):**
- `allocateCharges(lines: [{ itemId, quantity, unitCost, factor }], charges: {flete,seguro,aranceles,otros}) => { [itemId]: number }`, en RD$ por línea.
- `averageCost(stock, currentCost, qBase, unitCostFinal) => number`, con 4 decimales.
- `planReceipt(orderItems, receiptLines, productsById, charges = {})`: ahora cada cambio trae `unitCostFinal`, por unidad base con 4 decimales. Mantiene `costPrice` con el mismo valor, para compatibilidad.
- `validateCharges(charges) => string | null`: rechaza montos negativos o que no son números.

- [ ] **Step 1: Pruebas.**
  - `allocateCharges`:
    - dos líneas de valor 100 y 300 con flete 40 → 10 y 30;
    - con un total que no divide exacto (por ejemplo 10 entre 3 líneas iguales), las partes suman 10.00 exacto;
    - todo bonificación → reparto por cantidad base.
  - `averageCost`:
    - `(10, 5, 10, 7)` → 6;
    - `(-3, 5, 10, 7)` → 7;
    - `(0, 0, 0, 0)` → 0;
    - una bonificación `(10, 6, 10, 0)` → 3.
  - `planReceipt`: un empaque de factor 12 a 120 por caja, con 1 caja y flete 12 → `unitCostFinal` 11.0000.
  - `validateCharges`: `{ flete: -1 }` → mensaje en español.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. Cambia `round2` por un redondeo a 4 decimales solo donde va el costo por unidad base.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `Costo promedio: reparto de gastos y promedio`.

### Task 2: Migración y recepción con costo promedio

**Files:** Modify `backend/prisma/schema.prisma`; Create `backend/prisma/migrations/20261130000000_costo_promedio/migration.sql`; Modify `backend/src/routes/purchaseOrders.js` (recepción) y `backend/src/routes/products.js` (4 decimales en el esquema zod y en la importación); Test `test/purchases.spec.js`

**Interfaces:**
- **Consumes:** Tarea 1.
- **Produces:**
  - el POST de recepción acepta `charges` opcional y lo valida con `validateCharges`;
  - dentro de la transacción, por cada cambio:
    1. lee la existencia y el costo actuales del producto;
    2. calcula `averageCost`;
    3. hace `update` con `stock: { increment }` y `costPrice: promedio`;
  - `PurchaseReceipt` guarda `charges` y, en `items`, `unitCostFinal` por línea.

- [ ] **Step 1: Pruebas.**
  - Si la lectura y el cálculo se pueden extraer a una función pura, pruébala con un producto de existencia 10 y costo 5 que recibe 10 a 7 → costo 6.
  - `products.js` acepta `costPrice: 5.1234` y lo guarda con 4 decimales. Pruébalo con su función de transformación, si existe.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
  - La lectura del costo y el `update` van en la misma transacción, como hoy.
  - Para que una recepción simultánea no pise el promedio, haz `select ... FOR UPDATE` del producto (con `$queryRaw`) antes de calcular, o un `update` condicionado. Elige el patrón que ya use el repo, si hay uno.
  - Corre `cd backend && npx prisma validate && npx prisma generate`. Si `prisma validate` lo pide, usa una `DATABASE_URL` falsa.
- [ ] **Step 4:** Correr → PASS. Haz `node --check` de las rutas.
- [ ] **Step 5:** Commit `Costo promedio: migración y recepción`.

### Task 3: Costo en cada venta, contabilidad y reporte

**Files:** Modify `backend/src/routes/invoices.js` y el servicio de facturación de pedidos si crea líneas (`src/views/services/billOrderTx` o el que corresponda en el backend; búscalo con grep `invoiceItem` y `takeStock`), `src/utils/chartOfAccounts.js`, `src/components/accounting/CostoDeVentas.jsx`; Test `test/invoiceStock.spec.js` o uno nuevo `test/saleCost.spec.js`, y `test/noteSplit.spec.js` (asiento de la nota)

**Interfaces:**
- **Produces:**
  - Al crear la factura, cada línea con producto guarda `costPrice`:
    - el costo de la variante si es mayor que 0; si no, el del producto;
    - leído dentro de la transacción que descuenta la existencia.
  - Una edición que vuelve a crear las líneas conserva el `costPrice` de las existentes.
  - `invoiceToJournalEntries`: el costo de ventas es la suma de `costPrice × quantity × (packagingFactor || 1)`, solo de las líneas con `costPrice` no null.
  - `creditNoteToJournalEntries`: si la nota devuelve artículos (`note.items` con `itemId` y `quantity`) y la línea original tiene `costPrice`, agrega débito a Inventario y crédito a Costo de Ventas por la cantidad base devuelta × `costPrice`.
  - `CostoDeVentas.jsx`: usa `item.costPrice` y, solo si es null, el costo actual del producto, como hoy.

- [ ] **Step 1: Pruebas.**
  - Una función pura `lineCost(product, variant) => number | null`: con variante de costo 8 → 8; con variante de costo 0 → el del producto; sin producto → null.
  - Asiento:
    - una línea de 2 cajas de factor 12 con costPrice 5 → costo de ventas 120;
    - una línea con costPrice null → no suma.
  - Nota de crédito que devuelve 1 caja → débito a Inventario de 60 y crédito a Costo de Ventas de 60, con el asiento cuadrado.
  - CostoDeVentas: una línea con costPrice usa ese costo; una con null usa el respaldo.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS, junto con las pruebas existentes de invoices, voidInvoices y noteSplit. Haz `node --check`.
- [ ] **Step 5:** Commit `Costo promedio: costo en cada venta, contabilidad y reporte`.

### Task 4: Pantallas

**Files:** Modify `src/components/purchases/ReceiveModal.jsx`, `src/api/client.js` (si la recepción no manda `charges`), y el formulario de producto (busca el campo `purchasePrice`/`costPrice`); Test `test/purchasesView.spec.jsx` o uno nuevo `test/receiveCharges.spec.jsx`

**Interfaces:** Consumes las Tareas 1 y 2 (`charges` en el POST de recepción; `allocateCharges` en la copia de la app, si existe; si no, calcula la vista previa con la misma fórmula, documentada).

- [ ] **Step 1: Pruebas.**
  - ReceiveModal muestra la sección plegable "Gastos de importación" con cuatro campos y la nota "No incluyas el ITBIS de aduana: es crédito fiscal".
  - Con flete 12 y 1 caja de 120 (factor 12), la vista previa del costo unitario muestra 11.0000.
  - Al confirmar, la recepción manda `charges` con números.
  - Un monto negativo muestra un error y no manda nada.
  - El formulario de producto acepta el costo con 4 decimales.
- [ ] **Step 2:** Correr → falla.
- [ ] **Step 3:** Implementar. Si la app necesita `allocateCharges`, crea `src/utils/purchases.js` como copia idéntica desde la línea 2 de la función, o importa solo lo necesario. Elige el patrón de copias que ya usa el repo.
- [ ] **Step 4:** Correr → PASS. Corre el build.
- [ ] **Step 5:** Commit `Costo promedio: gastos de importación en la recepción`.
