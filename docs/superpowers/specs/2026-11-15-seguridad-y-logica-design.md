# Auditoría de seguridad y lógica — diseño

Fecha: 2026-11-15 · Proyecto 1 de 3 (después: rendimiento y estabilidad; funciones que faltan).

## Objetivo

Cerrar las vulnerabilidades y errores de lógica encontrados en la auditoría de solo lectura, sin cambiar cómo trabaja el cajero
más de lo necesario. Éxito = cada hallazgo de abajo queda corregido, probado y desplegado en un solo PR.

Restricciones: un solo cliente en producción (Batey Creativo); servidor Odroid de 4 GB; el dueño fusiona y pide los despliegues;
las migraciones se aplican a mano (`docker exec zenda-backend npx prisma migrate deploy`) después de un respaldo.

Decisiones del dueño: precio de lista + PIN; tope de descuento sin PIN 5 % (ajuste de la empresa); líneas sin producto piden PIN;
venta a crédito sobre el límite se **bloquea**; QR de entrega con llave aleatoria; entrega en un solo PR.

## Hallazgos y corrección

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | El refresh token (largo) sirve como access token en toda la API y sobrevive al cierre de sesión | `authenticate` rechaza todo token con `type` (refresh, approval) |
| 2 | PIN validado solo en la app; hashes sha256 sin sal llegan al cliente (incl. `settings.adminProfile.pinHash`, legible por cualquier usuario) | PIN verificado en el servidor con bcrypt; ningún hash sale del servidor; aprobaciones de un solo uso |
| 3 | Precio, ITBIS y descuento de cada línea los decide la app | El servidor valida contra los precios del producto; ITBIS del producto; excepciones con PIN |
| 4 | Se aceptan IDs de otra empresa (cliente, categoría, proveedor, repartidor) | Validación de pertenencia antes de guardar |
| 5 | Confirmar entrega sin login con solo el ID de la factura | Llave aleatoria por envío en el QR, o sesión de la misma empresa |
| 6 | Cualquier empleado envía correos con HTML libre a cualquier dirección | Solo a contactos de la empresa; máx. 50 por hora por empresa |
| 7 | Escritorio: rutas de archivo con `../` salen de la carpeta de la app (`open-image-path` llega a `shell.openPath`) | Rutas resueltas y limitadas a `userData`; abrir solo imágenes |
| 8 | Escáner: sesiones sin formato ni límite | Código UUID obligatorio, una caja por sesión, tope global de conexiones, límite de lecturas |
| 9 | Sin `JWT_SECRET` el servidor usa una clave conocida (producción sí la tiene) | El servidor no arranca sin una clave propia |
| 10 | Contraseña mínima de 6 caracteres | Mínimo 8 en contraseñas nuevas (las actuales siguen sirviendo) |
| 11 | El límite de crédito del cliente no se verifica | Venta a crédito que pasa el límite se rechaza |
| 12 | La cola sin conexión (o un doble clic) puede repetir un cobro que ya entró | Cada cobro lleva `id`; el servidor ignora repetidos |
| 13 | Por revisar: reportes 606/607 e inventario con variantes | Se revisan durante la implementación; lo que se corrija va listado aparte en el PR |

## Diseño

### Sesiones (1, 9, 10)
- `authenticate`: si `decoded.type` existe → 401 "Token inválido". Los access tokens no llevan `type`.
- Arranque: si `JWT_SECRET` falta o es `default-secret-change-in-production`, el proceso termina con un mensaje claro
  (en `index.js` y sin valor por defecto en `authService` ni en `middleware/auth.js`).
- Contraseña mínima 8 en: registro, cambio de contraseña, restablecimiento, crear usuario y cambiar contraseña de un usuario.

### PIN y aprobaciones (2)
- Guardado: `POST/PUT /api/users` aceptan `pin` (4–8 dígitos) y el servidor guarda `bcrypt(pin)` en `pinHash`.
  Ya no se acepta `pinHash` del cliente. `pinHash` se quita de toda respuesta (`sanitizeUser`, selects de usuarios, `/auth/me`)
  y de `GET /api/settings` (`adminProfile.pinHash`); `PUT /api/settings` ya no lo guarda.
- PIN viejos: si el `pinHash` guardado es sha256 (64 hex), se compara `sha256(pin)`; si coincide se reemplaza por bcrypt.
- `POST /api/auth/approve { pin, action }` (autenticado). Acciones y quién aprueba:
  - `shift_open`, `shift_close_tolerance`: admin, manager, supervisor.
  - `price_override`: admin, manager.
  Busca usuarios activos de la empresa con esos roles y PIN; si uno coincide devuelve
  `{ approvalToken, approver: { id, name } }`. El token es un JWT `{ type: 'approval', action, companyId, approverId, jti }`
  que vence en 2 minutos y se acepta **una sola vez** (los `jti` usados se guardan en memoria hasta su vencimiento;
  `shortcut: memoria de un solo proceso, pasar a la base si hay más de una instancia`).
  Límite: 5 intentos fallidos cada 15 minutos por usuario (`express-rate-limit` con `skipSuccessfulRequests`).
- Consumo: las rutas protegidas leen la cabecera `X-Approval-Token`, verifican acción, empresa, vencimiento y uso único,
  y guardan quién aprobó (nota del turno / `InventoryLog` o campo de notas de la factura).
- Regla: si quien hace la acción ya tiene un rol aprobador de esa acción, no necesita token (el servidor no exige su propio PIN;
  la app puede seguir pidiéndolo como hoy).
- Dónde se exige:
  - `POST /api/shifts/open` → `shift_open`.
  - `POST /api/shifts/:id/close` cuando `cash.requireSupervisorBeyondTolerance` está activo, `cash.tolerance > 0`
    y |diferencia| > tolerancia → `shift_close_tolerance`.
  - Precios (abajo) → `price_override`.
- Si falta el token el servidor responde 403 `{ error, code: 'APPROVAL_REQUIRED', action }`; la app abre la ventana de PIN
  (las actuales `AdminPinAuthModal` y `SupervisorAuthModal`, que ahora llaman a `/auth/approve`) y reintenta con el token.

### Precios, descuentos y crédito (3, 11)
- Función pura `checkLinePrice(item, product, variant, maxDiscount)` → `{ ok, taxRate, reason }`:
  - Con producto: el precio debe coincidir (±0.01) con `salePrice`, `wholesalePrice` o el precio de la variante; si no → override.
  - Sin producto: siempre override; `taxRate` debe ser 0, 16 o 18.
  - ITBIS: siempre el del producto (`isTaxable ? taxRate : 0`).
  - Descuento: el `discountPercent` de la línea (que ya combina descuento de línea y general) > tope → override.
- Tope: `company.settings.pricing.maxDiscountPercent`, por defecto 5; editable por admin en Configuración.
- `POST /api/invoices`: si alguna línea necesita override y el usuario no es admin/manager → exige `price_override`.
- `PUT /api/invoices/:id` con `discountAmount` (cupón) mayor al tope sobre el total bruto → misma regla.
- Crédito: si `paymentMethod` es crédito y el cliente tiene `creditLimit > 0`, saldo pendiente
  (total − pagado de sus facturas no anuladas) + total nuevo > límite → 400 "La venta pasa el límite de crédito del cliente".

### Aislamiento entre empresas (4)
- `assertSameCompany(tx, companyId, { customerId, categoryId, supplierId, driverId })`: cada ID presente debe existir en la
  empresa; si no → 400 "Registro no encontrado". Se usa en facturas (crear), productos (crear, editar, importación),
  envíos (crear, editar, asignar).

### Superficie pública (5–8)
- Envíos: columna `deliveryToken` (UUID aleatorio, única) con migración que llena los existentes. El QR de la orden de entrega
  lleva `deliveryToken`. `POST /shipments/confirm-delivery` acepta `{ token }` sin sesión, o `{ invoiceId }` con sesión
  de la misma empresa. Los QR ya impresos dejan de servir.
- Correo: `POST /email/send` solo a direcciones que existan en clientes, proveedores o usuarios de la empresa
  (sin distinguir mayúsculas); máximo 50 por hora por empresa.
- Escritorio (`electron.js`): `safeUserPath(rel)` resuelve y exige que quede dentro de `userData`; `open-image-path`
  solo abre extensiones de imagen. Aplica a todos los manejadores que reciben rutas.
- Escáner: `sessionId` debe ser UUID; una conexión por sesión (la nueva reemplaza a la anterior); máximo 500 conexiones;
  `/scan` y `/connect` con límite de 120 por minuto por sesión.

### Cobros sin duplicar (12)
- La app pone `id` (UUID) en cada desglose de cobro (`PaymentModal`, cola sin conexión).
- `PUT /api/invoices/:id` ignora los desgloses cuyo `id` ya está guardado. `amountPaid` ya se envía como total, así que repetirlo
  no cambia nada.

## Pruebas
- Unitarias (vitest, funciones puras sin base de datos): `checkLinePrice`, aprobadores por acción, reconocimiento de PIN viejo
  y nuevo, `safeUserPath`, deduplicación de cobros, validación de `sessionId`.
- Build de la app y `node --check` del backend.
- Verificación manual después del despliegue en Batey: abrir turno con y sin PIN, venta con precio cambiado, descuento de 6 %,
  venta a crédito sobre el límite, confirmar entrega con el QR nuevo.

## Despliegue
- Un PR. Migración: `deliveryToken` en envíos. Respaldo antes de migrar.
- Backend y app deben salir juntos: la app vieja calcula el PIN en el equipo y no envía token, así que el servidor nuevo le
  rechazaría el cierre fuera de tolerancia y los cambios de precio hasta que actualice.
- Versión de la app: la siguiente después de la que salga con el PR #32.

## Fuera de alcance
Rendimiento, nuevas funciones, cambios de diseño de pantallas, 2FA, cifrado de la base (proyectos 2 y 3).
