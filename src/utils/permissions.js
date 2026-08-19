export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'cashier', label: 'Cajero' },
  { value: 'driver', label: 'Repartidor' },
  { value: 'accountant', label: 'Contador' },
  { value: 'viewer', label: 'Solo Lectura' }
];

const VIEW_PERMISSIONS = {
  dashboard: ['admin', 'manager', 'supervisor', 'cashier', 'accountant', 'viewer'],
  orders: ['admin', 'manager', 'supervisor', 'cashier'],
  invoices: ['admin', 'manager', 'supervisor', 'cashier', 'accountant'],
  products: ['admin', 'manager', 'supervisor', 'accountant'],
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

export const canAccessView = (role, view) => {
  if (!view) return false;
  if (role === 'admin') return true;
  const allowed = VIEW_PERMISSIONS[view];
  if (!allowed) return false;
  return allowed.includes(role);
};

export const filterNavItemsByRole = (role, navItems = []) => {
  return navItems
    .map((item) => {
      if (item.children) {
        const filteredChildren = filterNavItemsByRole(role, item.children);
        if (filteredChildren.length === 0 && !canAccessView(role, item.id)) {
          return null;
        }
        return { ...item, children: filteredChildren };
      }
      return canAccessView(role, item.id) ? item : null;
    })
    .filter(Boolean);
};

export const getRoleLabel = (role) => ROLE_OPTIONS.find((opt) => opt.value === role)?.label || 'Sin permisos asignados';
