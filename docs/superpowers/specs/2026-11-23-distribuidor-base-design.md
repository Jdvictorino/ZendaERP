# Base del modo Distribuidor: unidades, precios por categoría y compras

Proyecto 1 de la hoja de ruta inspirada en Odoo. Se entrega en **tres PR seguidos**, cada uno con revisión, respaldo y despliegue propios.

## Intención

Que una distribuidora, un colmado o una carnicería pueda, sin hacer cuentas a mano:

- vender y comprar por empaque (caja de 24, saco de 100 lb) y, si su negocio lo pide, por fracción (1.5 libras, 2.25 metros);
- cobrarle a cada tipo de cliente su precio, con descuento por volumen;
- pedirle mercancía a sus suplidores, recibirla (aunque llegue incompleta) y registrar la factura del suplidor sin escribirla dos veces.

Hoy el producto tiene un precio de venta y un precio al por mayor, una "unidad" que es solo texto, inventario en números enteros, y las compras (606) no suman inventario. Este proyecto cubre lo que un negocio dominicano obtendría de Odoo en ventas al por mayor y compras.

## Decisiones del dueño

- Las fracciones también se necesitan, pero solo para negocios como colmados y carnicerías: es un ajuste **por producto** ("permite fracciones").
- Los precios por cliente **amplían las categorías de cliente que ya existen** (Configuración → Clientes y Precios); no se crea un concepto aparte de "lista de precios".
- Si el producto tiene precio propio en la categoría del cliente, **se usa ese precio y el % de descuento de la categoría no se suma encima**. Si no lo tiene, sigue como hoy: precio normal menos el % de la categoría.
- Precio por cantidad (escalones) sí; precio por cliente individual y vigencias por fecha, no (opción B).
- Compras y reabastecimiento según la propuesta: orden → recepción parcial → factura del suplidor que llena el 606; sugerencia de compra que nunca crea nada sin confirmar.
- Enfoque A (tablas nuevas) en tres PR. Compilar la app con Node 22 LTS (`npx node@22`), no con el Node 26 instalado.

## Enfoques considerados

| | Qué es | Por qué sí / no |
|---|---|---|
| **A. Tablas nuevas (elegido)** | `ProductPackaging`, `CategoryPrice`, `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseReceipt`; cantidades a decimal | El servidor valida cada precio y empaque con consultas; reportes e importación los leen directo. Cuesta varias migraciones en producción. |
| B. JSON dentro del producto | Empaques y precios guardados en un campo JSON | Validar un precio obliga a abrir el producto; reportes e importación se complican. Descartado por rendimiento y fragilidad con catálogos grandes. |
| C. Listas de precios aparte (Odoo) | Entidad "lista" asignada a clientes | El dueño eligió usar las categorías existentes. |

## Objetivos

1. Cantidades decimales (3 decimales) en existencias, movimientos, líneas de factura, devoluciones y compras.
2. Unidad base por producto, de una lista cerrada, y empaques con equivalencia, código de barras y precio propios.
3. Precios por categoría de cliente, por producto o empaque, con escalones por cantidad; el precio al por mayor actual migra a la categoría "Mayorista".
4. Órdenes de compra con recepción parcial, actualización de inventario y del último costo, factura del suplidor que crea el gasto 606 ya lleno, y sugerencia de reabastecimiento.

## No objetivos (en este proyecto)

- Costo promedio, almacenes o sucursales, lotes y vencimientos, costos de importación (proyecto 3).
- Precio por cliente individual, precios con vigencia por fechas, listas por suplidor, licitaciones o solicitudes de cotización a varios suplidores.
- Crear órdenes de compra sin confirmación del usuario.
- Retirar la columna `wholesalePrice`: se deja de usar pero se conserva hasta un proyecto posterior.

## Anti-objetivos (fracaso aunque funcione)

- Que cambie el monto de cualquier factura, nota o e-CF ya emitido, o que los totales de una factura nueva difieran de los actuales para el mismo caso con unidad y cantidad entera.
- Que se pueda vender una fracción de un producto que no la permite (media botella).
- Que el inventario se desvíe por redondeo: en el servidor la aritmética de cantidades y costos usa `Prisma.Decimal`, nunca `Number` para acumular.
- Que una migración deje productos, facturas o clientes inutilizables, o que se pierda un precio al por mayor existente.

## Restricciones

- Los precios del catálogo **no incluyen ITBIS** (PR #37); los precios por categoría y por empaque tampoco. El ITBIS se calcula en el servidor como hoy.
- La API devuelve los `Decimal` como texto (`"2360.00"`); el frontend ya usa `num()` para sumarlos y debe hacerlo también con las cantidades.
- e-CF: `CantidadItem` y `UnidadMedida` deben cumplir el Formato e-CF v1.0 de la DGII. **Hay que verificar en el PDF oficial** cuántos decimales admite `CantidadItem` y los códigos de la Tabla IV (unidades de medida); cómo leer los PDF de la DGII está en `docs` y en la memoria del proyecto (dgii.gov.do responde 403 a curl). Hoy el código envía `UnidadMedida: '43'` comentado como "Unidad". Si `CantidadItem` admite menos de 3 decimales, la cantidad vendida por línea se limita a los decimales que admita el e-CF.
- Cada migración va precedida de un respaldo (`backup.sh`, renombrado `zenda_db_<fecha>_antes-vX.Y.Z.sql.gz`) y se ensaya antes contra una copia local del último respaldo si hay Docker disponible.
- Las apps instaladas de versiones anteriores siguen llamando a la API: el servidor nuevo debe aceptar facturas sin empaque ni cantidades decimales (comportamiento actual) y las respuestas pueden traer campos nuevos que las apps viejas ignoran.
- Permisos por vista con `rolesFor` (`backend/src/permissions.js`); roles existentes: admin, manager, supervisor, cashier, driver, accountant, viewer.

## Diseño

### PR 1 — Unidades, empaques y fracciones

**Datos**

- `Product.unit` (texto libre) pasa a ser la **unidad base**, con una lista cerrada en un módulo compartido: unidad, docena, libra, onza, kilogramo, gramo, metro, centímetro, pie, yarda, litro, mililitro, galón. Cada una con su abreviatura para pantalla e impresión y su código DGII de la Tabla IV (verificado). Valores actuales que no estén en la lista migran a "unidad".
- `Product.allowFractions Boolean @default(false)`.
- A `Decimal(14,3)`: `Product.stock`, `minStock`, `maxStock`; `ProductVariant.stock`; `InventoryLog.quantity`, `previousStock`, `newStock`; `InvoiceItem.quantity`. Las cantidades dentro del JSON `CreditNote.items` aceptan decimales.
- Tabla nueva `ProductPackaging`: `id`, `companyId`, `productId`, `name` ("Caja de 24"), `factor Decimal(14,3) > 0` (equivalencia en unidad base), `barcode?` (único por empresa entre productos, variantes y empaques), `salePrice Decimal(12,2)?` (precio del empaque completo; si falta, `factor × precio base`), `isDefaultPurchase Boolean` (a lo sumo uno por producto), `status`.
- `InvoiceItem` agrega `packagingId?` y copias inmutables `packagingName?` y `packagingFactor Decimal(14,3) @default(1)`. `quantity` es la cantidad **en la unidad vendida** (empaques si hay empaque); el inventario descuenta `quantity × packagingFactor`.

**Reglas**

- Una cantidad de línea es válida si es > 0, tiene a lo sumo 3 decimales y, si el producto **no** permite fracciones, `quantity × factor` es entero. Se valida en el servidor (esquema de facturas y rutas de inventario) y en la app.
- `checkLinePrice` acepta, además de los precios de hoy, el precio del empaque (`salePrice` o `factor × precio base`, más el ajuste de variante si aplica).
- Notas de crédito, anulaciones y borrado de facturas devuelven `quantity × packagingFactor` a inventario, con decimales.

**App**

- Ficha del producto: unidad base, "Permite fracciones" y una sección de empaques (agregar, editar, desactivar).
- Caja y pedidos: si el producto tiene empaques, la línea muestra un selector de unidad; el precio cambia al del empaque. Escanear el código de un empaque agrega la línea ya con ese empaque. La cantidad admite decimales solo si el producto permite fracciones. Las cantidades se muestran con la abreviatura ("1.5 lb", "2 cajas").
- Recibo térmico, PDF, detalle de factura, notas e inventario muestran cantidad decimal con su unidad.
- e-CF: `CantidadItem` con los decimales que admita la DGII y `UnidadMedida` según la unidad base o el empaque (si la Tabla IV no tiene un código para el empaque, se usa el de la unidad base, convirtiendo la cantidad y el precio unitario en consecuencia para que el monto de la línea no cambie).
- Modo sin conexión: la cola local guarda y envía cantidades decimales y el empaque.
- Importación desde Excel: columnas opcionales de unidad base y "permite fracciones".

### PR 2 — Precios por categoría con escalones

**Datos**

- Tabla nueva `CategoryPrice`: `id`, `companyId`, `category` (nombre de la categoría tal como está en `settings.customerCategories`), `productId`, `packagingId?`, `minQuantity Decimal(14,3) @default(1)`, `price Decimal(12,2)` (sin ITBIS). Único por (`companyId`, `category`, `productId`, `packagingId`, `minQuantity`).
- Migración de datos: por cada producto con `wholesalePrice` > 0, una fila en la categoría "Mayorista" con `minQuantity` 1; si la empresa no tiene esa categoría, se agrega a `settings.customerCategories`. `wholesalePrice` deja de leerse.

**Regla de precio (módulo puro compartido entre app y servidor, con prueba que compara las dos copias como `tax.js`)**

`resolveUnitPrice({ basePrice, category, productId, packagingId, quantity, categoryPrices, categoryDiscountPercent })`:

1. Filas de la categoría del cliente para ese producto y empaque con `minQuantity ≤ quantity`; si hay, gana la de mayor `minQuantity`: precio = su `price`, descuento sugerido = 0.
2. Si no hay: precio = precio base del producto o empaque; descuento sugerido = % de la categoría (como hoy).

Cliente sin categoría → "Sin categoría". La caja recalcula el precio al cambiar la cantidad, el empaque o el cliente.

**Servidor**: `checkLinePrice` acepta el precio que resuelve la regla para ese cliente y cantidad, o el precio base; cualquier otro precio, o un descuento por encima del permitido, pide PIN como hoy. Cupones y descuentos se aplican sobre el precio de la línea como hoy.

**App**

- Ficha del producto: sección "Precios por categoría" con filas (categoría, empaque, desde cantidad, precio).
- Configuración → Clientes y Precios: cada categoría muestra cuántos precios propios tiene. Renombrar una categoría renombra sus precios; borrarla pide confirmación y borra sus precios.

### PR 3 — Compras y reabastecimiento

**Datos**

- `PurchaseOrder`: `id`, `companyId`, `number` (OC-00001, secuencial por empresa), `supplierId`, `status` (borrador, enviada, parcial, recibida, cancelada), `expectedDate?`, `notes?`, `createdById`, `subtotal`, `itbis`, `total`, fechas.
- `PurchaseOrderItem`: `productId`, `packagingId?`, `packagingName`, `packagingFactor`, `quantity Decimal(14,3)`, `receivedQuantity Decimal(14,3) @default(0)`, `unitCost Decimal(12,2)` (por empaque, sin ITBIS), `taxRate`.
- `PurchaseReceipt`: `purchaseOrderId`, `userId`, `receivedAt`, `items Json` (`[{ itemId, quantity }]`), `notes?`.
- `Expense.purchaseOrderId?` para enlazar la factura del suplidor; una orden puede tener varias facturas.

**Flujo**

- Crear y editar en borrador; enviar al suplidor en PDF o por correo (servicio de correo existente); cancelar solo si no tiene recepciones.
- Recibir (total o parcial) en una transacción: por cada línea, `stock += cantidad × factor`, movimiento `entrada` con referencia a la recepción, `costPrice` del producto = `unitCost / factor` (último costo), `receivedQuantity` acumulado; no se puede recibir más de lo pendiente. Estado pasa a parcial o recibida.
- "Registrar factura del suplidor" desde la orden abre el formulario de gasto (606) ya lleno con suplidor, RNC, montos de bienes e ITBIS de lo recibido; el usuario escribe el NCF y confirma. El gasto queda enlazado a la orden.
- **Sugerencia de compra**: productos activos con `minStock > 0` y `stock ≤ minStock`, agrupados por `supplierId` (los que no tienen suplidor aparecen aparte y piden elegirlo). Cantidad sugerida en unidad base = (`maxStock` o, si falta, `2 × minStock`) − existencia − lo pendiente de recibir en órdenes abiertas, convertida al empaque de compra por defecto y redondeada hacia arriba. El usuario ajusta y confirma; se crea un borrador por suplidor.

**App**: vista nueva "Compras" (lista con filtros por estado y suplidor, formulario de orden, modal de recepción, pestaña de sugerencias). Permiso nuevo `purchases` para admin, manager y supervisor; el contador ve las órdenes en modo lectura.

## Pruebas mínimas

- Regla de cantidad (fracciones sí/no, factor, decimales) y conversión a unidad base.
- `resolveUnitPrice` (escalones, sin fila, empaque, cliente sin categoría) y la prueba de copias idénticas.
- `checkLinePrice` con empaques y precios por categoría.
- Recepción parcial: existencia, último costo, estado y bloqueo de sobre-recepción.
- Sugerencia de compra con pendientes y empaque de compra.
- e-CF: línea con empaque y línea fraccionaria generan cantidad, unidad y monto correctos; factura entera de hoy produce el mismo XML que antes.
- Migración: precios al por mayor pasan a "Mayorista" y las cantidades enteras quedan iguales.

## Queda a criterio de quien construye

- Nombres internos, estructura de componentes y dónde vive el módulo de unidades compartido.
- Diseño visual dentro del sistema de la casa (tokens, `Card`, `KpiCard`, tablas).
- Paginación y búsqueda de la vista de Compras.
- Formato exacto del número de orden si ya existe un generador de secuencias reutilizable.
