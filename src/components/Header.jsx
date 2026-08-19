import React from 'react';
import { Building, LogOut, ShieldCheck, Sun, Moon } from 'lucide-react';
import Button from './ui/Button.jsx';
import { toggleTheme } from '../utils/theme.js';
import { AlertCenter } from './AlertCenter.jsx';
import './Header.css';

// --- CAMBIO 1: Recibe 'onProfileUpdate' como prop ---
const Header = ({ user, isMasterUser, companyProfile, onLogout, onProfileUpdate, currentUserProfile, onEmployeeProfileUpdate, onNavigate, currentView, onEditCurrentUser }) => {

    return (
        <>
            <header data-tour="header" className="sticky top-0 z-40 h-16 glass border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between px-4 md:px-8 shadow-sm pt-safe">
                <div className="flex items-center gap-3">
                    <button 
                        data-tour="header-logo" 
                        onClick={() => onNavigate?.('company-profile')}
                        className="flex items-center gap-3 text-lg font-bold"
                        title={isMasterUser ? 'Configuración de empresa' : 'Ver información de empresa'}
                    >
                        {companyProfile.logo ? (
                            <div className="h-9 w-9 rounded-xl overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-brand-500 transition-all cursor-pointer shadow-sm">
                                <img src={companyProfile.logo} alt="Logo" className="w-full h-full object-contain"/>
                            </div>
                        ) : (
                            <div className="h-9 w-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center hover:ring-2 hover:ring-brand-500 transition-all cursor-pointer shadow-sm">
                                <Building size={20} className="text-brand-600 dark:text-brand-400" />
                            </div>
                        )}
                        <span className="hidden sm:inline text-gray-900 dark:text-gray-100 font-bold tracking-tight">
                            {companyProfile.name || 'Mi Empresa'}
                        </span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {/* Avatar + user info */}
                    <div className="flex items-center gap-3">
                        {/* Avatar */}
                        {(() => {
                            const photoUrl = currentUserProfile?.photoURL || null;
                            const displayName = currentUserProfile ? `${currentUserProfile.firstName || ''} ${currentUserProfile.lastName || ''}`.trim() : (user?.email || '');
                            const rawCargo = currentUserProfile?.cargo || (isMasterUser ? 'Administrador' : 'Usuario');
                            const roleLabel = rawCargo ? `${rawCargo.charAt(0).toUpperCase()}${rawCargo.slice(1)}` : (isMasterUser ? 'Administrador' : 'Usuario');
                            const initials = (currentUserProfile?.firstName ? currentUserProfile.firstName[0] : '') + (currentUserProfile?.lastName ? currentUserProfile.lastName[0] : '');
                            return (
                                <div className="flex items-center gap-2 md:gap-3">
                                    <button 
                                        onClick={() => {
                                            onEditCurrentUser?.();
                                        }} 
                                        className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:ring-2 hover:ring-brand-500 transition-all cursor-pointer shadow-inner"
                                        title="Editar mi perfil"
                                    >
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{initials || (user?.email ? (user.email[0] || 'U').toUpperCase() : 'U')}</span>
                                        )}
                                    </button>

                                    <div className="hidden sm:flex flex-col text-sm text-gray-600 dark:text-gray-300">
                                        <span className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{displayName || user?.email}</span>
                                        <span className="text-xs">
                                            <span className={`${isMasterUser ? 'inline-flex items-center gap-1 bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider' : 'inline-flex items-center gap-1 bg-brand-100/80 text-brand-800 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider'}`}>
                                                <ShieldCheck size={10} />
                                                {roleLabel}
                                            </span>
                                        </span>
                                    </div>
                                    {/* Mobile: show badge under avatar when screen is small */}
                                    <div className="sm:hidden flex items-center">
                                        <span className={`${isMasterUser ? 'bg-emerald-500 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 absolute top-2 right-2' : 'bg-brand-500 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 absolute top-2 right-2'}`}></span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Separador visual */}
                    <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                    
                    <div className="flex items-center gap-1">
                        {/* Botón de tema */}
                        <button 
                            onClick={() => toggleTheme()} 
                            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
                            aria-label="Cambiar tema"
                        >
                            <Sun size={18} className="hidden dark:inline" />
                            <Moon size={18} className="inline dark:hidden" />
                        </button>
                        
                        {/* Alert Center */}
                        <AlertCenter 
                          userRole={currentUserProfile?.role || (isMasterUser ? 'admin' : 'cashier')} 
                          onNavigate={onNavigate}
                        />
                        
                        {/* Botón cerrar sesión */}
                        <button 
                            onClick={onLogout} 
                            className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            aria-label="Cerrar sesión"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </header>
        </>
    );
};

export default Header;