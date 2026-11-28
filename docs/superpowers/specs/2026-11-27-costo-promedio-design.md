# Costo promedio y costos de importación — diseño

Proyecto 3 (inventario avanzado), parte 1 de 5. Rama `inventario-avanzado`, sobre `main` c93b315. El orden del proyecto lo aprobó el dueño el 2026-11-27: costo, kits, conteos, almacenes y lotes.

## Intención
Que el costo de cada producto y el costo de ventas sean reales. Hoy pasan tres cosas:
1. Cada compra recibida **reemplaza** el costo del producto por el último precio (`purchaseOrders.js`, recepción).
2. La factura no guarda el costo de cada línea, así que el asiento de costo de ventas (`chartOfAccounts.js:100`) sale en 0 y el reporte de Costo de Ventas usa el costo actual del producto.
3. El costo se guarda con 2 decimales, y al promediar se pierden centavos.

## Decisiones del dueño
- Orden del proyecto 3: este es el primer PR.
- **Los gastos de importación se escriben al recibir la mercancía**, en la misma pantalla de recepción (opción 1). Una liquidación posterior queda fuera.

## Metas
- **Costo promedio ponderado al recibir:** `nuevo = (max(existencia,0) × costo actual + cantidad base × costo unitario con gastos) ÷ (max(existencia,0) + cantidad base)`.
- **Gastos de importación en la recepción:** flete, seguro, aranceles y otros, como montos (RD$) de esa recepción. Se reparten entre las líneas recibidas **según su valor** (cantidad × costo unitario). El ITBIS de aduana **no** se escribe aquí, porque es crédito fiscal.
- **Costo en cada línea vendida:** `InvoiceItem.costPrice`, con el costo promedio del producto al momento de la venta (por unidad base). El asiento de costo de ventas y el reporte de Costo de Ventas lo usan.
- **Costo con 4 decimales:** `Product.costPrice` pasa a `Decimal(14,4)`.

## No metas
- Liquidación de importación posterior.
- Reajustar el costo de lo ya vendido.
- Costo por almacén y por lote, que llegan en las partes 4 y 5.
- Costo FIFO.
- Variantes (las compras con variantes ya se hacen a mano).

## Anti-metas
- Que el costo promedio cambie al vender o al ajustar la existencia a mano.
- Que una bonificación (costo 0) baje el costo como si fuera gratis por error. Hoy el costo 0 no pisa el costo. Con el promedio, una bonificación sí debe bajarlo (entra mercancía sin costo), y eso es correcto contablemente. **Decisión del diseñador:** la bonificación entra al promedio con costo 0.
- Facturas viejas con el costo de ventas inventado. Las líneas anteriores se quedan sin costo (null) y el reporte usa el respaldo actual solo para ellas.

## Reglas
- **Existencia negativa:** se toma como 0 al promediar, porque no hay costo del faltante. Si la existencia previa es ≤ 0, el costo nuevo es el de la recepción.
- **Recepción con empaque:** el costo unitario de la línea se divide entre el factor del empaque, como hoy, antes de sumarle su parte de los gastos por unidad base.
- **Reparto de los gastos:** proporcional al valor de cada línea. La última línea absorbe el redondeo, y la suma de las partes es igual al total de los gastos.
  - Si todas las líneas tienen valor 0 (todo bonificación), los gastos se reparten por cantidad base.
- **Nota de crédito con devolución de artículos:** lo devuelto vuelve a la existencia sin cambiar el costo promedio. Decisión del diseñador: es lo más simple y casi no mueve el promedio.
- **La recepción guarda en `PurchaseReceipt` los gastos** (`charges: { flete, seguro, aranceles, otros }`) y, en cada línea de `items`, el costo unitario final aplicado. Así queda rastro de cómo se calculó.

## Pantallas
- **ReceiveModal (recepción de compra):** sección plegable "Gastos de importación" con cuatro campos de monto (flete, seguro, aranceles, otros) y la nota "No incluyas el ITBIS de aduana: es crédito fiscal". Cada línea muestra una vista previa del costo unitario final.
- **Ficha del producto:** el costo se muestra con hasta 4 decimales. La edición manual del costo sigue permitida, porque reemplaza el promedio.

## Datos
Migración `20261130000000_costo_promedio`, que solo agrega o amplía:
- `products.costPrice` pasa a `DECIMAL(14,4)`;
- `invoice_items.costPrice DECIMAL(14,4) NULL`;
- `purchase_receipts.charges JSONB NULL`.

## Qué queda a quien construye
- El nombre de la función pura del reparto y del promedio (en `backend/src/services/purchases.js`).
- Dónde se fija el costo de cada línea vendida: el punto donde hoy se crean las `InvoiceItem` y se descuenta la existencia.

## Respuestas a las preguntas del revisor (decisiones del diseñador)
1. **Asiento de costo de ventas** (`chartOfAccounts.js`): usa la **cantidad base** (`quantity × packagingFactor`) × `costPrice`, igual que `CostoDeVentas.jsx`. Hoy está mal para ventas con empaque; se corrige aquí.
2. **Variantes:** la línea con variante guarda el costo de la variante si es mayor que 0 (campo de costo de `ProductVariant`); si no, el del producto. Las variantes no se promedian.
3. **Edición, anulación y notas de crédito.**
   - Una línea conserva el `costPrice` con que nació. Si una ruta vuelve a crear las líneas al editar, debe conservar ese costo; una línea nueva toma el costo actual.
   - La nota de crédito con devolución de artículos reversa el costo de ventas: débito a Inventario y crédito a Costo de Ventas, por la cantidad base devuelta × el `costPrice` de la línea original, solo si ese costo existe.
4. **Momento de la lectura:** el costo de la línea se lee **dentro de la misma transacción** que descuenta la existencia. Una línea sin producto (servicio o texto libre) queda con `costPrice` null.
5. **Redondeo:**
   - El promedio se redondea a 4 decimales al guardar.
   - La edición manual y la importación aceptan hasta 4 decimales y guardan el valor redondeado a 4.
6. **Costo por unidad base en la recepción** (`purchases.js:40`): se redondea a 4 decimales, no a 2. El costo por empaque de la orden (`purchases.js:97`, la sugerencia) sigue en 2. La vista previa del costo final muestra 4.
7. **Recepción parcial:** cada recepción lleva sus propios gastos y los reparte solo entre sus líneas.
