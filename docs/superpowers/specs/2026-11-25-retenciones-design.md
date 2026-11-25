# Retenciones de ITBIS e ISR (Proyecto 2, parte 1)

Proyecto 2 de la hoja de ruta (fiscal y cobros). El dueño eligió empezar por lo más delicado: retenciones. Luego vendrán condiciones de pago, recordatorios de cobro, WhatsApp y, al final, el dígito verificador de la cédula.

## Intención

Que un negocio dominicano no calcule retenciones a mano ni deje el 606 y el 607 incompletos:

- **Cuando la empresa retiene (compras):** al pagarle a un profesional independiente, un técnico, un alquiler a persona física, un vendedor informal (B11), una empresa de servicios sujeta al 30 % o un proveedor del RST, el sistema propone el ITBIS y el ISR a retener y el tipo de retención del 606.
- **Cuando a la empresa le retienen (ventas):** al vender al Estado o a una empresa que retiene, el cobro llega incompleto. Hoy la factura queda con un saldo falso y el 607 sale con las retenciones en 0.

## Decisiones del dueño

- Los dos lados: compras y ventas.
- **Enfoque 1:** tabla de retenciones editable por empresa, con valores iniciales. Descartados: tasas fijas en el programa (cada cambio de ley exige una versión; la Ley 30-26 de 2026 ya cambió tasas) y tasas centrales en el panel de la plataforma (más trabajo y sin ajuste por empresa).
- Los valores iniciales salen marcados "verifica con tu contador" (el dueño no los hará confirmar antes de desplegar).
- Fuera: formulario IR-17 y pagos al exterior (ya se manejan con el B17).

## Contexto verificado

- Tasas: la DGII fija retener el 100 % del ITBIS a personas físicas, informales y RST, y el 30 % en ciertos servicios de empresas (Normas 02-05 y 07-07). Para ISR, la Ley 30-26 (2026) subió honorarios a personas físicas del 10 % al 15 % según guías de terceros; no hay tabla oficial nueva publicada y las fuentes no coinciden en fechas ni en servicios técnicos (2 % o 3 %). Por eso las tasas son datos, no código.
- Compras hoy: `Expense` ya tiene `itbisRetenido`, `retencionIsrTipo` (códigos 1-8 del 606, lista `TIPOS_RETENCION_ISR` en `ExpenseForm.jsx`) y `montoRetencionIsr`, escritos a mano; el 606 y el E41 ya los llevan.
- Ventas hoy: el 607 (`src/utils/dgiiReportGenerator.js`) lee `inv.itbisRetenido` y `inv.retencionRenta`, que no existen en `Invoice`, y deja "Fecha de Retención" vacía. El cobro se registra con `PUT /api/invoices/:id` (`amountPaid`; estado `Pagado` si `amountPaid ≥ total`). El saldo se calcula como `total − amountPaid` en varios lugares (límite de crédito en `invoices.js`, Cuentas por Cobrar, cuadre de caja, contabilidad, avisos de vencidas).

## Diseño

### Datos

- `company.settings.withholdings`: lista de conceptos `{ id, name, supplierTypes: ['persona_fisica'|'empresa'|'informal'|'exterior'|'any'], itbisPercent, isrPercent, isrType (código 1-8 del 606 o null), active }`. Sin tabla nueva: es configuración de la empresa, como `pricing`. Si la empresa nunca la guardó, se usan los valores iniciales.
- `Invoice`: `itbisRetenido Decimal(12,2) @default(0)`, `retencionRenta Decimal(12,2) @default(0)`, `retentionDate DateTime? @db.Date`. Migración nueva, aditiva.

### Valores iniciales (todos "verifica con tu contador")

| Concepto | Proveedor | ITBIS ret. | ISR | Tipo 606 |
|---|---|---|---|---|
| Honorarios profesionales | persona_fisica | 100 % | 15 % | 2 |
| Servicios técnicos (limpieza, fumigación…) | persona_fisica | 100 % | 2 % | 3 |
| Alquiler de local | persona_fisica | 100 % | 15 % | 1 |
| Compra a informal (B11) | informal | 100 % | 0 % | — |
| Servicios de empresas sujetos al 30 % | empresa | 30 % | 0 % | — |
| Proveedor del RST | any | 100 % | 0 % | — |

### Regla de cálculo (módulo puro, dos copias idénticas app/servidor como `tax.js`)

`withholdingFor(concept, { itbisFacturado, montoBienes, montoServicios }) => { itbisRetenido, montoRetencionIsr, retencionIsrTipo }`:
- `itbisRetenido = round2(itbisFacturado × itbisPercent / 100)`.
- `montoRetencionIsr = round2((montoBienes + montoServicios) × isrPercent / 100)` (base sin ITBIS).
- `retencionIsrTipo = isrType` si `isrPercent > 0`, si no null.

### Compras (Gastos)

- En la sección Retenciones del formulario de gastos: selector "Concepto de retención" con "Sin retención" y los conceptos activos que aplican al tipo del suplidor elegido (`any` siempre). Al elegirlo llena ITBIS retenido, ISR retenido y tipo; los montos siguen editables a mano. Recalcula si cambian los montos y el concepto sigue elegido (salvo que el usuario haya editado a mano una retención: entonces no la pisa).
- Suplidor informal: preselecciona el concepto de informal si existe y está activo.
- El servidor no cambia: sigue guardando lo que llega (el usuario manda).

### Ventas (cobros)

- `PUT /api/invoices/:id` acepta `itbisRetenido`, `retencionRenta` y `retentionDate` (validados: ≥ 0; `itbisRetenido` ≤ ITBIS de la factura; `retencionRenta` ≤ base sin ITBIS; una factura emitida solo la cambia quien hoy puede registrar cobros). El estado pasa a `Pagado` cuando `amountPaid + itbisRetenido + retencionRenta ≥ total − 0.01`; `Pagado Parcialmente` si la suma > 0.
- Saldo pendiente = `total − amountPaid − itbisRetenido − retencionRenta` en todos los lugares que hoy usan `total − amountPaid` para saldo o límite de crédito (función compartida `invoiceBalance`).
- Cuentas por Cobrar: el modal de cobro agrega "ITBIS retenido por el cliente", "ISR retenido por el cliente" y "Fecha de retención" (hoy por defecto).
- 607: usa los campos nuevos y llena "Fecha de Retención" con `retentionDate`.
- El cuadre de caja no cuenta las retenciones como dinero recibido. (Hoy el turno suma `payments` por forma de pago; las retenciones no entran en `payments`, así que esto se cumple sin tocar `shifts.js`.)
- **Varios cobros y correcciones *(decisión del constructor)*:** las retenciones son totales de la factura, como `amountPaid`: el `PUT` manda el total acumulado, el modal muestra las retenciones ya registradas para editarlas, `retentionDate` es la del último cambio. Reducir una retención ya guardada sigue la misma regla que reducir `amountPaid` (solo gerente o administrador). Tope: `amountPaid + itbisRetenido + retencionRenta ≤ total + 0.01`.
- **Contabilidad *(decisión del constructor)*:** `invoiceToJournalEntries` (`src/utils/chartOfAccounts.js`) debita las retenciones sufridas a cuentas nuevas de activo "ITBIS retenido por terceros" y "ISR retenido por terceros (anticipo)" en lugar de Cuentas por Cobrar, para que el mayor cuadre con la factura saldada.

### Compras: lo que se le paga al suplidor *(decisión del constructor)*

Lo retenido se le debe a la DGII, no al suplidor. El saldo de Cuentas por Pagar de un gasto pasa a ser su total menos `itbisRetenido` y `montoRetencionIsr` (`src/views/AccountsPayableViewSQL.jsx`), y `expenseToJournalEntries` acredita lo retenido a una cuenta de pasivo nueva "Retenciones por pagar" en lugar de Cuentas por Pagar o Efectivo. Gastos que no tienen retenciones no cambian.

### Configuración

Pestaña "Retenciones": tabla editable (nombre, tipo de proveedor, % ITBIS, % ISR, tipo del 606 de la lista existente, activo), agregar fila, botón "Restaurar valores iniciales" (con confirmación), aviso fijo "Las tasas cambian con la ley: verifícalas con tu contador". Validación: porcentajes de 0 a 100; tipo del 606 obligatorio si % ISR > 0. Solo admin/manager (igual que el resto de Configuración).

## Objetivos

1. Ningún cálculo de retención a mano en los casos de la tabla.
2. Facturas con retención quedan saldadas y el 607 sale con sus columnas llenas.

## No objetivos

- IR-17 (declaración mensual de retenciones) y pagos al exterior.
- Certificado de retención impreso.
- Retenciones en las facturas de compra creadas desde Compras (son mercancía; si hiciera falta, se ajusta en Gastos donde se permite).

## Anti-objetivos

- Que cambie un gasto o factura ya guardados al editar la tabla.
- Que una factura sin retenciones cambie de saldo, estado o 607.
- Que el cuadre de caja cuente una retención como efectivo recibido.

## Restricciones

- Apps instaladas viejas: el servidor acepta pagos sin los campos nuevos (cuentan como 0) y las respuestas pueden traer campos nuevos.
- Migración aditiva con respaldo y ensayo en el servidor antes de desplegar.
- Compilar la app con Node 22.

## Queda a criterio de quien construye

- Dónde vive la función `invoiceBalance` y el nombre de los ids de concepto.
- Diseño visual de la pestaña y del selector dentro del sistema de la casa.
