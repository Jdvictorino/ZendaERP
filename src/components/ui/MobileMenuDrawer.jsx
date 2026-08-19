import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { ChevronRight, ChevronDown } from 'lucide-react';

const MobileMenuDrawer = ({ isOpen, onClose, navItems, currentView, onNavigate }) => {
  const [openGroups, setOpenGroups] = useState({});

  useEffect(() => {
    if (isOpen) {
      navItems.forEach(item => {
        if (item.children?.some(child => child.id === currentView)) {
          setOpenGroups(prev => ({ ...prev, [item.id]: true }));
        }
      });
    }
  }, [isOpen, currentView, navItems]);

  const handleToggleGroup = (id) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Menú"
      subtitle="Todos los módulos"
      size="full"
      className="!max-h-[85vh]"
    >
      <div className="space-y-6 pb-safe">
        {navItems.map((item) => {
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const isExpanded = openGroups[item.id] || false;
          const isActive = currentView === item.id || (hasChildren && item.children.some(c => c.id === currentView));
          
          return (
            <div key={item.id} className="space-y-2">
              {/* Module tile */}
              <button
                onClick={() => {
                  if (!hasChildren) {
                    onNavigate(item.id);
                    onClose();
                  } else {
                    handleToggleGroup(item.id);
                  }
                }}
                className={`flex items-center gap-4 p-4 rounded-2xl w-full transition-all active:scale-[0.97] ${
                  isActive 
                    ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-200/50 dark:border-brand-800/30 shadow-sm' 
                    : 'bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isActive 
                    ? 'bg-brand-500 shadow-lg shadow-brand-500/20' 
                    : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  <item.icon size={20} className={isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
                </div>
                <div className="flex-1 text-left">
                  <span className={`text-sm font-bold tracking-tight ${
                    isActive ? 'text-brand-700 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {item.label}
                  </span>
                  {hasChildren && (
                    <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">
                      {item.children.length} sub-módulos
                    </p>
                  )}
                </div>
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-300 dark:text-gray-600" />
                  )
                ) : (
                  <ChevronRight size={16} className="text-gray-300 dark:text-gray-600" />
                )}
              </button>
              
              {/* Sub-items */}
              {hasChildren && isExpanded && (
                <div className="ml-6 pl-4 border-l-2 border-gray-100 dark:border-gray-800 space-y-1 animate-fadeIn">
                  {item.children.map(child => {
                    const childActive = currentView === child.id;
                    return (
                      <button
                        key={child.id}
                        onClick={() => {
                          onNavigate(child.id);
                          onClose();
                        }}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm transition-all active:scale-[0.97] ${
                          childActive
                            ? 'bg-brand-50 dark:bg-brand-900/10 text-brand-700 dark:text-brand-400 font-bold'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/30'
                        }`}
                      >
                        {childActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                        )}
                        <child.icon size={14} className={childActive ? 'text-brand-500' : 'text-gray-400 dark:text-gray-500'} />
                        <span className="truncate tracking-tight">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default MobileMenuDrawer;


