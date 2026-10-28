import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigationItems } from '../hooks/useNavigationItems.js';

const Sidebar = ({ setView, currentView, isMasterUser, currentRole: providedRole }) => {
    const [openGroups, setOpenGroups] = useState({});
    const navItems = useNavigationItems(providedRole, isMasterUser);

    useEffect(() => {
        navItems.forEach(item => {
            if (item.children?.some(child => child.id === currentView)) {
                setOpenGroups(prev => ({ ...prev, [item.id]: true }));
            }
        });
    }, [currentView, navItems]);

    const handleToggleGroup = (id) => {
        setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isChildActive = (children) => children?.some(child => child.id === currentView);

    return (
        <aside className="hidden lg:flex w-64 bg-night-900 text-white flex-col border-r border-gray-800/50 shadow-2xl">
            <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b border-gray-800/50">
                <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="Zenda ERP" className="h-9 w-9 rounded-xl shadow-lg shadow-brand-500/20" />
                <span className="hidden md:inline ml-3 text-lg font-bold tracking-tight">Zenda ERP</span>
            </div>
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                {navItems.map(item => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    const active = currentView === item.id || (hasChildren && isChildActive(item.children));

                    if (!hasChildren) {
                        return (
                            <a
                                key={item.id}
                                href="#"
                                onClick={(e) => { e.preventDefault(); setView(item.id); }}
                                className={`group relative flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-200 ${active ? 'bg-brand-500/10 text-brand-400' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                            >
                                {active && <span className="absolute left-0 w-1 h-5 bg-brand-500 rounded-r-full" />}
                                <item.icon className={`h-5 w-5 transition-colors ${active ? 'text-brand-400' : 'text-gray-400 group-hover:text-gray-300'}`} />
                                <span className="hidden md:inline font-bold text-sm tracking-tight">{item.label}</span>
                            </a>
                        );
                    }

                    const expanded = openGroups[item.id] || false;

                    return (
                        <div key={item.id} className="space-y-1">
                            <button
                                type="button"
                                onClick={() => handleToggleGroup(item.id)}
                                className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all duration-200 ${active ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                            >
                                {active && !expanded && <span className="absolute left-0 w-1 h-5 bg-brand-500 rounded-r-full" />}
                                <item.icon className={`h-5 w-5 transition-colors ${active ? 'text-brand-400' : 'text-gray-400 group-hover:text-gray-300'}`} />
                                <span className="hidden md:inline font-bold text-sm flex-1 tracking-tight">{item.label}</span>
                                <span className="ml-auto md:inline-flex hidden">
                                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                                </span>
                            </button>
                            {expanded && (
                                <div className="pl-11 mt-1 space-y-1">
                                    {item.children.map(child => {
                                        const childActive = currentView === child.id;
                                        return (
                                            <a
                                                key={child.id}
                                                href="#"
                                                onClick={(e) => { e.preventDefault(); setView(child.id); }}
                                                className={`group relative flex items-center gap-3 rounded-xl px-4 py-2 text-sm transition-all duration-200 ${childActive ? 'text-brand-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                {childActive && <span className="absolute left-[-28px] w-1.5 h-1.5 bg-brand-500 rounded-full" />}
                                                <span className="hidden md:inline tracking-tight">{child.label}</span>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
};

export default Sidebar;