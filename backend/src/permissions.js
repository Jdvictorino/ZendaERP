// Misma tabla que src/utils/permissions.js (test/permissions.spec.js comprueba que coincidan):
// un rol puede crear y editar en el servidor lo que la app le muestra. Borrar, anular y firmar
// siguen siendo de admin y gerente en cada ruta.
export const VIEW_PERMISSIONS = {
  dashboard: ['admin', 'manager', 'supervisor', 'cashier', 'accountant', 'viewer'],
  orders: ['admin', 'manager', 'supervisor', 'cashier'],
  invoices: ['admin', 'manager', 'supervisor', 'cashier', 'accountant'],
  products: ['admin', 'manager', 'supervisor'],
  purchases: ['admin', 'manager', 'supervisor'],
  'purchases-view': ['admin', 'manager', 'supervisor', 'accountant'],
  customers: ['admin', 'manager', 'supervisor', 'cashier', 'accountant'],
  suppliers: ['admin', 'manager', 'accountant'],
  'finance-sales-reports': ['admin', 'manager', 'accountant'],
  'finance-cash-shifts': ['admin', 'manager', 'supervisor'],
  'finance-expenses': ['admin', 'manager', 'accountant'],
  'finance-accounts-receivable': ['admin', 'manager', 'accountant'],
  'finance-accounts-payable': ['admin', 'manager', 'accountant'],
  'finance-fiscal-management': ['admin', 'manager', 'accountant'],
  'finance-accounting': ['admin', 'accountant'],
  'import-products': ['admin', 'manager', 'supervisor'],
  shipments: ['admin', 'manager', 'supervisor', 'cashier', 'driver'],
  'delivery-confirm': ['driver', 'admin'],
  users: ['admin'],
  offers: ['admin', 'manager'],
  'company-profile': ['admin', 'manager', 'supervisor', 'cashier', 'driver', 'accountant', 'viewer'],
  settings: ['admin', 'manager']
};

export const rolesFor = (...views) => [...new Set(views.flatMap((v) => VIEW_PERMISSIONS[v] || []))];
