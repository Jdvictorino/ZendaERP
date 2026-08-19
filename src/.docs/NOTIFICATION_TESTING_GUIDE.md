# 🎯 Guía de Prueba - Sistema de Notificaciones

## ✨ Nuevas Características por Validar

### 1️⃣ Icono de Campana Animada
**Ubicación**: Header superior derecho  
**Cómo validar**:
- [ ] Verifica que hay un icono de campana
- [ ] Verifica que tiene una pequeña animación (efecto de ring)
- [ ] Haz clic para abrir el panel
- [ ] Si hay notificaciones no leídas, debe haber un badge pequeño

---

### 2️⃣ Centro de Notificaciones - Pestaña "Historial"
**Cómo acceder**: Haz clic en el icono de campana  
**Cómo validar**:
- [ ] Se abre un panel en la esquina superior derecha
- [ ] Se ve el gradiente púrpura-rosa en el header
- [ ] Hay 3 pestañas: "Historial", "Estadísticas", "Configuración"

#### Búsqueda y Filtrado
- [ ] Hay una barra de búsqueda en la parte superior
- [ ] Digita texto para buscar (ej: "orden", "pago")
- [ ] Hay un dropdown con filtros por tipo de evento
- [ ] Selecciona un tipo y ve solo esas notificaciones

#### Notificaciones Individuales
- [ ] Cada notificación muestra: Icono + Tipo + Mensaje + Hora
- [ ] Los no leídos tienen un círculo/badge rojo
- [ ] Al pasar el mouse aparecen 2 botones (ojo y papelera)
- [ ] Puedes ver metadatos/detalles (líneas adicionales con info)

#### Botones de Acción
- [ ] **Ojo**: Marca como leído/no leído
- [ ] **Papelera**: Elimina esa notificación
- [ ] **"Marcar todo como leído"**: Marca todos en ese estado
- [ ] **"Limpiar leídas"**: Elimina todas las ya leídas

---

### 3️⃣ Centro de Notificaciones - Pestaña "Estadísticas"
**Cómo validar**:
- [ ] Muestra tarjetas con: Total, No leídas, Leídas
- [ ] Muestra un gráfico o conteos por tipo de evento
- [ ] Los números actualizan cuando llegan nuevas notificaciones
- [ ] Hay datos para: ORDEN, FACTURA, PAGO, ENVÍO

---

### 4️⃣ Centro de Notificaciones - Pestaña "Configuración"
**Cómo validar**:
- [ ] Hay toggles/switches para activar/desactivar canales
- [ ] Opciones: Toasts, Notificaciones, Base de datos, Auditoría
- [ ] Toggle de sonidos
- [ ] Botones para: Marcar todo, Limpiar leídas, Eliminar todo

---

### 5️⃣ Notificaciones de Dispositivo (Web Notifications)
**Cómo validar**:
1. **Permitir notificaciones**:
   - [ ] Primera vez que se abre, el navegador pide permiso
   - [ ] Acepta los permisos en la ventana emergente

2. **Ver notificación en el sistema**:
   - [ ] Crea una orden nueva
   - [ ] Verifica que aparece una notificación en la esquina del SO (Windows: abajo-derecha)
   - [ ] El título debe ser "Zenda ERP" o similar
   - [ ] El mensaje debe describir la acción

3. **Eventos que generan notificaciones**:
   - [ ] **Nueva Orden**: En OrdersView > Nueva orden
   - [ ] **Orden Facturada**: En OrdersView > Facturar
   - [ ] **Factura Emitida**: En InvoicesView > Emitir
   - [ ] **Pago Recibido**: En PaymentModal > Procesar pago
   - [ ] **Envío Despachado**: En ShipmentsView > Despachar
   - [ ] **Envío Entregado**: En ShipmentsView > Marcar entregado

---

### 6️⃣ Estado Persistente
**Cómo validar**:
- [ ] Marca una notificación como leída
- [ ] Recarga la página (F5)
- [ ] Verifica que sigue marcada como leída
- [ ] El localStorage persiste entre sesiones

---

### 7️⃣ Búsqueda y Filtrado en Tiempo Real
**Cómo validar**:
- [ ] Escribe en la barra de búsqueda
- [ ] Las notificaciones se filtran instantáneamente (sin delay)
- [ ] Selecciona un tipo de evento en el dropdown
- [ ] Solo se muestran notificaciones de ese tipo
- [ ] Combina búsqueda + filtro y funcionan juntos

---

### 8️⃣ Información de Metadatos
**Cómo validar**:
- [ ] Cada notificación muestra información adicional (en gris pequeño)
- [ ] Por ejemplo: ID de orden, monto, cliente, etc.
- [ ] Estos datos ayudan a identificar exactamente qué pasó

---

### 9️⃣ Acciones en Lote
**Cómo validar**:
- [ ] **Marcar todo como leído**: Todos pasan de rojo a gris
- [ ] **Limpiar leídas**: Se eliminan las que fueron marcadas como leídas
- [ ] **Eliminar todo**: Limpia completamente el historial

---

### 🔟 Diseño y Responsividad
**Cómo validar**:
- [ ] El panel se ve bien en desktop (ancho)
- [ ] El panel se ve bien en tablet (resize la ventana a ~600px)
- [ ] El panel se ve bien en móvil (resize a ~375px)
- [ ] Los botones son clickeables en todos los tamaños
- [ ] El scroll funciona bien cuando hay muchas notificaciones

---

## 🚀 Flujo de Prueba Completo

### Parte 1: Configuración Inicial
```
1. Abre Zenda ERP
2. Haz clic en el icono de campana (Header superior derecho)
3. Verifica que se abre el panel de notificaciones
4. Si aparece un diálogo de permisos del navegador, acepta
```

### Parte 2: Crear Eventos (Generarán Notificaciones)
```
1. Ve a Órdenes > Nueva Orden > Completa > Guardar
   ✓ Deberías ver una notificación del sistema
   ✓ Deberías verla en el panel (bajo "Historial")
   
2. Ve a esa Orden > Facturar
   ✓ Nueva notificación del sistema
   
3. Ve a Facturas > Nueva Factura > Emitir
   ✓ Nueva notificación del sistema
   
4. Ve a Envíos > Marcar como Despachado
   ✓ Nueva notificación del sistema
   
5. Ve a Pagos > Registrar Pago
   ✓ Nueva notificación del sistema
```

### Parte 3: Probar Funcionalidades
```
1. Búsqueda:
   - En el panel, digita "orden" en la barra de búsqueda
   - Deben filtrarse solo notificaciones con "orden"
   
2. Filtrado por Tipo:
   - Abre el dropdown de "Tipo de Evento"
   - Selecciona "ORDEN_CREADA"
   - Solo se muestran órdenes
   
3. Marcar como Leído:
   - Pasa el mouse sobre una notificación
   - Haz clic en el icono del ojo (eye icon)
   - El fondo pasa de brillante a atenuado
   - El badge rojo desaparece
   
4. Eliminar Notificación:
   - Pasa el mouse sobre una notificación
   - Haz clic en el icono de papelera
   - Se desvanece y desaparece
   
5. Acciones en Lote:
   - Haz clic en "Marcar todo como leído"
   - Todas las notificaciones pasan a gris
   - Haz clic en "Limpiar notificaciones leídas"
   - Se eliminan todas
```

### Parte 4: Probar Pestañas
```
1. Pestaña "Estadísticas":
   - Click en la pestaña "Estadísticas"
   - Ve contadores y gráficos
   - Verifica que los números son correctos
   
2. Pestaña "Configuración":
   - Click en "Configuración"
   - Activa/desactiva toggles
   - Prueba los botones (Marcar todo, Limpiar, Eliminar todo)
```

---

## ✅ Checklist de Validación Final

```
FUNCIONALIDAD:
[ ] Notificaciones de dispositivo aparecen en 6 eventos
[ ] Panel abre al hacer clic en campana
[ ] Búsqueda funciona instantáneamente
[ ] Filtrado por tipo de evento funciona
[ ] Marcar como leído/no leído funciona
[ ] Eliminar notificación funciona
[ ] Metadatos se muestran correctamente
[ ] Acciones en lote funcionan
[ ] Estadísticas se actualizan
[ ] Configuración guarda preferencias

DISEÑO:
[ ] Gradiente púrpura-rosa visible
[ ] Icono de campana animado
[ ] Badges de no leídas visibles
[ ] Botones de acción en hover
[ ] Responsive en mobile/tablet/desktop

PERSISTENCIA:
[ ] Estado leído persiste después de recargar
[ ] Historial se guarda en localStorage
[ ] Preferencias se mantienen

PERFORMANCE:
[ ] Panel abre rápido
[ ] Búsqueda sin lag
[ ] Scroll suave
[ ] Sin errores en consola (F12)
```

---

## 🐛 Si Algo No Funciona

### Las notificaciones no aparecen
1. Verifica que los permisos están habilitados:
   - Chrome: Candado > Notificaciones > Permitir
   - Firefox: Preferencias > Privacidad > Notificaciones
2. Revisa la consola (F12 > Console) para errores
3. Intenta crear una orden nueva
4. Si aún no funciona, revisa que `notificationService` esté importado

### El panel no se abre
1. Verifica que el icono de campana está clickeable
2. Revisa que Header.jsx importa NotificationCenter
3. Limpia caché: Ctrl+Shift+Delete

### Los estilos se ven mal
1. Recarga la página completa: Ctrl+F5
2. Limpia caché del navegador
3. Verifica que NotificationCenter.css está cargado (F12 > Network)

---

## 📞 Soporte

Si encuentras un problema:
1. Abre la Consola (F12 > Console)
2. Copia el error exacto
3. Revisa que el error es de `NotificationCenter` o `notificationService`
4. Busca en `NOTIFICATION_SYSTEM_SUMMARY.md`

---

**¡Listo! El sistema está completamente implementado y listo para usar.** 🚀
