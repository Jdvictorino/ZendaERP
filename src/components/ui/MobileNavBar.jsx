import React from 'react';
import { LayoutDashboard, ShoppingCart, FileText, Users, Menu } from 'lucide-react';

const MobileNavBar = ({ currentView, onNavigate, onOpenMenu }) => {
  const items = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'orders', label: 'Ventas', icon: ShoppingCart },
    { id: 'invoices', label: 'Facturas', icon: FileText },
    { id: 'customers', label: 'Clientes', icon: Users },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-gray-200/50 dark:border-gray-800/50 px-2 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.04)] transition-all duration-300">
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-90 ${
                isActive 
                  ? 'text-brand-600 dark:text-brand-400' 
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
              }`}
            >
              <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold tracking-tight ${isActive ? 'opacity-100' : 'opacity-70'}`}>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center w-full h-full gap-1 text-gray-400 dark:text-gray-500 active:scale-90"
        >
          <div className="p-1.5 rounded-xl">
            <Menu size={22} />
          </div>
          <span className="text-[10px] font-bold tracking-tight opacity-70">Más</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileNavBar;
