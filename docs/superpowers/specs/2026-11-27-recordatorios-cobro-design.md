# Recordatorios de cobro — diseño

Proyecto 2 (fiscal y cobros), parte 3. Rama `fiscal-recordatorios`, sobre `main` 3c763ea (con condiciones de pago, PR #57).

## Intención

Que el negocio cobre a tiempo sin acordarse de cada factura: avisarle al **cliente** antes y después de que venza cada cuota de su factura a crédito. Hoy solo existe un aviso interno de vencidas (admin/gerente, dentro de la app, revisado por cada PC mientras está abierta); al cliente no le llega nada.

Es la base de la parte siguiente (WhatsApp): lo que se construya aquí debe dejar el canal como un dato, para que WhatsApp solo agregue un canal nuevo.

## Decisiones del dueño

- **Manual guiado primero** (2026-11-27): Cuentas por Cobrar muestra "Por recordar hoy" y una persona pulsa "Enviar recordatorio" (uno o varios). Así no se le escribe por error a un cliente que ya pagó y aún no está registrado.
- **Automático como interruptor en Configuración, apagado por defecto**: si la empresa lo enciende, el servidor envía solo con las mismas reglas.

## Metas

- Calcular, por cuota pendiente, qué recordatorio toca hoy según reglas de la empresa.
- Lista "Por recordar hoy" en Cuentas por Cobrar con envío individual y en lote.
- Envío por correo con el SMTP propio de la empresa.
- Registro de cada recordatorio enviado o fallido, para no repetir y para ver el historial de cada factura.
- Envío automático opcional, apagado por defecto.

## No metas

- WhatsApp (parte siguiente), SMS.
- Enlaces de pago, portal del cliente, estados de cuenta.
- Mora o intereses por atraso.
- Adjuntar el PDF de la factura (puede venir después; el correo trae los datos de la factura y la cuota).

## Anti-metas (sería un fracaso aunque funcione)

- Mandarle varios correos el mismo día al mismo cliente por la misma cuota (por ejemplo, al ponerse al día con etapas atrasadas, o con dos personas pulsando a la vez).
- Recordarle una cuota ya cobrada, una factura anulada o saldada.
- Que el automático se encienda solo o envíe sin SMTP configurado y falle en silencio.

## Lo que ya existe y se reusa

- Calendario de cuotas: `Invoice.paymentTerm.schedule` y `installmentsOf(invoice)` en `paymentTerms.js` (copias app/servidor idénticas desde la línea 2), que aplica lo cobrado, retenciones y notas sobre las cuotas en orden de fecha. Facturas viejas sin calendario: `legacySnapshot` (una cuota en `dueDate`).
- Saldo: `invoiceBalance` / `invoiceStatus` en `withholdings.js`.
- Fecha de hoy en RD: `todayRD()`; aritmética de calendario `addDays` / `diffDays` (exportadas en `paymentTerms.js`).
- Correo: `sendCompanyMail(company, { to, subject, html, text })` en `backend/src/services/emailService.js`. **Exige el SMTP propio de la empresa** (`company.settings.smtp` con host, user y pass); si no está, lanza "La empresa no tiene configurada una cuenta de correo SMTP válida."
- Tarea programada: `backend/src/index.js` ya corre `runBillingEnforcement` con `setInterval`; el automático usa el mismo patrón.
- Ajustes por empresa en `company.settings` con PUT parcial seguro (`companyUpdateData`), como `withholdings` y `paymentTerms`; pestaña de Configuración con el patrón de `WithholdingsTab.jsx`.

## Datos

### Reglas: `company.settings.collectionReminders`

```
{
  auto: false,                 // envío automático
  autoHour: 9,                 // hora RD desde la que corre el automático (0-23)
  stages: [-3, 0, 7, 15],      // días respecto al vencimiento de la cuota (negativo = antes)
  subject: "Recordatorio de pago: factura {factura}",
  body: "Hola {cliente}:\n\n..."   // texto plano con marcadores
}
```

Valores iniciales: `auto: false`, `autoHour: 9`, `stages: [-3, 0, 7, 15]`, y un texto en español. Si la empresa nunca lo guardó, se usan los iniciales (como `withholdings`). Validación: etapas enteras entre -60 y 365, sin repetidas, al menos una; asunto y cuerpo no vacíos; `autoHour` 0-23.

Marcadores: `{cliente}`, `{empresa}`, `{factura}` (NCF o número), `{monto}` (lo pendiente de la cuota, con la moneda de la empresa, como el resto de la app), `{vence}` (dd/mm/aaaa), `{dias}` (días que faltan o de atraso, en texto: "en 3 días", "hoy", "hace 7 días"), `{saldo}` (saldo total de la factura), `{telefono}` y `{correo}` de la empresa.

### Cliente: `Customer.remindersOff Boolean @default(false)`

Casilla "No enviarle recordatorios de cobro" en la ficha del cliente. Un cliente así no aparece en "Por recordar hoy" ni recibe automáticos.

### Registro: tabla `collection_reminders`

```
CollectionReminder {
  id, companyId, invoiceId, customerId,
  dueDate   DateTime   // vencimiento de la cuota (T12:00Z)
  stage     Int        // etapa (días respecto al vencimiento)
  channel   String     // 'email' (WhatsApp agregará 'whatsapp')
  status    String     // 'sending' | 'sent' | 'failed'
  error     String?
  to        String     // dirección usada
  sentById  String?    // usuario; null = automático
  createdAt DateTime
  @@unique([invoiceId, dueDate, stage, channel])
}
```

La clave única impide el doble envío de la misma etapa (dos personas a la vez, o el automático y una persona).

**Reserva y reintentos (decisión del diseñador):**
- Antes de enviar, el servidor reserva la fila con `status: 'sending'`: la crea (si choca con la clave única, otro ya la tiene y se omite) o, si existía `failed`, la pasa a `sending` con un update condicionado (`where status = 'failed'`). Tras enviar queda `sent` o `failed` con el error.
- Una fila `sending` de más de 10 minutos se considera caída y se puede volver a reservar como si fuera `failed`.
- **El automático nunca reintenta un `failed`.** El fallido queda visible en "Por recordar hoy" con su error y un botón "Reintentar" manual. Así un SMTP caído o un correo rebotado no se repite cada hora.
- **Máximo un recordatorio enviado por factura y por día (hora RD)**, sin importar la cuota: el servidor lo comprueba antes de reservar. Si la cuota más vieja se salda y aparece otra atrasada el mismo día, su recordatorio sale al día siguiente.

## Reglas de cálculo (función pura, copia app/servidor)

`remindersDue(invoices, { today, rules, sent })` devuelve una fila por cuota que toca recordar hoy:

1. Solo las facturas que Cuentas por Cobrar ya considera por cobrar (mismo filtro: saldo > 0, fuera de `VOID_STATUSES`), con cliente y cliente sin `remindersOff`. Fechas siempre con `todayRD()`.
2. Por cada cuota pendiente (`installmentsOf`, lo que queda > 0.01), la **etapa vigente** es la mayor etapa `s` con `vence + s ≤ hoy`. Si no hay ninguna, no toca nada todavía.
3. Si la etapa vigente ya está en `sent` (enviada con éxito) para esa cuota y canal, no toca. **Solo se envía la etapa vigente**: las etapas anteriores que se saltaron no se mandan (al ponerse al día no salen varias de golpe).
4. Una factura con varias cuotas atrasadas genera **un solo** recordatorio, el de la cuota más vieja pendiente; el mensaje muestra el saldo vencido total. (No se le manda un correo por cuota el mismo día.)
5. Cliente sin correo, o con un correo con formato inválido: la fila aparece marcada "Sin correo" / "Correo no válido" y no se puede enviar.
6. Un cobro parcial después de un recordatorio no lo repite: la etapa ya enviada queda enviada; la etapa siguiente muestra el monto pendiente nuevo.

## Pantallas

### Cuentas por Cobrar → "Por recordar hoy"

Pestaña o filtro nuevo. Por fila: cliente, factura, cuota (monto y vencimiento), etapa ("3 días antes", "vence hoy", "7 días de atraso"), último recordatorio enviado, correo. Casilla por fila, "Seleccionar todo", botón **"Enviar recordatorio"** (por fila y para los seleccionados). Si la empresa no tiene SMTP: aviso "Configura el correo de la empresa en Configuración para enviar recordatorios" y botones deshabilitados.

```
Por recordar hoy (5)                               [Enviar seleccionados]
[x] Colmado Pérez   B0100000123  RD$ 5,000  vence 25/11  2 días de atraso   [Enviar]
[x] Ferretería Luz  E310000045   RD$ 1,200  vence 30/11  3 días antes       [Enviar]
[ ] Juan Gómez      B0200000088  RD$   800  vence 27/11  vence hoy   Sin correo
```

Tras enviar: toast con "Enviados N, fallaron M" y la fila desaparece (o muestra el error si falló).

### Detalle de la factura en Cuentas por Cobrar

Lista de recordatorios enviados (fecha, etapa, canal, quién o "automático", estado).

### Configuración → "Recordatorios de cobro"

Patrón de `WithholdingsTab`: etapas (agregar/quitar días), asunto y cuerpo con la lista de marcadores, vista previa con una factura de ejemplo, interruptor "Enviar automáticamente" con la hora, "Restaurar valores iniciales". Mismo permiso que el resto de Configuración. Con SMTP sin configurar, el interruptor automático no se puede encender.

### Ficha del cliente

Casilla "No enviarle recordatorios de cobro".

## Servidor

- `GET /api/collection-reminders/due` → filas de `remindersDue` para hoy (admin/gerente).
- `POST /api/collection-reminders/send` `{ items: [{ invoiceId, dueDate, stage }] }` → envía cada uno: recalcula en el servidor que siga tocando (no confía en la app), reserva la fila única, envía, guarda `sent`/`failed`. Máximo 100 por llamada. Responde el resultado por ítem.
- `GET /api/invoices/:id/reminders` → historial de la factura.
- Automático: cada hora, para empresas con `auto: true` y SMTP configurado, si la hora RD ≥ `autoHour`, envía lo que toque con la misma función. `sentById` null.

## Qué queda a quien construye

- Nombre exacto de las rutas y de los componentes.
- El texto inicial del cuerpo del correo (en español, corto, con monto, vencimiento, factura y contacto de la empresa).
- Si "Por recordar hoy" es pestaña o filtro dentro de Cuentas por Cobrar.
- Formato HTML del correo (puede ser el texto plano con saltos de línea).
