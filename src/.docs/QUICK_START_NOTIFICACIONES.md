# 🚀 QUICK START - Sistema de Notificaciones

## ⚡ En 60 Segundos

### 1. Verificar que funciona (Usuario)
```
1. Abre Zenda ERP
2. Haz clic en 🔔 (campana, arriba a la derecha)
3. Permite notificaciones si te lo pide el navegador
4. Crea una nueva Orden (Órdenes → Nueva Orden → Guardar)
5. ¡Verás una notificación en la esquina de tu pantalla! ✅
```

### 2. Disparar notificación (Developer)
```javascript
import { notificationService } from './utils/notificationService';

notificationService.notify('ORDER_CREATED', {
  title: 'Nueva Orden',
  message: 'Orden ORD-123 creada exitosamente',
  channels: ['desktop'],
  metadata: { orderId: 'ORD-123', amount: 1000 }
});
```

### 3. Funcionalidades principales
- 🔍 **Buscar**: Digita en la barra de búsqueda
- 📋 **Filtrar**: Selecciona tipo de evento
- 👁️ **Marcar leído**: Pasa mouse y haz clic en ojo
- 🗑️ **Eliminar**: Haz clic en papelera
- 📊 **Estadísticas**: Pestaña "Estadísticas"
- ⚙️ **Configurar**: Pestaña "Configuración"

---

## 📁 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| src/utils/notificationService.js | Hub central de eventos |
| src/components/NotificationCenter.jsx | Panel de interfaz |
| src/components/NotificationCenter.css | Estilos |
| src/hooks/useNotification.js | Hook React |
| src/utils/notificationChannels.js | 4 canales |

---

## 🎯 6 Eventos Disponibles

1. **ORDER_CREATED** - Nueva orden en OrdersView
2. **ORDER_BILLED** - Orden facturada en OrdersView
3. **INVOICE_ISSUED** - Factura emitida en InvoicesView
4. **PAYMENT_RECEIVED** - Pago en PaymentModal
5. **SHIPMENT_DISPATCHED** - Envío despachado en ShipmentsView
6. **SHIPMENT_DELIVERED** - Envío entregado en ShipmentsView

---

## 💾 Persistencia

Las notificaciones leídas se guardan en localStorage:
```javascript
localStorage.getItem('notificationReadStatus')
```

El estado persiste al recargar la página.

---

## 🎨 3 Canales

```javascript
// Qué tipos de canales existen:
channels: ['toast']      // Notificación flotante en app
channels: ['desktop']    // Notificación del SO
channels: ['database']   // Guardar en localStorage
channels: ['audit']      // Loguear en consola

// Usar múltiples:
channels: ['desktop', 'toast', 'database']
```

---

## 📚 Documentación Completa

- **NOTIFICATION_SYSTEM_SUMMARY.md** - Documentación técnica
- **NOTIFICATION_TESTING_GUIDE.md** - Cómo probar todo
- **README_NOTIFICACIONES.md** - Resumen ejecutivo
- **CHANGELOG_NOTIFICACIONES.md** - Cambios realizados
- **SYSTEM_STATUS.txt** - Estado visual

---

## ✅ Checklist

- [ ] Icono de campana visible en Header
- [ ] Panel de notificaciones abre al hacer click
- [ ] Creo una orden y aparece notificación
- [ ] Puedo buscar notificaciones
- [ ] Puedo filtrar por tipo
- [ ] Puedo marcar como leído
- [ ] Puedo eliminar notificaciones
- [ ] Estadísticas se muestran correctamente
- [ ] Estado persiste después de recargar

---

## 🐛 Troubleshooting Rápido

**No aparecen notificaciones del SO**
→ Verifica permisos en navegador (candado arriba)

**Panel no abre**
→ Abre consola (F12) y busca errores

**Estilos se ven raros**
→ Recarga con Ctrl+F5 (limpia caché)

**localStorage no funciona**
→ Verifica que localStorage está habilitado

---

## 🎓 Próximo Paso

Revisa **NOTIFICATION_TESTING_GUIDE.md** para validación completa.

---

**¡Sistema listo para usar! 🚀**
