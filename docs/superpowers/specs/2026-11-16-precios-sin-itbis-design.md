# Precios sin ITBIS e ITBIS según el tipo de cliente — diseño

Rama: `precios-sin-itbis` (desde `main` con los PR #33 y #34 fusionados).

## Intención

Hoy el precio del producto se guarda con el ITBIS incluido y el sistema lo "extrae" al vender. El dueño quiere lo contrario, que es lo correcto para facturación fiscal en RD:

- El precio unitario se muestra y se guarda **sin ITBIS** en todas las pantallas y documentos; el ITBIS se suma aparte.
- El ITBIS depende del **tipo de cliente** según la DGII: un cliente de zona franca o régimen especial con carnet vigente compra sin ITBIS.
- El formulario de clientes ofrece los tipos correctos y permite registrar el **carnet / autorización de exención** con su vencimiento.

Éxito: una venta a un consumidor final de un producto de 100 cobra 100 + 18 = 118; la misma venta a una empresa de zona franca con carnet vigente cobra 100 con comprobante E44/B14; con el carnet vencido cobra 118 y avisa. Los montos de la factura, el ticket, el PDF y el XML del e-CF cuadran entre sí al céntimo.

## Decisiones del dueño

- **B — el precio guardado pasa a ser sin ITBIS.** El ITBIS se suma encima.
- **2 — los números de precio existentes NO se convierten.** Un producto que hoy vale 500 pasa a valer 500 + ITBIS. Aplica a `salePrice`, `wholesalePrice`, `ProductVariant.salePrice` y `priceAdjustment`. No hay migración de precios.
- **1 — el servidor decide el ITBIS.** Busca el cliente, determina si está exento y fija la tasa de cada línea; la app hace el mismo cálculo solo para mostrarlo. El servidor rechaza una factura que quite el ITBIS a un cliente no exento.

## Enfoques considerados

1. **El servidor decide (elegido).** Coherente con la auditoría de seguridad (PR #34): todo lo que vale dinero lo valida el servidor (`pricing.js`).
2. **La app decide y el servidor acepta.** Más corto, pero cualquiera con acceso a caja podría facturar sin ITBIS; descartado.

Para el precio: A (seguir guardando con ITBIS y solo mostrar la base) se descartó por decisión del dueño.

## Reglas DGII (investigadas 2026-11-16)

| Tipo de cliente | Comprobante sugerido (e-CF / papel) | ITBIS |
|---|---|---|
| Consumidor final | E32 / B02 | tasa del producto |
| Persona física con RNC o cédula (crédito fiscal) | E31 / B01 | tasa del producto |
| Empresa (persona jurídica) | E31 / B01 | tasa del producto |
| Gubernamental | E45 / B15 | tasa del producto (la retención la hace el Estado al pagar; fuera de alcance) |
| Zona franca | E44 / B14 si exento; si no, E31 / B01 | 0 solo con Carnet de Acreditación de Regímenes Especiales vigente |
| Régimen especial (otras leyes/contratos) | igual que zona franca | igual que zona franca |
| Diplomático / organismo internacional | igual que zona franca | 0 solo con tarjeta de exención o autorización vigente |
| ONG / sin fines de lucro (Ley 122-05) | igual que zona franca | 0 solo con autorización de la DGII vigente |
| Exportación / cliente del exterior | E46 / B16 | 0 — **fuera de este proyecto** (ver decisiones) |

Fuentes: Guía Comprobantes Fiscales Especiales NG 05-19; Consulta 13-2022 (exención ITBIS a zona franca: el carnet debe estar vigente); instructivo de consulta de carnets de exención (diplomáticos y zonas francas); página DGII de exenciones ASFL; Guía 5 Comprobantes Fiscales; Aviso 32-22.

El sistema no puede validar el carnet contra la DGII (no hay servicio público); guarda número y vencimiento, y el cajero lo verifica con la app móvil de la DGII.

## Diseño

### Datos (una migración)

- `Customer`:
  - `taxpayerType String @default("consumidor_final")` con valores: `consumidor_final`, `persona_fisica`, `empresa`, `gubernamental`, `zona_franca`, `regimen_especial`, `diplomatico`, `ong`.
  - `exemptionNumber String?` — número del carnet, tarjeta o autorización.
  - `exemptionExpiresAt DateTime? @db.Date` — vencimiento.
  - Clientes existentes: el tipo nunca se guardó (el servidor descartaba `type`). La migración pone `empresa` a los que tienen RNC de 9 dígitos y `consumidor_final` al resto.
- `Invoice.pricesIncludeTax Boolean @default(false)`; la migración pone `true` a **todas** las facturas existentes. Nunca se cambian sus montos.
- `Invoice.exemptionNumber String?` — copia del carnet usado en esa venta (evidencia si el cliente cambia después).

### Regla de exención (una función compartida)

`isTaxExempt(customer, date)` en el servidor (y su espejo en la app): verdadero si `taxpayerType` es `zona_franca | regimen_especial | diplomatico | ong` **y** tiene `exemptionNumber` **y** `exemptionExpiresAt >= date`. En cualquier otro caso, falso.

### Cálculo (una función compartida, servidor y app)

Por línea, con precios sin ITBIS:
- `base = round2(qty * unitPrice * (1 - discountPercent/100))`
- `rate = cliente exento ? 0 : tasa del producto (0 si el producto es exento)`
- `itbis = round2(base * rate / 100)`
- Factura: `subtotal = Σ base`, `taxAmount = Σ itbis`, `total = subtotal + taxAmount`.

El descuento general sigue repartiéndose como porcentaje por línea (como hoy), así baja la base y el ITBIS. El XML del e-CF debe usar exactamente estos números (mismo redondeo por línea), para que `MontoTotal` coincida con `Invoice.total`.

### Servidor

- `POST /invoices`:
  - Sin `pricesExcludeTax: true` en el cuerpo (app 1.1.x, cola offline vieja): comportamiento actual intacto, `pricesIncludeTax = true`. Así una caja sin actualizar no cobra un 18 % de más.
  - Con `pricesExcludeTax: true`: aplica el cálculo nuevo; `checkLinePrice` sigue comparando `unitPrice` con los precios de lista (ahora sin ITBIS); la tasa la pone el servidor según producto y cliente. Si el cliente está exento guarda `exemptionNumber` en la factura.
- Facturación (`/bill`):
  - Acepta en papel también `B14` y `B15` (hoy solo B01/B02/NoFiscal), usando `takeNcf` y las secuencias que ya se configuran en `NcfModal`.
  - Factura con exención aplicada → el comprobante debe ser E44/B14. E44/B14 sin exención aplicada → 400.
  - E45/B15 solo para clientes `gubernamental`; E31/B01 exige RNC/cédula (como hoy).
- `ecfXmlBuilder`:
  - Factura nueva (`pricesIncludeTax = false`): `IndicadorMontoGravado = 0`, como ya está.
  - Factura vieja (`pricesIncludeTax = true`): las notas de crédito/débito que la referencian deben calcular sobre la base extraída (dividir entre 1 + tasa), no sumar ITBIS otra vez.
- `customers.js`: guarda `taxpayerType`, `exemptionNumber`, `exemptionExpiresAt` (y deja de descartar el tipo). Valida que las fechas sean válidas y que `exemptionNumber` solo exista en tipos que admiten exención.

### App — "en todas las ventanas"

Precio unitario sin ITBIS, columna/linea de ITBIS aparte, total con ITBIS:
- POS (`POSBillingOrdersView.jsx`), Pedidos (`OrdersViewSQL.jsx`): el carrito calcula con la función compartida; al elegir cliente se recalcula el ITBIS y se preselecciona el comprobante de la tabla; si el carnet está vencido, aviso visible ("Carnet vencido el …: se cobra ITBIS"). El cajero puede cambiar el comprobante, pero el servidor rechaza combinaciones inválidas.
- Detalle de factura, cuentas por cobrar, ticket térmico (`escposGenerator.js`), PDF (`pdfGenerator.js`), impresión e-CF: usan `item.subtotal` y los totales guardados; para facturas con `pricesIncludeTax = true` muestran el precio unitario como base (`unitPrice / (1 + tasa)`) para que se vean iguales que las nuevas.
- Reportes y dashboard: ingresos desde `item.subtotal` (base guardada), no `unitPrice * qty`, para que viejas y nuevas sumen igual.
- Productos (`ProductModal.jsx`, lista, importación): etiqueta "Precio sin ITBIS" y, al lado, "Con ITBIS: …" calculado. El texto actual "Precio final (ITBIS incluido)" se elimina. La plantilla de importación cambia el encabezado.
- Clientes (`CustomerModal.jsx`): selector con los 8 tipos; para los que admiten exención, campos "Número de carnet / autorización" y "Vence"; indicador "Exento vigente / vencido" en la lista de clientes.

### Decisiones de diseño tomadas sin consultar (revisables)

- **Camino de la app vieja (sin `pricesExcludeTax`)**: `checkLinePrice` compara contra los precios de lista tal como están (igual que hoy) y el servidor trata el precio como con ITBIS incluido. Mientras una caja no se actualice, vende al número viejo con ITBIS dentro; es lo que el cajero ve. Ese camino **ignora la exención** (la app vieja no la conoce): cobra ITBIS a todos, nunca lo quita.
- **Mayoreo y variantes**: `wholesalePrice`, `ProductVariant.salePrice` y `priceAdjustment` son también sin ITBIS; la tasa de una variante es la de su producto (como ya hace `checkLinePrice`). "Con ITBIS" en la lista de productos usa la tasa de cada producto.
- **Notas de crédito/débito**: usan las tasas guardadas en las líneas de la factura original, no el carnet actual del cliente. Si la venta fue exenta, la nota también lo es, aunque el carnet ya haya vencido.
- **`InvoiceItem.subtotal`** ya guarda la base sin ITBIS en las facturas viejas (`invoices.js` guarda `itemBase`), así que los reportes pueden sumar `subtotal` para viejas y nuevas por igual.
- **Exportación queda fuera**: el E46 exige datos de exportación (destino, transporte, etc.) que el sistema no tiene, y no es un "tipo de empresa" sino un tipo de venta. La lista de tipos de cliente queda en 8 (sin `exportacion`). Se puede agregar en un proyecto aparte.
- **E44 y E45**: el constructor del XML ya los soporta (`ECF_TYPE_CODES`); las líneas con tasa 0 salen con `IndicadorFacturacion` 4 (exento), que es lo que pide el E44. Quien construya debe verificar en el Formato e-CF v1.0 si el E44 exige algún campo extra del comprador y agregarlo si falta.
- **Migración de tipos**: RNC de 9 dígitos → `empresa`, el resto → `consumidor_final`. Si alguno queda mal, el dueño lo corrige en el formulario.
- **Hallazgo del e-CF**: es una verificación antes de desplegar, no código. Si existen e-CF emitidos, se le presenta al dueño antes de seguir.

## No objetivos

- No convertir precios existentes (decisión 2).
- No tocar facturas ya emitidas ni reemitir e-CF.
- No validar carnets contra la DGII.
- No calcular retenciones de ITBIS del Estado.
- No ISC (impuesto selectivo).

## Anti-objetivos (fracaso aunque "funcione")

- Que una caja con la app vieja cobre distinto a lo que muestra.
- Que el total del ticket, el PDF, la factura guardada y el XML del e-CF difieran en un céntimo.
- Que un cajero pueda facturar sin ITBIS a un cliente sin carnet vigente.
- Que una factura vieja cambie de monto al verla o reimprimirla.

## Despliegue

Después de que el lanzamiento de seguridad (PR #34) esté desplegado, en este orden:

1. Copia de seguridad de la base de datos.
2. Backend (`git pull` + `docker compose`).
3. Migración: `docker exec zenda-backend npx prisma migrate deploy`.
4. Actualización de la app (OTA).

Por qué este orden: la app vieja no manda `pricesExcludeTax` y el servidor nuevo la atiende por el camino de siempre (precio con ITBIS), así que backend primero no rompe nada. Al revés, una app nueva contra el servidor viejo mostraría 118 y cobraría 100 (el servidor viejo trata el precio como si ya trajera ITBIS). **Los precios suben un 18 % en cuanto la app nueva entra** — avisar al dueño antes.

Antes de la primera venta con la app nueva:

- La migración pone como `empresa` a todo cliente con RNC de 9 dígitos: reclasificar a mano los clientes gubernamentales (y los de zona franca, régimen especial, diplomáticos y ONG).
- Los clientes exentos necesitan su carnet de exención (número y vencimiento) registrado por un gerente o administrador; sin carnet vigente se les cobra ITBIS.

## Seguimiento

- Cerrar el camino viejo (venta sin `pricesExcludeTax`, precio con ITBIS) exigiendo una versión mínima de la app, cuando todas las cajas usen la app nueva. Hasta entonces un cliente modificado puede mandar precios sin la bandera y cobrar 15.25 % menos sin PIN.

## Hallazgo a confirmar

`ecfXmlBuilder.calcularTotalesPorTasa` ya trata `unitPrice` como precio sin ITBIS (suma 18 % encima), mientras las facturas actuales lo guardan con ITBIS. Si ya se emitieron e-CF en producción, sus XML declaran ITBIS y total ~18 % más altos que la factura. Verificar en el servidor (`EcfDocument`) antes del despliegue; si existen, el dueño decide qué hacer (posible nota de crédito). Este diseño lo corrige para facturas nuevas.

## Queda a criterio de quien construye

- Dónde vive la función compartida de cálculo y exención (p. ej. un módulo usado por backend y app, o dos copias con la misma prueba).
- Redacción exacta de textos y avisos, siguiendo los existentes.
- Índices o validaciones adicionales en la migración.
