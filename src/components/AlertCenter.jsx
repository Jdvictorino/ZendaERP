import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, Package, AlertTriangle, Info, Trash2, X, Filter, BellOff, Users, Truck, Clock, ExternalLink } from 'lucide-react';
import { alerts as alertsApi } from '../api/client.js';

// Iconos por tipo de alerta
const ALERT_ICONS = {
  new_order: Package,
  low_stock: AlertTriangle,
  new_customer: Users,
  new_supplier: Truck,
  overdue_invoice: Clock,
  info: Info,
  default: Bell
};

// Colores por tipo de alerta
const ALERT_COLORS = {
  new_order: 'bg-blue-100 dark:bg-blue-900/40',
  low_stock: 'bg-amber-100 dark:bg-amber-900/40',
  new_customer: 'bg-success-100 dark:bg-success-900/40',
  new_supplier: 'bg-violet-100 dark:bg-violet-900/40',
  overdue_invoice: 'bg-red-100 dark:bg-red-900/40',
  info: 'bg-gray-100 dark:bg-gray-800',
  default: 'bg-gray-100 dark:bg-gray-800'
};

const ICON_COLORS = {
  new_order: 'text-blue-600 dark:text-blue-400',
  low_stock: 'text-amber-600 dark:text-amber-400',
  new_customer: 'text-success-600 dark:text-success-400',
  new_supplier: 'text-violet-600 dark:text-violet-400',
  overdue_invoice: 'text-red-600 dark:text-red-400',
  info: 'text-gray-600 dark:text-gray-400',
  default: 'text-gray-600 dark:text-gray-400'
};

const ALERT_TYPE_LABELS = {
  new_order: 'Pedido',
  low_stock: 'Stock bajo',
  new_customer: 'Nuevo cliente',
  new_supplier: 'Nuevo proveedor',
  overdue_invoice: 'Factura vencida',
  info: 'Info',
  default: 'Alerta'
};

// Mapeo de tipo de alerta → vista de la app
const ALERT_VIEW_MAP = {
  new_order: 'invoices',
  low_stock: 'products',
  new_customer: 'customers',
  new_supplier: 'suppliers',
  overdue_invoice: 'finance-accounts-receivable',
};

const PANEL_WIDTH = 380;

export function AlertCenter({ userRole, onNavigate }) {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'unread'

  // Solo mostrar para admin y manager
  const canViewAlerts = ['admin', 'manager'].includes(userRole);

  const fetchAlerts = useCallback(async () => {
    if (!canViewAlerts) return;
    
    try {
      setLoading(true);
      const response = await alertsApi.list({ unreadOnly: 'false', limit: 50 });
      setAlerts(response.data || []);
      setUnreadCount(response.unreadCount || 0);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [canViewAlerts]);

  // Fetch inicial y polling cada 30 segundos
  useEffect(() => {
    if (!canViewAlerts) return;
    
    fetchAlerts();
    
    const interval = setInterval(fetchAlerts, 30000);
    
    return () => clearInterval(interval);
  }, [fetchAlerts, canViewAlerts]);

  // Cerrar con Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Ajustar el contenido principal cuando el panel está abierto
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      if (isOpen) {
        root.style.marginRight = `${PANEL_WIDTH}px`;
        root.style.transition = 'margin-right 0.3s ease-out';
      } else {
        root.style.marginRight = '0px';
      }
    }
    return () => {
      if (root) {
        root.style.marginRight = '0px';
      }
    };
  }, [isOpen]);

  const handleMarkAsRead = async (alertId, e) => {
    e?.stopPropagation();
    try {
      await alertsApi.markAsRead(alertId);
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, isRead: true, readAt: new Date().toISOString() } : a
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await alertsApi.markAllAsRead();
      setAlerts(prev => prev.map(a => ({ ...a, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
    }
  };

  const handleDelete = async (alertId, e) => {
    e?.stopPropagation();
    try {
      await alertsApi.delete(alertId);
      const deletedAlert = alerts.find(a => a.id === alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      if (deletedAlert && !deletedAlert.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  /**
   * Al hacer click en una alerta navegable:
   * 1. Marcamos como leída
   * 2. Cerramos el panel
   * 3. Navegamos a la vista correcta
   * 4. Emitimos CustomEvent para que la vista abra el modal del registro específico
   */
  const handleAlertClick = async (alert) => {
    const targetView = ALERT_VIEW_MAP[alert.type];
    if (!targetView) return; // tipos sin navegación (info, etc.) no hacen nada

    // Marcar como leída si no lo está
    if (!alert.isRead) {
      try {
        await alertsApi.markAsRead(alert.id);
        setAlerts(prev => prev.map(a =>
          a.id === alert.id ? { ...a, isRead: true, readAt: new Date().toISOString() } : a
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Error marking alert as read on click:', err);
      }
    }

    // Cerrar panel
    setIsOpen(false);

    // Navegar a la vista
    if (onNavigate) {
      onNavigate(targetView);
    } else if (typeof window.setAppView === 'function') {
      window.setAppView(targetView);
    }

    // Emitir CustomEvent para que la vista abra el modal del registro específico
    // Lo disparamos con un pequeño delay para dar tiempo al render de la vista
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-alert-entity', { detail: alert }));
    }, 350);
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const alertDate = new Date(date);
    const diffMs = now - alertDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return alertDate.toLocaleDateString('es-DO');
  };

  // Filtrar alertas
  const filteredAlerts = filter === 'unread' 
    ? alerts.filter(a => !a.isRead)
    : alerts;

  // Agrupar alertas por fecha
  const groupAlertsByDate = (alertsList) => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    alertsList.forEach(alert => {
      const alertDate = new Date(alert.createdAt);
      alertDate.setHours(0, 0, 0, 0);
      
      let label;
      if (alertDate.getTime() === today.getTime()) {
        label = 'Hoy';
      } else if (alertDate.getTime() === yesterday.getTime()) {
        label = 'Ayer';
      } else {
        label = alertDate.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(alert);
    });

    return groups;
  };

  const groupedAlerts = groupAlertsByDate(filteredAlerts);

  // No renderizar nada si no tiene permisos
  if (!canViewAlerts) {
    return null;
  }

  // Panel lateral usando Portal para renderizar fuera del Header
  const notificationPanel = (
    <div
      // cerrado queda fuera de pantalla: inert evita que el Tab y los lectores de pantalla entren en él
      inert={!isOpen}
      aria-hidden={!isOpen}
      className={`fixed top-0 right-0 h-full glass border-l border-gray-200/50 dark:border-gray-800/50 shadow-2xl z-[100] transform transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width: `${PANEL_WIDTH}px`, maxWidth: '100vw' }}
    >
      {/* Header del panel */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/50 dark:border-gray-800/50 pt-safe">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-gray-400" />
          <h2 className="text-lg font-bold text-ink dark:text-white tracking-tight">
            Notificaciones
          </h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
            className={`p-2 rounded-xl transition-all active:scale-90 ${
              filter === 'unread' 
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm' 
                : 'hover:bg-surface-muted dark:hover:bg-gray-800 text-ink-muted'
            }`}
            title={filter === 'all' ? 'Solo no leídas' : 'Mostrar todas'}
          >
            <Filter size={16} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl hover:bg-surface-muted dark:hover:bg-gray-800 text-ink-muted transition-all active:scale-90"
            title="Cerrar panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Barra de acciones */}
      {unreadCount > 0 && (
        <div className="px-6 py-3 border-b border-gray-100/50 dark:border-gray-800/50 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
          <span className="text-xs font-medium text-ink-muted dark:text-gray-400">
            {filter === 'unread' ? `${filteredAlerts.length} sin leer` : `${alerts.length} total`}
          </span>
          <button
            onClick={handleMarkAllAsRead}
            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-bold flex items-center gap-1 transition-colors"
          >
            <CheckCheck size={14} />
            Marcar todas como leídas
          </button>
        </div>
      )}

      {/* Lista de notificaciones */}
      <div className="overflow-y-auto custom-scrollbar" style={{ height: unreadCount > 0 ? 'calc(100% - 110px)' : 'calc(100% - 70px)' }}>
        {loading && alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mb-3"></div>
            <p className="text-xs font-bold uppercase tracking-widest">Cargando...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-10 text-center">
            <div className="w-20 h-20 mb-6 rounded-3xl bg-surface-muted dark:bg-gray-800/40 flex items-center justify-center shadow-inner">
              <BellOff size={32} className="text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-ink dark:text-white mb-2 tracking-tight">
              ¡Ya está al día!
            </h3>
            <p className="text-sm text-ink-muted dark:text-gray-400 leading-relaxed">
              {filter === 'unread' 
                ? 'No tiene notificaciones sin leer en este momento.' 
                : 'No hemos encontrado notificaciones para mostrar.'}
            </p>
          </div>
        ) : (
          <div className="pb-20">
            {Object.entries(groupedAlerts).map(([dateLabel, dateAlerts]) => (
              <div key={dateLabel}>
                {/* Separador de fecha */}
                <div className="sticky top-0 glass px-6 py-2 border-b border-gray-100/50 dark:border-gray-800/50 z-10">
                  <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                    {dateLabel}
                  </span>
                </div>

                {/* Alertas del día */}
                <div className="px-3 py-2 space-y-1">
                  {dateAlerts.map((alert) => {
                    const Icon = ALERT_ICONS[alert.type] || ALERT_ICONS.default;
                    const bgColor = ALERT_COLORS[alert.type] || ALERT_COLORS.default;
                    const iconColor = ICON_COLORS[alert.type] || ICON_COLORS.default;
                    const typeLabel = ALERT_TYPE_LABELS[alert.type] || ALERT_TYPE_LABELS.default;
                    const isNavigable = !!ALERT_VIEW_MAP[alert.type];

                    return (
                      <div
                        key={alert.id}
                        className={`group p-4 rounded-2xl transition-all active:scale-[0.98] ${
                          !alert.isRead ? 'bg-brand-50/50 dark:bg-brand-900/10 shadow-sm border border-brand-100/30 dark:border-brand-500/20' : 'hover:bg-surface-muted dark:hover:bg-gray-800/30'
                        } ${isNavigable ? 'cursor-pointer' : ''}`}
                        onClick={isNavigable ? () => handleAlertClick(alert) : undefined}
                      >
                        <div className="flex gap-4">
                          {/* Icono */}
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center shadow-sm`}>
                            <Icon size={18} className={iconColor} />
                          </div>

                          {/* Contenido */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${bgColor} ${iconColor}`}>
                                  {typeLabel}
                                </span>
                                {!alert.isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-sm shadow-brand-500/50" />
                                )}
                              </div>
                              <span className="text-xs font-bold text-gray-400 whitespace-nowrap uppercase tracking-tight">
                                {formatTimeAgo(alert.createdAt)}
                              </span>
                            </div>
                            
                            <h4 className={`text-sm font-bold leading-snug tracking-tight ${
                              !alert.isRead 
                                ? 'text-ink dark:text-white' 
                                : 'text-ink-soft dark:text-gray-400'
                            }`}>
                              {alert.title}
                            </h4>
                            
                            {alert.message && (
                              <p className="text-xs text-ink-muted dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                {alert.message}
                              </p>
                            )}

                            {/* Link "Ver detalles" para alertas navegables */}
                            {isNavigable && (
                              <div className="mt-2 flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 transition-opacity">
                                <ExternalLink size={10} />
                                VER DETALLES
                              </div>
                            )}

                            {/* Acciones en hover */}
                            <div className="flex items-center gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!alert.isRead && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMarkAsRead(alert.id, e); }}
                                  className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-bold flex items-center gap-1 uppercase tracking-wider"
                                >
                                  <Check size={12} />
                                  Leída
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(alert.id, e); }}
                                className="text-xs text-gray-400 hover:text-red-500 font-bold flex items-center gap-1 transition-colors uppercase tracking-wider"
                              >
                                <Trash2 size={12} />
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Botón de campana */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-all active:scale-90 focus:outline-none ${
          isOpen 
            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-inner' 
            : 'hover:bg-surface-muted dark:hover:bg-gray-800 text-ink-soft dark:text-gray-300'
        }`}
        aria-label="Centro de notificaciones"
        title={isOpen ? 'Cerrar notificaciones' : 'Ver notificaciones'}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 flex items-center justify-center bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900 animate-pulse" />
        )}
      </button>

      {/* Panel renderizado via Portal fuera del Header */}
      {createPortal(notificationPanel, document.body)}
    </>
  );
}

export default AlertCenter;
