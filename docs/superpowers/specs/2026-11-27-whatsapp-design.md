# Envío por WhatsApp — diseño corto

Proyecto 2 (fiscal y cobros), parte 4. Rama `fiscal-whatsapp`, sobre `main` 5e48fc8 (con recordatorios de cobro, PR #58). Aprobado por el dueño el 2026-11-27.

## Intención

En RD los clientes leen WhatsApp, no el correo. El objetivo es mandar los recordatorios de cobro y los documentos por WhatsApp, desde el WhatsApp del propio negocio y con un clic.

## Enfoques considerados

1. **Enlace `wa.me` con el mensaje listo (elegido).** Es gratis, funciona el primer día y no hace falta registrarse con Meta. A cambio, alguien pulsa enviar en cada mensaje y no se adjunta el PDF.
2. **API oficial de WhatsApp Business (Meta).** Permite el envío automático y adjuntos, pero cada empresa tiene que verificarse con Meta, usar un número dedicado y aprobar plantillas, y paga por conversación. Queda para cuando un cliente la pida.
3. **open-wa (no oficial).** Lo descartó el dueño junto con la recomendación, por cuatro motivos:
   - el riesgo de que WhatsApp bloquee el número del negocio;
   - un navegador abierto por empresa en el servidor;
   - las sesiones de WhatsApp de todos los clientes guardadas en el servidor;
   - una licencia no estándar.

## Qué se construye

1. **Recordatorios.** En "Por recordar hoy", cada fila tiene un botón **WhatsApp** junto a "Enviar".
   - El botón abre `https://wa.me/<número>?text=<mensaje>`. El mensaje es el texto de `renderReminder` (los mismos marcadores que el correo).
   - Al pulsarlo, el servidor registra el recordatorio con `channel: 'whatsapp'` y `status: 'sent'`, con la misma reserva y las mismas comprobaciones del correo, pero sin SMTP.
   - La regla de "un recordatorio por factura y día" cuenta **los dos canales juntos**.
   - No hay envío en lote: un chat por clic.
   - El historial muestra el canal ("Correo" / "WhatsApp").
2. **Documentos.** El botón **"Enviar por WhatsApp"** va junto a "Enviar por correo", en el detalle de la factura y en el de Cuentas por Cobrar.
   - El mensaje es corto: "Hola {cliente}, le enviamos su factura {factura} por {total}. Gracias por preferir {empresa}."
   - No lleva PDF ni se registra.
3. **Teléfono.** El número se arma desde `customer.phone`:
   - se quitan los caracteres que no son dígitos;
   - 10 dígitos que empiezan con 809, 829 u 849 → se antepone `1`;
   - 11 dígitos que empiezan con `1809`, `1829` o `1849` → se usan tal cual;
   - cualquier otro caso es inválido. El botón queda deshabilitado con el texto "Sin teléfono válido".
4. **App de escritorio (Electron).** Se agrega un IPC en `preload.js` / `electron.js` que abre una URL con `shell.openExternal`, **solo si empieza con `https://wa.me/`**; cualquier otra URL se rechaza. En la versión web se usa `window.open(url, '_blank', 'noopener')`.

## No metas

- El envío automático por WhatsApp.
- Adjuntar el PDF o crear enlaces públicos de descarga.
- Plantillas separadas para WhatsApp.
- Números de otros países.

## Decisiones del diseñador

- **El registro se hace al pulsar el botón:** Zenda no puede saber si el cajero envió el mensaje. El historial dice "WhatsApp" con la fecha del clic.
- **La regla diaria cuenta los dos canales**, para que el cliente no reciba un correo y un WhatsApp el mismo día por la misma factura.
- **El automático sigue siendo solo por correo.**

## Qué queda a quien construye

- Los nombres de las funciones y de la ruta (por ejemplo `POST /api/collection-reminders/whatsapp`).
- Si el número y el texto se arman en la app o en el servidor. Lo que importa: el servidor recalcula que el recordatorio siga tocando antes de registrarlo.
