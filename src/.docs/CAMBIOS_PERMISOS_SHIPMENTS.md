# Cambios de Permisos - Gestión de Envíos

## Resumen
Se han actualizado los permisos para permitir que **Gerentes (Manager)** y **Cajeros (Cashier)** puedan asignar envíos a mensajeros (repartidores) para que inicien el envío y realicen las entregas.

## Cambios Realizados

### 1. **ShipmentsView.jsx** - Líneas 123-124

**Antes:**
```javascript
const rolesAllowedToShip = ['admin', 'gerente', 'manager', 'vendedor', 'seller'];
const canCurrentUserMarkAsShipped = isMasterUser || rolesAllowedToShip.includes(currentRole);
```

**Después:**
```javascript
const rolesAllowedToShip = ['admin', 'gerente', 'manager', 'vendedor', 'seller', 'cashier'];
const canCurrentUserMarkAsShipped = isMasterUser || rolesAllowedToShip.includes(currentRole);
const canCurrentUserAssignShipment = isMasterUser || ['admin', 'manager', 'cashier'].includes(currentRole);
```

**Cambios:**
- Agregado `'cashier'` a `rolesAllowedToShip` (para que los cajeros puedan marcar envíos como enviados)
- Creada nueva variable `canCurrentUserAssignShipment` que determina quién puede asignar repartidores
- Roles autorizados: `admin`, `manager`, `cashier`

### 2. **ShipmentsView.jsx** - Función `openCreate()` (Líneas 57-65)

**Antes:**
```javascript
const openCreate = () => {
  setSelectedShipment(null);
  setShowModal(true);
};
```

**Después:**
```javascript
const openCreate = () => {
  if (!canCurrentUserAssignShipment) {
    alert('Solo administradores, gerentes y cajeros pueden crear envíos.');
    return;
  }
  setSelectedShipment(null);
  setShowModal(true);
};
```

**Cambios:**
- Agregada validación de permisos antes de permitir crear un nuevo envío
- Muestra un mensaje de alerta si el usuario no tiene permisos

### 3. **ShipmentsView.jsx** - Función `handleEdit()` (Líneas 84-92)

**Antes:**
```javascript
const handleEdit = (s) => {
  setSelectedShipment(s);
  setShowModal(true);
};
```

**Después:**
```javascript
const handleEdit = (s) => {
  if (!canCurrentUserAssignShipment) {
    alert('Solo administradores, gerentes y cajeros pueden editar envíos.');
    return;
  }
  setSelectedShipment(s);
  setShowModal(true);
};
```

**Cambios:**
- Agregada validación de permisos antes de permitir editar un envío
- Muestra un mensaje de alerta si el usuario no tiene permisos

### 4. **ShipmentsView.jsx** - Select de Repartidor (Línea ~583)

**Antes:**
```jsx
<select 
  defaultValue={s.assignedDriverId || ''} 
  onChange={(e) => handleAssign(s.id, e.target.value)} 
  className="px-2 py-1 rounded border border-slate-200 text-sm focus:ring-indigo-500 focus:outline-none"
>
```

**Después:**
```jsx
<select 
  defaultValue={s.assignedDriverId || ''} 
  onChange={(e) => handleAssign(s.id, e.target.value)} 
  disabled={!canCurrentUserAssignShipment}
  className={`px-2 py-1 rounded border border-slate-200 text-sm focus:ring-indigo-500 focus:outline-none ${!canCurrentUserAssignShipment ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
  title={!canCurrentUserAssignShipment ? 'Solo administradores, gerentes y cajeros pueden asignar envíos' : 'Seleccionar repartidor'}
>
```

**Cambios:**
- El select ahora está deshabilitado si el usuario no tiene permisos de asignación
- Estilos visuales actualizados para indicar estado deshabilitado
- Agregado atributo `title` que muestra un tooltip con información de permisos

## Permisos por Rol

| Rol | Ver Envíos | Crear Envío | Editar Envío | Asignar Repartidor | Marcar como Enviado | Confirmar Entrega |
|-----|-----------|-----------|------------|-------------------|------------------|------------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Supervisor | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cashier | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Driver | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (solo asignados) |
| Accountant | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Flujo de Envío

1. **Crear Envío**: Admin, Manager o Cajero crean un nuevo envío
2. **Asignar Repartidor**: Admin, Manager o Cajero asignan un repartidor disponible
3. **Marcar como Enviado**: Admin, Manager o Cajero marcan el envío como "En Reparto"
4. **Confirmar Entrega**: El Repartidor asignado confirma la entrega escaneando el QR

## Notas Importantes

- Los **Cajeros** ahora tienen la responsabilidad de coordinar envíos junto con gerentes
- Los **Gerentes** mantienen su rol de supervisión y coordinación logística
- Los **Repartidores** solo pueden confirmar entregas, no asignar otras entregas
- La validación se implementa tanto en la UI como en Firestore (mediante reglas de seguridad)

## Archivos Modificados

- `src/views/ShipmentsView.jsx`
