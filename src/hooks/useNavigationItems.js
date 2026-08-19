import { useMemo } from 'react';
import {
    Package,
    Users,
    ShoppingCart,
    FileText,
    LayoutDashboard,
    Truck,
    BarChart,
    PiggyBank,
    Tag,
    Shield,
    Receipt,
    Wallet,
    Coins,
    Scale,
    CreditCard,
    Clock3,
    Settings,
} from 'lucide-react';
import { filterNavItemsByRole } from '../utils/permissions.js';

export const useNavigationItems = (role, isMasterUser) => {
    const finalRole = isMasterUser ? 'admin' : (role || 'viewer');

    const navItems = useMemo(() => {
        const financeChildren = [
            { id: 'finance-sales-reports', label: 'Reportes de Ventas', icon: BarChart },
            { id: 'finance-cash-shifts', label: 'Turnos de Caja', icon: Clock3 },
            { id: 'finance-expenses', label: 'Gestión de Gastos', icon: Receipt },
            { id: 'finance-accounts-receivable', label: 'Cuentas por Cobrar', icon: Coins },
            { id: 'finance-accounts-payable', label: 'Cuentas por Pagar', icon: Wallet },
            { id: 'finance-fiscal-management', label: 'Gestión Fiscal', icon: Scale },
            { id: 'finance-accounting', label: 'Contabilidad', icon: CreditCard },
        ];

        const items = [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'orders', label: 'Nuevo Pedido', icon: ShoppingCart },
            { id: 'invoices', label: 'Pedidos/Facturas', icon: FileText },
            { id: 'finance', label: 'Finanzas', icon: PiggyBank, children: financeChildren },
            { id: 'warehouse', label: 'Gestión de Almacén', icon: Package, children: [
                { id: 'products', label: 'Inventario de Productos', icon: Package },
                { id: 'shipments', label: 'Envíos', icon: Truck }
            ] },
            { id: 'offers', label: 'Ofertas', icon: Tag },
            { id: 'customers', label: 'Clientes', icon: Users },
            { id: 'suppliers', label: 'Proveedores', icon: Truck },
        ];

        items.push({ id: 'users', label: 'Gestionar Usuarios', icon: Shield });
        items.push({ id: 'settings', label: 'Configuración', icon: Settings });

        return filterNavItemsByRole(finalRole, items);
    }, [finalRole]);

    return navItems;
};
