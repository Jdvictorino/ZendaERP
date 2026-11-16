import { VIEW_PERMISSIONS as appTable, ROLE_OPTIONS } from '../src/utils/permissions.js';
import { VIEW_PERMISSIONS as serverTable, rolesFor } from '../backend/src/permissions.js';

test('el servidor autoriza con la misma tabla de permisos que muestra la app', () => {
  expect(serverTable).toEqual(appTable);
});

test('rolesFor une los roles de las pantallas sin repetir', () => {
  expect(rolesFor('finance-expenses')).toEqual(['admin', 'manager', 'accountant']);
  expect(rolesFor('orders', 'finance-cash-shifts').sort()).toEqual(['admin', 'cashier', 'manager', 'supervisor']);
});

test('todos los roles de la tabla existen en la app', () => {
  const roles = new Set(ROLE_OPTIONS.map((r) => r.value));
  Object.values(appTable).flat().forEach((r) => expect(roles.has(r)).toBe(true));
});
