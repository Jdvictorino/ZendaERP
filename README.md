# Zenda ERP

**Zenda ERP** es una plataforma moderna de facturación electrónica y planificación de recursos empresariales (ERP) diseñada específicamente para empresas en la República Dominicana. Combina cumplimiento fiscal DGII completo, contabilidad de doble entrada, control de inventario y gestión multi-tenant bajo una arquitectura desacoplada y escalable.

Disponible como **Aplicación Web SPA** (React + Vite) y como **Aplicación de Escritorio nativa** (Electron), con backend REST en Node.js/Express y base de datos relacional PostgreSQL gestionada por Prisma ORM.

---

## 🚀 Características Principales

### 1. Facturación y Ventas

- **NCF Tradicionales:** Generación automática de `B01` (Crédito Fiscal), `B02` (Consumidor Final), `B03` (Nota de Débito), `B04` (Nota de Crédito).
- **Facturación Electrónica (e-CF):** Generación, firma XML y envío de Comprobantes Fiscales Electrónicos (`E31`–`E47`) a los ambientes de la DGII (pruebas, certificación, producción).
- **Ciclo de vida completo:** Pedido → Pago → Facturación NCF/e-CF → Anulación → Nota de Crédito/Débito.
- **Pagos flexibles:** Efectivo, tarjeta, transferencia, cheque, crédito, abonos parciales y saldos pendientes por cliente.
- **Correo automatizado:** Envío de facturas en PDF por email vía Resend/Nodemailer.

### 2. Inventario y Productos

- Actualización de stock en tiempo real en cada facturación o devolución.
- Variantes de producto (talla, color, etc.) con SKU, código de barras EAN-13 y ajuste de precios.
- Alertas de stock mínimo configurables por producto.
- Historial completo de movimientos: entradas, salidas, ventas y ajustes manuales.
- Importación masiva de productos.

### 3. Contabilidad de Doble Entrada

- Asiento contable automático por cada transacción (venta, gasto, cobro, nota de crédito/débito).
- Catálogo de cuentas adaptado a NIIF (Activos, Pasivos, Capital, Ingresos, Gastos, Costo de Ventas).
- Reportes en tiempo real: Diario General, Mayor General, Balanza de Comprobación, Balance Ajustado y Costo de Ventas.

### 4. Cumplimiento Tributario DGII

- **Formato 606:** Compras de bienes y servicios (exportación en `.txt` pipe-delimitado).
- **Formato 607:** Ventas realizadas del período.
- **Formato 608:** Comprobantes anulados.
- Calculo automático de ITBIS (18%) sobre precios inclusivos.

### 5. Control de Caja y Turnos (Cash Shifts)

- Apertura y cierre de turno con montos iniciales y finales.
- Registro de retiros y depósitos intermedios durante el turno.
- Cálculo automático de diferencias y auditoría de descuadres.

### 6. Logística y Envíos

- Módulo de seguimiento de entregas con asignación de transportista.
- Generación de códigos QR de rastreo por envío.
- Confirmación de entrega desde vista móvil del conductor.

### 7. POS e Impresión Térmica

- Flujo de facturación POS optimizado para cajero.
- Soporte de impresoras térmicas ESC/POS vía USB con servicio de monitoreo en segundo plano.
- Escáner de código de barras integrado (web y Electron).

### 8. Administración Multi-Tenant (SaaS)

- Aislamiento completo por empresa (`companyId` en cada modelo).
- Estados de suscripción: `active`, `trial`, `past_due`, `suspended`, `blocked`, `cancelled`.
- Modos de bloqueo: `auto` (gradual), `write` (solo lectura), `hard` (bloqueo total).
- Panel de control administrativo de plataforma con métricas de facturación por tenant.
- Integración con PayPal para suscripciones mensuales y anuales.

### 9. Observabilidad y Monitoreo

- Middleware de trazas HTTP automático (latencia, método, código de respuesta, tenant).
- Métricas en tiempo real: RPM, latencia P50/P95/P99, errores, queries lentas (>1000 ms).
- Panel de administración de observabilidad por empresa y global.
- Health check liviano (`/api/monitoring/health`) y readiness check con ping a BD (`/api/monitoring/ready`).

---

## 🛠️ Arquitectura y Tecnologías

```
┌────────────────────────────────────────────────────────┐
│                   CAPA DE PRESENTACIÓN                 │
│      [ React 19 ]  [ Vite 7 ]  [ TailwindCSS 3 ]      │
│    (Navegador Web ó Shell nativo con Electron 39)      │
└──────────────────────────┬─────────────────────────────┘
                           │  HTTP REST / JSON
                           ▼
┌────────────────────────────────────────────────────────┐
│                   CAPA DE SERVICIOS / API              │
│    [ Node.js ]  [ Express.js ESM ]  [ JWT / Zod ]     │
└──────────────────────────┬─────────────────────────────┘
                           │  Prisma ORM Queries
                           ▼
┌────────────────────────────────────────────────────────┐
│                   CAPA DE PERSISTENCIA                 │
│       [ PostgreSQL 16 ]     [ Prisma Client 5 ]        │
└────────────────────────────────────────────────────────┘
```

### Stack Completo

| Capa               | Tecnología                              | Versión                 |
| ------------------ | --------------------------------------- | ----------------------- |
| Frontend           | React + Vite                            | React 19, Vite 7        |
| Estilos            | TailwindCSS 3 + CSS Custom              | `darkMode: 'class'`     |
| Backend            | Express.js (ESM)                        | v4.18                   |
| Base de Datos      | PostgreSQL + Prisma ORM                 | Prisma 5.22             |
| Autenticación      | JWT (access + refresh tokens)           | jsonwebtoken 9          |
| Desktop            | Electron                                | v39                     |
| Iconos             | Lucide React                            | v0.471                  |
| Validación         | Zod                                     | Frontend v4, Backend v3 |
| Gráficas           | Recharts + MUI X Charts                 | —                       |
| Notificaciones     | react-hot-toast                         | v2.6                    |
| PDF                | jsPDF + jspdf-autotable (CDN lazy-load) | —                       |
| Email              | Resend / Nodemailer                     | —                       |
| Gestor de Paquetes | pnpm (workspace)                        | v10.30                  |
| Tests              | Vitest + Testing Library                | Vitest 4                |

---

## 📂 Estructura del Proyecto

```
ZendaERP/
├── src/                              # Frontend (React + Vite)
│   ├── api/client.js                 # Cliente HTTP centralizado con auth y auto-refresh
│   ├── App.jsx                       # Raíz: auth, routing por estado, layout
│   ├── components/
│   │   ├── ui/                       # Primitivos reutilizables (Modal, Button, Card, Badge, Input…)
│   │   ├── modals/                   # 33+ modales de dominio
│   │   ├── common/                   # AddressFields, AnimatedModal, ProfilePicture
│   │   ├── charts/                   # Componentes de gráficas
│   │   ├── accounting/               # Sub-componentes de contabilidad
│   │   ├── ecf/                      # Componentes de factura electrónica
│   │   └── registration/             # Flujo multi-paso de registro de empresa
│   ├── context/                      # ScannerContext (React Context API)
│   ├── hooks/                        # useApi, useFormValidation, useNotification…
│   ├── utils/                        # 28 módulos utilitarios
│   └── views/                        # 23 vistas principales (*ViewSQL.jsx)
│       ├── DashboardViewSQL.jsx
│       ├── OrdersViewSQL.jsx          # Pedidos / POS
│       ├── POSBillingOrdersView.jsx   # Flujo de facturación POS
│       ├── InvoicesViewSQL.jsx
│       ├── ProductsViewSQL.jsx
│       ├── CustomersViewSQL.jsx
│       ├── SuppliersViewSQL.jsx
│       ├── ExpensesViewSQL.jsx
│       ├── AccountingViewSQL.jsx
│       ├── AccountsReceivableViewSQL.jsx
│       ├── AccountsPayableViewSQL.jsx
│       ├── FiscalManagementViewSQL.jsx # Reportes 606/607/608 + e-CF
│       ├── ReportsViewSQL.jsx
│       ├── ShipmentsViewSQL.jsx
│       ├── ShiftsViewSQL.jsx
│       ├── OffersViewSQL.jsx
│       ├── SettingsViewSQL.jsx
│       ├── UsersViewSQL.jsx
│       ├── PlatformBillingControlView.jsx # Admin SaaS
│       ├── MobileScannerView.jsx
│       └── DeliveryConfirmViewSQL.jsx
│
├── backend/
│   ├── .env                          # Variables de entorno del backend y DB
│   ├── .env.example                  # Plantilla de variables de entorno del backend
│   ├── prisma/
│   │   ├── schema.prisma             # 20 modelos, PostgreSQL
│   │   └── migrations/               # Migraciones versionadas
│   └── src/
│       ├── index.js                  # Entry point Express, middlewares, rutas
│       ├── db.js                     # Singleton Prisma Client
│       ├── middleware/
│       │   ├── auth.js               # JWT auth + billing enforcement
│       │   └── observability.js      # Captura automática de trazas HTTP
│       ├── routes/                   # 20 archivos de rutas
│       │   ├── auth.js               ├── products.js    ├── customers.js
│       │   ├── suppliers.js          ├── invoices.js    ├── expenses.js
│       │   ├── categories.js         ├── users.js       ├── backup.js
│       │   ├── shifts.js             ├── shipments.js   ├── offers.js
│       │   ├── settings.js           ├── alerts.js      ├── scanner.js
│       │   ├── billing.js            ├── adminBilling.js
│       │   ├── monitoring.js         ├── ecf.js         ├── email.js
│       │   └── adminObservability.js
│       └── services/
│           ├── billingEnforcementService.js  # Scheduler multi-tenant
│           ├── observabilityService.js        # Motor de métricas en memoria
│           ├── ecfService.js                  # Integración DGII e-CF
│           └── accountingService.js           # Asientos contables
│
├── docs/
│   └── GUIA_DESPLIEGUE.md            # Guía paso a paso de despliegue en VPS
├── scripts/
│   ├── captureScreenshots.mjs        # Script auxiliar de capturas
│   └── monitor-escpos.js             # Monitor de impresora térmica ESC/POS
├── test/                             # Pruebas unitarias con Vitest
├── .env.local                        # Variables de entorno del frontend (Vite)
├── electron.js                       # Proceso principal Electron
├── preload.js                        # Puente IPC seguro Electron ↔ React
├── menu.js                           # Menú nativo de la aplicación de escritorio
├── Dockerfile                        # Imagen node:22-alpine para el backend
├── compose.yaml                      # Docker Compose: API + PostgreSQL
├── compose.debug.yaml                # Docker Compose para depuración
├── vite.config.js                    # Dev server port 5177, proxy /api → 3001
├── tailwind.config.js                # Sistema de colores brand (indigo)
└── vitest.config.js                  # Configuración de pruebas unitarias
```

---

## 🗄️ Base de Datos — Modelos Prisma (20 Modelos)

### Autenticación y Usuarios

| Modelo             | Tabla                   | Campos Clave                                                         |
| ------------------ | ----------------------- | -------------------------------------------------------------------- |
| Company            | `companies`             | name, rnc, billingStatus, ecfEnabled, ncfB01Prefix, settings (JSONB) |
| User               | `users`                 | email, passwordHash, role, companyId, isAdmin, pinHash               |
| RefreshToken       | `refresh_tokens`        | tokenHash, expiresAt                                                 |
| PasswordResetToken | `password_reset_tokens` | token, expiresAt                                                     |

### Catálogos

| Modelo          | Tabla                | Campos Clave                                   |
| --------------- | -------------------- | ---------------------------------------------- |
| ProductCategory | `product_categories` | name, companyId                                |
| Supplier        | `suppliers`          | name, rnc, bankDetails (JSON)                  |
| Customer        | `customers`          | name, rnc, creditLimit, balance (Decimal 12,2) |

### Productos e Inventario

| Modelo         | Tabla              | Campos Clave                                                                  |
| -------------- | ------------------ | ----------------------------------------------------------------------------- |
| Product        | `products`         | name, code (EAN-13), barcode, sku, costPrice, salePrice, stock, taxRate (18%) |
| ProductVariant | `product_variants` | name, sku, priceAdjustment, attributes (JSON)                                 |
| InventoryLog   | `inventory_logs`   | type (entrada/salida/ajuste/venta), quantity, referenceId                     |

### Ventas y Facturación

| Modelo      | Tabla           | Campos Clave                                                                                             |
| ----------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| Invoice     | `invoices`      | orderNumber, ncfNumber, ncfType, subtotal, taxAmount, total, status, isBilled, paymentMethod, amountPaid |
| InvoiceItem | `invoice_items` | productName, quantity, unitPrice, discountPercent, taxRate, variantInfo (JSON)                           |
| CreditNote  | `credit_notes`  | amount, reason, ncfNumber                                                                                |
| DebitNote   | `debit_notes`   | amount, reason, ncfNumber                                                                                |

### Gastos, Caja, Logística y Alertas

| Modelo       | Tabla            | Descripción                                                             |
| ------------ | ---------------- | ----------------------------------------------------------------------- |
| Expense      | `expenses`       | Gastos DGII Formato 606: rncCedula, ncf, montoFacturado, itbisFacturado |
| CashShift    | `cash_shifts`    | Turnos: openingAmount, closingAmount, expectedAmount, difference        |
| CashMovement | `cash_movements` | Movimientos de caja: type, amount, reason                               |
| Shipment     | `shipments`      | Envíos: trackingNumber, carrier, status, qrCode                         |
| Offer        | `offers`         | Ofertas: discountType, discountValue, validFrom/Until                   |
| Alert        | `alerts`         | Alertas: type, title, message, targetRoles[]                            |

### Facturación Electrónica (e-CF)

| Modelo      | Tabla           | Campos Clave                                                         |
| ----------- | --------------- | -------------------------------------------------------------------- |
| EcfSequence | `ecf_sequences` | tipoEcf, rangoDesde/Hasta, secuencial, estado                        |
| EcfDocument | `ecf_documents` | tipoEcf, eNcf (único), xmlContent, trackId, dgiiStatus, securityCode |

### Roles de Usuario

```
admin       → Acceso total (flag isAdmin)
manager     → Mayoría de operaciones, excepto administración de usuarios
supervisor  → Inventario, pedidos, turnos
cashier     → Pedidos, facturas, clientes
driver      → Envíos y confirmación de entrega
accountant  → Vistas financieras, reportes, fiscalidad
viewer      → Solo Dashboard (solo lectura)
```

---

## ⚙️ Configuración del Entorno

### Requisitos Previos

- **Node.js** v20 LTS o superior
- **PostgreSQL** v15 o superior
- **pnpm** v10 (`npm i -g pnpm`)

### Variables de Entorno del Backend (`backend/.env`)

Crear el archivo `backend/.env` basado en la plantilla `backend/.env.example`:

```env
# Base de datos
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/zenda_db?schema=public"

# Servidor
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:5177"

# JWT
JWT_SECRET="clave_secreta_larga_y_aleatoria"
JWT_EXPIRES_IN="24h"
REFRESH_TOKEN_EXPIRES_IN="7d"

# Administrador de plataforma (SaaS)
PLATFORM_ADMIN_API_KEY="tu_api_key_de_plataforma"
PLATFORM_OWNER_EMAIL="admin@tudominio.com"
PLATFORM_OWNER_PASSWORD="password_de_administrador"
ADMIN_PASSWORD="contraseña_inicial_seed"

# Billing enforcement
BILLING_ENFORCEMENT_ENABLED=true
BILLING_BLOCK_MODE=auto
BILLING_ENFORCEMENT_SCHEDULER_ENABLED=true
BILLING_ENFORCEMENT_INTERVAL_MINUTES=30
BILLING_GRACE_DAYS=5
BILLING_REMINDER_DAYS=7,3,1

# PayPal (suscripciones)
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=TU_CLIENT_ID
PAYPAL_CLIENT_SECRET=TU_CLIENT_SECRET
PAYPAL_PLAN_MONTHLY=PLAN_ID_MENSUAL
PAYPAL_PLAN_ANNUAL=PLAN_ID_ANUAL

# Email (Resend)
RESEND_API_KEY="re_xxxxxxxx"
RESEND_FROM_EMAIL="noreply@tudominio.com"

# SMTP alternativo (Nodemailer)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="notificaciones@example.com"
SMTP_PASS="contraseña_smtp"
SMTP_FROM="Zenda ERP <notificaciones@example.com>"
```

### Variables de Entorno del Frontend (`.env.local`)

En la raíz del proyecto (`ZendaERP/`), crear o editar el archivo `.env.local`:

```env
VITE_API_URL="http://localhost:3001/api"
```

---

## 📦 Instalación

```bash
# 1. Clonar e ingresar al proyecto
git clone <url-del-repositorio>
cd ZendaERP
enda
# 2. Instalar dependencias del frontend (raíz)
pnpm install

# 3. Instalar dependencias del backend
cd backend
pnpm install

# 4. Generar el cliente Prisma
pnpm db:generate

# 5. Aplicar migraciones a la base de datos
pnpm db:migrate

# 6. (Opcional) Cargar datos semilla iniciales
pnpm db:seed
```

---

## 🖥️ Ejecución en Desarrollo

### Backend (API)

```bash
cd backend
pnpm dev
# API disponible en http://localhost:3001
# Health check: http://localhost:3001/api/health
# Observabilidad: http://localhost:3001/api/admin/observability/overview
```

### Frontend Web (Navegador)

```bash
# En la raíz del proyecto
pnpm dev:vite
# Servidor Vite en http://localhost:5177
```

### Aplicación de Escritorio Completa (Electron + Vite)

```bash
# En la raíz del proyecto
pnpm dev
# Inicia Vite + Electron concurrentemente
```

### Monitor de Impresora Térmica (ESC/POS)

```bash
pnpm monitor:escpos
```

### Tests Unitarios

```bash
pnpm test
```

---

## 🌐 Rutas de la API REST

| Prefijo                                        | Descripción                           |
| ---------------------------------------------- | ------------------------------------- |
| `GET /api/health`                              | Health check global                   |
| `POST /api/auth/login`                         | Inicio de sesión                      |
| `POST /api/auth/refresh`                       | Renovar access token                  |
| `/api/products`                                | CRUD de productos y variantes         |
| `/api/customers`                               | CRUD de clientes                      |
| `/api/suppliers`                               | CRUD de proveedores                   |
| `/api/invoices`                                | Facturas: crear, facturar, anular     |
| `/api/expenses`                                | Gastos (Formato 606 DGII)             |
| `/api/categories`                              | Categorías de productos               |
| `/api/users`                                   | Gestión de usuarios y roles           |
| `/api/shifts`                                  | Apertura y cierre de turnos de caja   |
| `/api/shipments`                               | Gestión de envíos y logística         |
| `/api/offers`                                  | Ofertas y descuentos                  |
| `/api/settings`                                | Configuración de empresa              |
| `/api/alerts`                                  | Sistema de alertas internas           |
| `/api/scanner`                                 | Búsqueda por código de barras         |
| `/api/billing`                                 | Suscripción del tenant (self-service) |
| `/api/backup`                                  | Exportar/importar datos               |
| `/api/ecf`                                     | Comprobantes Fiscales Electrónicos    |
| `/api/email`                                   | Envío de facturas por correo          |
| `/api/admin/billing`                           | Admin SaaS: gestión de empresas       |
| `/api/admin/observability/overview`            | Métricas globales de plataforma       |
| `/api/admin/observability/tenants/:id/metrics` | Métricas P50/P95/P99 por tenant       |
| `/api/admin/observability/traces`              | Trazas HTTP globales o por tenant     |
| `/api/admin/observability/logs`                | Logs estructurados                    |
| `/api/admin/observability/system`              | CPU, RAM, uptime, latencia DB         |
| `/api/admin/observability/errors`              | Top errores recientes                 |
| `/api/admin/observability/slow-queries`        | Requests lentos (>1000 ms)            |
| `/api/monitoring/health`                       | Uptime, memoria, observabilidad stats |
| `/api/monitoring/ready`                        | Readiness check con ping a PostgreSQL |

---

## 🐳 Despliegue con Docker

```bash
# Construir imagen del backend (node:22-alpine)
docker build -t zenda-backend .

# Levantar la infraestructura (API + PostgreSQL)
docker compose up -d
```

Para depuración con logs detallados:

```bash
docker compose -f compose.debug.yaml up
```

---

## 🚀 Despliegue en Producción (VPS + Electron Local)

Ver guía completa: [`docs/GUIA_DESPLIEGUE.md`](docs/GUIA_DESPLIEGUE.md)

**Resumen arquitectura híbrida:**

```
[Frontend Electron/Web] ──HTTPS──► [Nginx] ──► [Express PM2 :3001] ──► [PostgreSQL]
  (Máquina local)                   (VPS Ubuntu)
```

**Pasos clave en el servidor:**

1. Instalar Node.js 20, pnpm, PM2, PostgreSQL 15+
2. Clonar repo y configurar `backend/.env` con datos de producción
3. Ejecutar `npx prisma migrate deploy` y `pnpm db:seed`
4. Iniciar con `pm2 start src/index.js --name zenda-backend`
5. Configurar Nginx como proxy inverso + SSL (Let's Encrypt)

**Frontend local apuntando al servidor:**

```env
# .env.local
VITE_API_URL="https://api.tudominio.com/api"
```

---

## 🔒 Seguridad

- **Helmet:** Cabeceras de seguridad HTTP en todas las respuestas.
- **CORS estricto:** Lista blanca de orígenes configurada en `index.js`.
- **Rate Limiting:** 500 req/min general; 10 req/15 min en `/auth/login`.
- **JWT dual-token:** Access token (24h) + Refresh token hashed con SHA-256 en BD.
- **Inactividad:** Timeout automático de sesión a los 30 minutos de inactividad.
- **Bcryptjs:** Hashing adaptativo de contraseñas y PIN de cajero.
- **Zod:** Validación de esquemas en frontend y backend antes de tocar la BD.
- **Billing enforcement:** Middleware bloquea automáticamente tenants suspendidos.
- **RBAC:** 7 roles con permisos granulares por vista y endpoint.

---

## 🏗️ Patrones Clave

### API Client Factory (Frontend)

```javascript
// src/api/client.js
function createResourceApi(resource) {
  return {
    list: (params) => get(`/${resource}`, params),
    get: (id) => get(`/${resource}/${id}`),
    create: (data) => post(`/${resource}`, data),
    update: (id, d) => put(`/${resource}/${id}`, d),
    delete: (id) => del(`/${resource}/${id}`),
  };
}
```

### Multi-Tenant Isolation (Backend)

```javascript
// Cada ruta inyecta companyId desde el JWT
const where = { companyId: req.companyId };
const data = await prisma.product.findMany({ where });
```

### Navegación sin Router

- `App.jsx` gestiona el estado `view` (string).
- `setViewWithGuard()` valida permisos de rol antes de navegar.
- `renderView()` mapea IDs de vista a componentes mediante `switch`.

---

## 📊 Observabilidad

El sistema de observabilidad es **in-memory** y captura automáticamente:

| Métrica      | Descripción                                             |
| ------------ | ------------------------------------------------------- |
| RPM          | Requests por minuto (global y por tenant)               |
| Latencia     | P50 / P95 / P99 por endpoint                            |
| Errores      | Agrupados por tipo y empresa                            |
| Slow Queries | Requests con latencia > 1000 ms                         |
| Traces       | Últimas N trazas con filtros (método, status, duración) |
| Logs         | Estructurados por nivel (info, warn, error)             |
| System       | Uso de heap/RSS, uptime, latencia de BD                 |

Acceso exclusivo para `PLATFORM_OWNER_EMAIL` con token de scope `platform_admin`.

---

## 🧪 Testing

```bash
pnpm test        # Ejecutar suite completa con Vitest
```

Configuración en `vitest.config.js` con `jsdom` como entorno de pruebas.
Incluye `@testing-library/react` y `@testing-library/user-event` para tests de componentes.

---

## 📦 Empaquetado de Escritorio

```bash
pnpm build     # Compilar frontend con Vite
pnpm package   # Generar instalador con electron-builder
```

Plataformas soportadas:

- **Windows:** NSIS installer (`.exe`)
- **macOS:** DMG (`.dmg`)
- **Linux:** AppImage (`.AppImage`)

---

_Desarrollado y mantenido por **Batey Creativo Studio**
