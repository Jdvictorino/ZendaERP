# 📱 Notificaciones del Dispositivo - Guía Rápida

## ✅ Estado: Implementado

Las notificaciones del dispositivo (Web Notifications API) están ahora integradas en los 4 eventos principales de la aplicación.

---

## 🔔 Eventos que Generan Notificaciones del Dispositivo

| Evento | Dónde Ocurre | Notificación |
|--------|-------------|------------|
| **Crear Pedido** | OrdersView | "Nuevo Pedido - Pedido #PED-xxx creado - RD$ 5,000" |
| **Facturar Pedido** | OrdersView / InvoicesView | "Pedido Facturado - Pedido #PED-xxx facturado con NCF B01..." |
| **Registrar Pago** | PaymentModal | "Pago Recibido - Pago de RD$ 5,000 para pedido #PED-xxx" |
| **Despachar Envío** | ShipmentsView | "Envío Despachado - Envío #TRK-xxx está en reparto" |
| **Confirmar Entrega** | ShipmentsView | "Entrega Confirmada - Envío #TRK-xxx entregado exitosamente" |

---

## 🚀 Cómo Probar

### Paso 1: Permitir Notificaciones en el Navegador
Cuando abras la app por primera vez, el navegador te pedirá permisos:
```
¿Permitir que Zenda ERP muestre notificaciones?
[Permitir]  [Bloquear]
```
**Haz clic en "Permitir"** (si ya bloqueaste, ve a Configuración del navegador)

### Paso 2: Crear un Pedido
1. Abre la pestaña **"Órdenes"**
2. Selecciona un cliente
3. Agrega productos al carrito
4. Clic en **"Procesar Pedido"**

**Resultado esperado:**
- ✅ Verás una notificación en la **esquina inferior derecha** (Windows) o en el **Notification Center** (Mac)
- ✅ La notificación dirá algo como: `"Nuevo Pedido - Pedido #PED-1704067234562 creado - RD$ 5,000.00"`

### Paso 3: Facturar el Pedido
1. El sistema abrirá un modal **"PostOrderActionsModal"**
2. Clic en **"Facturar"**
3. Selecciona tipo de NCF (B01, B02 o Sin Valor Fiscal)
4. Clic en **"Facturar"**

**Resultado esperado:**
- ✅ Nueva notificación: `"Pedido Facturado - Pedido #PED-xxx facturado con NCF B0100000001"`

### Paso 4: Registrar un Pago
1. Ve a **"Facturas"** (Seguimiento de Pedidos y Facturas)
2. Busca un pedido facturado
3. Clic en **"Pagar"** (o el icono de "$")
4. Ingresa el monto
5. Clic en **"Confirmar Pago"**

**Resultado esperado:**
- ✅ Notificación: `"Pago Recibido - Pago de RD$ 5,000.00 para pedido #PED-xxx"`

### Paso 5: Envíos (si usas esta función)
1. Ve a **"Envíos"**
2. Busca un envío pendiente
3. Asigna un repartidor
4. Clic en **"Marcar como Enviado"**

**Resultado esperado:**
- ✅ Notificación: `"Envío Despachado - Envío #TRK-xxx está en reparto"`

---

## 🔧 Solucionar Problemas

### Las notificaciones no aparecen

**1. Verificar permisos del navegador:**
- **Chrome/Edge**: Settings → Privacy → Site settings → Notifications → Busca "Zenda ERP" → Cambia a "Allow"
- **Firefox**: Preferences → Privacy → Permissions → Notifications → Busca tu dominio
- **Safari**: Preferences → Websites → Notifications

**2. Verificar que el navegador no esté silenciado:**
- En Windows: Revisa las **Notification Settings**
- En Mac: System Preferences → Notifications

**3. Verificar que notificationService esté cargado:**
- Abre **F12 → Console**
- Crea un pedido
- Busca mensajes como:
  ```
  [NOTIFICATION] EVENT: ORDER_CREATED
  [NOTIFICATION] Enviando a canal desktop
  ```

**4. Verificar que el archivo notificationService.js exista:**
```
src/utils/notificationService.js ✅
src/utils/notificationChannels.js ✅
```

---

## 📊 Canales Disponibles

Ahora hay 4 canales de notificación disponibles:

1. **Toast** (En-app) - Notificaciones dentro de la app
2. **Desktop** (Sistema Operativo) - 🔔 Las que ves en la pantalla
3. **Database** (localStorage) - Almacenadas en historial
4. **Audit** (Console) - Para debugging

Las notificaciones que integramos usan el canal **Desktop** (el que sale en pantalla).

---

## 📝 Código Técnico

Cada integración sigue este patrón:

```javascript
// En OrdersView.jsx, después de crear un pedido:
notificationService.notify('ORDER_CREATED', {
    title: 'Nuevo Pedido',
    message: `Pedido #${orderData.orderNumber} creado - ${formatCurrency(orderData.total)}`,
}, ['desktop']);  // ← Solo canal de desktop
```

El parámetro `['desktop']` especifica que solo use el canal de notificaciones del dispositivo.

---

## ✨ Características

- ✅ **Automático**: Sin configuración adicional
- ✅ **Instantáneo**: Se muestra inmediatamente
- ✅ **Permiso único**: Solo pide permiso una vez
- ✅ **No intrusivo**: Se cierra automáticamente
- ✅ **Funcional sin internet**: Usa sistema operativo nativo
- ✅ **Persiste aunque cierre pestaña**: Si permitiste notificaciones

---

## 🎯 Próximas Mejoras

- [ ] Agregar sonido a las notificaciones
- [ ] Agregar acciones en las notificaciones (click → ir al pedido)
- [ ] Agregar iconos personalizados
- [ ] Agregar categorías de notificaciones
- [ ] Integrar con Service Workers

---

## ✅ Checklist

Después de seguir esta guía, deberías tener:

- [ ] Permisos de notificación permitidos en el navegador
- [ ] Vista al menos una notificación del dispositivo
- [ ] Notificaciones apareciendo en los 4 eventos principales
- [ ] Centro de Notificaciones mostrando historial

---

**¿Todo funciona?** 🎉 ¡Las notificaciones del dispositivo están completamente integradas!

**¿Aún no ves notificaciones?** Revisa Console (F12) y busca mensajes de error.
