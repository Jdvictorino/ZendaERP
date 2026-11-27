# Condiciones de pago (Proyecto 2, parte 2)

Proyecto 2 de la hoja de ruta (fiscal y cobros). Parte 1 (retenciones) quedó en el PR #56. Después de esta vienen los recordatorios de cobro, WhatsApp y el dígito verificador de la cédula.

## Intención

Que un negocio dominicano venda a crédito con los plazos que de verdad usa (días, fin de mes, cuotas y descuento por pronto pago), que cada factura diga cuándo vence y que Cuentas por Cobrar y los avisos sepan qué cuota está vencida. Esto es la base de la parte siguiente: los recordatorios de cobro leen estas cuotas.

## Decisiones del dueño

- **Alcance completo (opción 3):** plazos en días, plazos "fin de mes", cuotas y descuento por pronto pago.
- **Descuento por pronto pago = nota de crédito automática** (B04 o E34) por el descuento, con su ITBIS. Rebaja la venta y el ITBIS y se declara. Descartado: descuento solo contable (se pagaría ITBIS sobre dinero no cobrado).
- **Enfoque A:** las cuotas viven dentro de la factura (copia del plazo y su calendario), calculadas por una función compartida. Descartado: tabla aparte de cuotas (más migración y hay que mantenerla en sincronía con cada cobro, edición y anulación).

## Contexto verificado

- **Clientes:** el formulario pide "Tipo de cuenta" (contado/crédito) y "Días de crédito", pero `Customer` no tiene esas columnas y el servidor las descarta. Todos salen "Contado" en la lista. `creditLimit` sí se guarda.
- **Distribuidor (`POSBillingOrdersView.jsx`):** lista fija `Contado / Crédito 30d / Crédito 60d`; con crédito manda `paymentMethod: 'Crédito'` y `paymentTermDays`; el servidor guarda `Invoice.paymentTermDays` y `dueDate = ahora + días` (hora UTC del servidor).
- **Modo craft (`OrdersViewSQL.jsx` y `views/services/billOrderTx`):** no pone plazo; esas facturas no tienen `dueDate` y Cuentas por Cobrar adivina el vencimiento con otras fechas (`AccountsReceivableViewSQL.jsx:29`).
- **Factura PDF y ticket:** no muestran condición ni vencimiento.
- **e-CF (`ecfXmlBuilder.js:113`):** `TipoPago` sale de `paymentMethod === 'Crédito'`; no manda `FechaLimitePago`, que el formato e-CF exige cuando `TipoPago = 2` (formato dd-MM-AAAA, igual o posterior a la emisión).
- **Notas de crédito:** `POST /api/invoices/:id/credit-note` (solo admin/manager) crea la nota (B04 o E34, con devolución de existencias si trae artículos) y, si completa el total, anula la factura. **Una nota parcial no rebaja el saldo de la factura**: `invoiceBalance` no la cuenta, Cuentas por Cobrar tampoco. **El 607 no lista las notas de crédito** (solo facturas) y Contabilidad recibe la lista de notas vacía.

## Diseño

### Datos

- `company.settings.paymentTerms`: lista de plazos `{ id, name, installments: [{ percent, days, fromMonthEnd }], discount: { percent, days } | null, active }`. Como `withholdings`: sin tabla nueva; si la empresa nunca la guardó, se usan los valores iniciales.
- `Customer.paymentTermId String?` (null = contado). Reemplaza "Tipo de cuenta" y "Días de crédito" del formulario por un selector "Condición de pago". Un cliente es "de crédito" si su plazo no es contado. `creditLimit` sigue igual.
- `Invoice.paymentTerm Json?`: copia del plazo con el que se vendió y su calendario: `{ id, name, discount, schedule: [{ dueDate: 'YYYY-MM-DD', amount }] }`. Contado = null. Se siguen llenando `paymentTermDays` (días de la última cuota) y `dueDate` (última cuota) para las apps instaladas.
- `Invoice.creditedAmount Decimal(12,2) @default(0)`: suma de las notas de crédito parciales. La ruta de notas la mantiene; la migración la llena con las notas que ya existen en facturas no anuladas.
- Migración nueva, aditiva.

### Valores iniciales de plazos

| Plazo | Cuotas | Descuento |
|---|---|---|
| Contado | 100 % a 0 días | — |
| 15 días | 100 % a 15 días | — |
| 30 días | 100 % a 30 días | — |
| 45 días | 100 % a 45 días | — |
| 60 días | 100 % a 60 días | — |
| 30 días fin de mes | 100 % a 30 días desde el fin del mes de la venta | — |
| 50 % ahora y 50 % a 30 días | 50 % a 0 días, 50 % a 30 días | — |
| 30 días, 2 % a 10 días | 100 % a 30 días | 2 % si se paga todo en 10 días |

### Reglas (módulo puro, dos copias idénticas app/servidor como `withholdings.js`)

- `scheduleFor(term, total, saleDate) => [{ dueDate, amount }]`: cada cuota = `round2(total × percent / 100)`, la última absorbe el redondeo; fecha = fecha local de la venta + días, o fin del mes de la venta + días si `fromMonthEnd`.
- `installmentsOf(invoice, today) => [{ dueDate, amount, paid, remaining, overdue }]`: reparte lo saldado (`amountPaid + itbisRetenido + retencionRenta + creditedAmount`) de la cuota más vieja a la más nueva. Una factura sin `paymentTerm` se trata como una sola cuota con su `dueDate` (o la fecha de venta).
- `discountFor(invoice, today) => { amount, until } | null`: hay descuento si el plazo lo tiene, hoy ≤ fecha de venta + días del descuento, no se ha emitido ya una nota de pronto pago y no hay cobros previos (el descuento aplica solo pagando todo dentro del plazo). Monto = `round2(total × percent / 100)`.
- `validatePaymentTerms(list)`: nombres e ids únicos, porcentajes de cuotas que suman 100, días 0–365, descuento 0–100 % con días menores que la última cuota, exactamente un plazo de contado activo.
- `invoiceBalance` (de `withholdings.js`) pasa a restar también `creditedAmount`; `invoiceStatus` igual. Así la factura con nota parcial deja de mostrar un saldo de más.

### Ventas

- Distribuidor y modo craft: selector "Condición" con los plazos activos de la empresa; propone el del cliente; contado si no hay cliente. El servidor arma el calendario (no confía en el de la app) a partir de `paymentTermId` y guarda la copia.
- **Cuotas a 0 días (decisión del dueño):** se cobran en la misma venta. Si el plazo tiene cuotas a 0 días (ej. "50 % ahora y 50 % a 30 días"), la pantalla de venta (Distribuidor y modo craft) pide ese pago con su forma de pago (efectivo, tarjeta, transferencia) como en una venta de contado, por el monto de esas cuotas. La factura sale con ese `amountPaid`, el cobro entra en el turno de caja como cualquier pago de contado, y el resto queda en sus cuotas. El servidor rechaza una venta con cuotas a 0 días si no trae ese pago completo.
- Apps instaladas viejas: si llega `paymentTermDays` sin `paymentTermId`, el servidor arma una copia de una sola cuota a esos días.
- Factura PDF y ticket: "Condición: 30 días" y "Vence: dd/mm/aaaa"; con varias cuotas, la lista de cuotas (fecha y monto); con descuento, "2 % de descuento si paga todo antes del dd/mm/aaaa".
- e-CF: `TipoPago = 2` cuando el plazo no es contado y `FechaLimitePago` = última cuota (dd-MM-AAAA). Si el formato e-CF tiene un campo para el texto del plazo (`TerminoPago` u otro), se llena con el nombre; confirmar en el formato v1.0 antes de usarlo.

### Cobros

- Cuentas por Cobrar: el vencimiento que se ve y la antigüedad salen de la cuota vencida más vieja (o la próxima por vencer); el detalle muestra el calendario con lo pagado por cuota. Los avisos de facturas vencidas (`useOverdueInvoiceChecker`) usan las cuotas.
- **Pronto pago:** en el cobro de Cuentas por Cobrar, si `discountFor` da descuento, el modal lo propone marcado: "Descuento por pronto pago 2 %: RD$ X" y sugiere cobrar el resto. Al confirmar, el servidor hace en una sola operación la nota de crédito por el descuento (motivo "Descuento por pronto pago", ITBIS repartido como en las notas actuales, sin devolución de existencias) y el cobro. Lo puede hacer quien hoy registra cobros, no solo admin/manager, porque el descuento ya está fijado por el plazo. Si la DGII no recibe el E34 en el momento, queda como las notas actuales (reintento desde Facturación Electrónica).
- **Pronto pago: reglas *(decisión del constructor)*:**
  - El servidor solo emite la nota si el cobro, la nota y las retenciones dejan la factura saldada (saldo ≤ 0.01). Si no, responde 400 y no crea nada. Desmarcar el descuento = cobro normal.
  - Con varias cuotas, el descuento aplica solo si se salda toda la factura dentro de la ventana; la nota es sobre la factura entera.
  - El descuento se calcula sobre el total de la factura. Las retenciones ya registradas no se recalculan; si el descuento es mayor que el saldo, no se ofrece. (Confirmar con el contador el caso de cliente retenedor con pronto pago.)
  - La nota se marca con `CreditNote.kind = 'pronto_pago'` (columna nueva, `'normal'` por defecto). Solo una por factura.
  - Deshacer un cobro con descuento: el gerente baja el cobro como hoy; la nota queda (se corrige con una nota de débito, flujo actual). Anular la factura sigue como hoy.
- **Fecha de la venta *(decisión del constructor)*:** la fecha de emisión de la factura (fecha local del día en que se crea la factura; en modo craft, cuando se factura la orden). De ahí salen vencimientos, ventana de descuento y `FechaLimitePago`.
- Límite de crédito: el saldo pendiente resta también `creditedAmount`.

### 607 y contabilidad

- 607: las notas de crédito del período (B04/E34, por la fecha de la nota) salen como líneas propias con "NCF ó Documento Modificado" = NCF de la factura y sus montos con el ITBIS repartido igual que el e-CF de la nota. *(Hace falta para que el descuento se declare; hoy ninguna nota de crédito llega al 607.)* Confirmar contra el formato del 607 el signo y las columnas de las notas.
- **Reparto del ITBIS de una nota *(decisión del constructor)*:** hoy vive dentro del armado del e-CF de la nota (`ecfXmlBuilder.js`, `scaleToTotal`). Se extrae a una función compartida que usan el e-CF, el 607 y Contabilidad, para que los tres digan lo mismo.
- Contabilidad: las notas de crédito llegan a `generateAllJournalEntries` (hoy le llega una lista vacía).

### Configuración

Pestaña "Condiciones de pago": tabla editable (nombre, cuotas con % y días y "desde fin de mes", descuento % y días, activo), agregar plazo, "Restaurar valores iniciales" con confirmación, validación antes de guardar. Mismo permiso que el resto de Configuración. Guardar manda solo `paymentTerms` (el PUT parcial ya no borra datos de la empresa, PR #56).

## Objetivos

1. Toda venta a crédito queda con su condición y sus vencimientos, en cualquier modo.
2. Cuentas por Cobrar y los avisos saben qué cuota está vencida.
3. El descuento por pronto pago se aplica con su nota de crédito y se declara en el 607.

## No objetivos

- Intereses o recargos por mora.
- Cambiar el plazo de una factura ya emitida (reprogramar cuotas).
- Plazos de pago a suplidores (compras).
- Descuento por pago parcial a tiempo.
- Los recordatorios de cobro (parte siguiente).

## Anti-objetivos

- Que una factura existente cambie sus fechas de vencimiento.
- Que una factura de contado cambie de saldo, estado o 607.
- Que se emita una nota de pronto pago sin que el usuario la confirme.

## Restricciones

- Apps instaladas viejas: el servidor acepta ventas con `paymentTermDays` o sin plazo y clientes sin `paymentTermId`.
- Fechas locales de República Dominicana (UTC−4), no UTC.
- Migración aditiva con respaldo y ensayo en el servidor antes de desplegar.
- Compilar la app con Node 22.

## Efectos en datos existentes *(a avisar al dueño)*

- Facturas con notas de crédito parciales: su saldo en Cuentas por Cobrar baja por lo acreditado (corrige un saldo inflado).
- Los 607 que se generen de nuevo incluirán las notas de crédito del período.
- Clientes existentes quedan en contado hasta que se les asigne un plazo (sus "días de crédito" nunca se guardaron).

## Queda a criterio de quien construye

- Nombre e ids de los plazos y forma exacta de la ruta de pronto pago.
- Cómo llegan las notas de crédito al 607 y a Contabilidad (ruta nueva o incluidas en el listado de facturas).
- Diseño visual de la pestaña, del selector y del calendario de cuotas.
