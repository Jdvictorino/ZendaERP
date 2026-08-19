/**
 * Componente: NotificationCenter - Panel Mejorado
 * Historial completo, filtros, acciones y preferencias avanzadas
 */

import React, { useState, useEffect } from 'react';
import { notificationService } from '../utils/notificationService.js';
import { notificationChannels } from '../utils/notificationChannels.js';
import { Trash2, Eye, EyeOff, Filter, Settings, X, Check } from 'lucide-react';
import './NotificationCenter.css';

export const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [selectedTab, setSelectedTab] = useState('recent');
  const [preferences, setPreferences] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [readNotifications, setReadNotifications] = useState(new Set());

  useEffect(() => {
    // Cargar notificaciones iniciales
    updateNotifications();
    updatePreferences();
    updateStats();
    loadReadStatus();

    // Actualizar cada segundo
    const interval = setInterval(() => {
      updateNotifications();
      updateStats();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const updateNotifications = () => {
    setNotifications(notificationService.getHistory(null, 100));
  };

  const updatePreferences = () => {
    setPreferences(notificationService.getPreferences());
  };

  const updateStats = () => {
    setStats(notificationService.getStatistics());
  };

  const loadReadStatus = () => {
    const saved = localStorage.getItem('notification_read_status');
    if (saved) {
      setReadNotifications(new Set(JSON.parse(saved)));
    }
  };

  const saveReadStatus = (newRead) => {
    localStorage.setItem('notification_read_status', JSON.stringify([...newRead]));
  };

  const markAsRead = (notifId) => {
    const newRead = new Set(readNotifications);
    newRead.add(notifId);
    setReadNotifications(newRead);
    saveReadStatus(newRead);
  };

  const markAsUnread = (notifId) => {
    const newRead = new Set(readNotifications);
    newRead.delete(notifId);
    setReadNotifications(newRead);
    saveReadStatus(newRead);
  };

  const deleteNotification = (notifId) => {
    // Remover del historial
    notificationService.history = notificationService.history.filter(n => n.id !== notifId);
    updateNotifications();
  };

  const deleteAllRead = () => {
    if (window.confirm('¿Eliminar todas las notificaciones leídas?')) {
      const unreadIds = new Set();
      notifications.forEach(n => {
        if (!readNotifications.has(n.id)) {
          unreadIds.add(n.id);
        }
      });
      setReadNotifications(unreadIds);
      saveReadStatus(unreadIds);
      
      notificationService.history = notificationService.history.filter(
        n => unreadIds.has(n.id)
      );
      updateNotifications();
    }
  };

  const markAllAsRead = () => {
    const allRead = new Set(notifications.map(n => n.id));
    setReadNotifications(allRead);
    saveReadStatus(allRead);
  };

  const handlePreferenceChange = (key, value) => {
    const newPrefs = {
      ...preferences,
      [key]: value,
    };
    setPreferences(newPrefs);
    notificationService.setPreferences(newPrefs);
  };

  const handleClearHistory = () => {
    if (window.confirm('¿Está seguro de limpiar el historial completo?')) {
      notificationService.clearHistory();
      setReadNotifications(new Set());
      localStorage.removeItem('notification_read_status');
      updateNotifications();
      updateStats();
    }
  };

  const handleRequestDesktopPermission = async () => {
    const granted = await notificationChannels.desktop.requestPermission();
    if (granted) {
      handlePreferenceChange('desktop', true);
      await notificationChannels.desktop.send({
        title: 'Zenda ERP',
        message: '¡Notificaciones de escritorio habilitadas!',
      });
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins}m`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays}d`;
  };

  const getTypeColor = (type) => {
    const colors = {
      'ORDER_CREATED': '#8b5cf6',
      'ORDER_BILLED': '#6366f1',
      'INVOICE_ISSUED': '#3b82f6',
      'PAYMENT_RECEIVED': '#10b981',
      'SHIPMENT_DISPATCHED': '#f59e0b',
      'SHIPMENT_DELIVERED': '#06b6d4',
      'SUCCESS': '#10b981',
      'ERROR': '#ef4444',
      'WARNING': '#f59e0b',
      'INFO': '#3b82f6',
    };
    return colors[type] || '#6b7280';
  };

  const getTypeIcon = (type) => {
    const icons = {
      'ORDER_CREATED': '📦',
      'ORDER_BILLED': '📄',
      'INVOICE_ISSUED': '📋',
      'PAYMENT_RECEIVED': '💰',
      'SHIPMENT_DISPATCHED': '🚚',
      'SHIPMENT_DELIVERED': '✅',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARNING': '⚠️',
      'INFO': 'ℹ️',
    };
    return icons[type] || '📌';
  };

  const getTypeLabel = (type) => {
    const labels = {
      'ORDER_CREATED': 'Pedido Creado',
      'ORDER_BILLED': 'Pedido Facturado',
      'INVOICE_ISSUED': 'Factura Emitida',
      'PAYMENT_RECEIVED': 'Pago Recibido',
      'SHIPMENT_DISPATCHED': 'Envío Despachado',
      'SHIPMENT_DELIVERED': 'Entrega Confirmada',
      'SUCCESS': 'Éxito',
      'ERROR': 'Error',
      'WARNING': 'Advertencia',
      'INFO': 'Información',
    };
    return labels[type] || type;
  };

  const filteredNotifications = notifications.filter(notif => {
    const matchesSearch = !searchTerm || 
      notif.data?.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notif.type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || notif.type === filterType;
    return matchesSearch && matchesType;
  });

  const unreadCount = notifications.filter(n => !readNotifications.has(n.id)).length;

  return (
    <div className="notification-center">
      {/* Header */}
      <div className="notif-header">
        <div className="notif-title">
          <span className="bell-icon">🔔</span>
          <div className="title-info">
            <h2>Centro de Notificaciones</h2>
            {unreadCount > 0 && <span className="unread-badge">{unreadCount} nuevas</span>}
          </div>
        </div>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="Configuración"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="notif-settings">
          <div className="settings-section">
            <h3>Preferencias de Notificación</h3>
            
            <label className="preference-item">
              <input
                type="checkbox"
                checked={preferences.toast !== false}
                onChange={(e) => handlePreferenceChange('toast', e.target.checked)}
              />
              <span>🎯 Notificaciones Toast (en la app)</span>
            </label>

            <label className="preference-item">
              <input
                type="checkbox"
                checked={preferences.desktop !== false}
                onChange={(e) => handlePreferenceChange('desktop', e.target.checked)}
                disabled={notificationChannels.desktop.isDenied?.()}
              />
              <span>🖥️ Notificaciones del Dispositivo</span>
              {notificationChannels.desktop.isDenied?.() && (
                <span className="warning-text">Permiso denegado</span>
              )}
              {!notificationChannels.desktop.isGranted?.() && !notificationChannels.desktop.isDenied?.() && (
                <button
                  className="permission-btn"
                  onClick={handleRequestDesktopPermission}
                >
                  Solicitar permiso
                </button>
              )}
            </label>

            <label className="preference-item">
              <input
                type="checkbox"
                checked={preferences.sound !== false}
                onChange={(e) => handlePreferenceChange('sound', e.target.checked)}
              />
              <span>🔊 Sonidos</span>
            </label>

            <div className="settings-buttons">
              <button className="btn-secondary" onClick={markAllAsRead}>
                Marcar todo como leído
              </button>
              <button className="btn-danger" onClick={deleteAllRead}>
                Eliminar leídas
              </button>
              <button className="btn-danger" onClick={handleClearHistory}>
                <Trash2 size={14} /> Limpiar todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="notif-tabs">
        <button
          className={`tab-btn ${selectedTab === 'recent' ? 'active' : ''}`}
          onClick={() => setSelectedTab('recent')}
        >
          Historial ({notifications.length})
        </button>
        <button
          className={`tab-btn ${selectedTab === 'stats' ? 'active' : ''}`}
          onClick={() => setSelectedTab('stats')}
        >
          Estadísticas
        </button>
        <button
          className={`tab-btn ${selectedTab === 'settings' ? 'active' : ''}`}
          onClick={() => setSelectedTab('settings')}
        >
          Configuración
        </button>
      </div>

      {/* Content */}
      <div className="notif-content">
        {selectedTab === 'recent' && (
          <div className="notif-recent-tab">
            {/* Search & Filter */}
            <div className="search-filter-bar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Buscar notificaciones..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todos los tipos</option>
                <option value="ORDER_CREATED">Pedidos Creados</option>
                <option value="ORDER_BILLED">Pedidos Facturados</option>
                <option value="INVOICE_ISSUED">Facturas</option>
                <option value="PAYMENT_RECEIVED">Pagos</option>
                <option value="SHIPMENT_DISPATCHED">Envíos</option>
                <option value="SHIPMENT_DELIVERED">Entregas</option>
              </select>
            </div>

            {/* Notifications List */}
            {filteredNotifications.length === 0 ? (
              <p className="empty-message">No hay notificaciones</p>
            ) : (
              <div className="notif-list">
                {filteredNotifications.map((notif) => {
                  const isRead = readNotifications.has(notif.id);
                  return (
                    <div
                      key={notif.id}
                      className={`notif-item ${isRead ? 'read' : 'unread'}`}
                      style={{ borderLeftColor: getTypeColor(notif.type) }}
                      onMouseEnter={() => setSelectedNotif(notif.id)}
                      onMouseLeave={() => setSelectedNotif(null)}
                    >
                      <div className="notif-icon">
                        {getTypeIcon(notif.type)}
                      </div>
                      <div className="notif-content-main">
                        <div className="notif-header-item">
                          <span className="notif-type" style={{ backgroundColor: getTypeColor(notif.type) }}>
                            {getTypeLabel(notif.type)}
                          </span>
                          <span className="notif-time">{formatTime(notif.timestamp)}</span>
                        </div>
                        <p className="notif-message">{notif.data?.message || 'Sin mensaje'}</p>
                        
                        {/* Detalles adicionales */}
                        {notif.data?.metadata && (
                          <div className="notif-metadata">
                            {Object.entries(notif.data.metadata).slice(0, 2).map(([key, value]) => (
                              <span key={key} className="metadata-item">
                                <strong>{key}:</strong> {String(value).substring(0, 30)}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="notif-channels">
                          {notif.channels_sent?.map((channel) => (
                            <span key={channel} className="channel-badge" title={channel}>
                              {channel === 'toast' ? '🎯' : channel === 'desktop' ? '🖥️' : '📊'}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="notif-actions">
                        <button
                          className="action-btn"
                          onClick={() => isRead ? markAsUnread(notif.id) : markAsRead(notif.id)}
                          title={isRead ? 'Marcar como no leído' : 'Marcar como leído'}
                        >
                          {isRead ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          className="action-btn danger"
                          onClick={() => deleteNotification(notif.id)}
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'stats' && (
          <div className="notif-stats-tab">
            <div className="stats-overview">
              <div className="stat-card">
                <div className="stat-number">{notifications.length}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{unreadCount}</div>
                <div className="stat-label">No leídas</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{notifications.length - unreadCount}</div>
                <div className="stat-label">Leídas</div>
              </div>
            </div>

            <div className="stats-section">
              <h3>Por Tipo de Evento</h3>
              <div className="stats-grid">
                {Object.entries(stats.byType || {}).map(([type, count]) => (
                  <div key={type} className="stat-detail-card">
                    <span className="stat-icon">{getTypeIcon(type)}</span>
                    <span className="stat-type">{getTypeLabel(type)}</span>
                    <span className="stat-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="stats-section">
              <h3>Por Canal</h3>
              <div className="stats-grid">
                {Object.entries(stats.byChannel || {}).map(([channel, count]) => (
                  <div key={channel} className="stat-detail-card">
                    <span className="stat-icon">
                      {channel === 'toast' ? '🎯' : channel === 'desktop' ? '🖥️' : '📊'}
                    </span>
                    <span className="stat-type">
                      {channel === 'toast' ? 'Toast' : channel === 'desktop' ? 'Dispositivo' : channel}
                    </span>
                    <span className="stat-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'settings' && (
          <div className="notif-settings-tab">
            <div className="settings-section-full">
              <h3>Preferencias de Notificación</h3>
              <p className="section-description">Controla cómo y cuándo recibes notificaciones</p>
              
              <label className="preference-item-full">
                <input
                  type="checkbox"
                  checked={preferences.toast !== false}
                  onChange={(e) => handlePreferenceChange('toast', e.target.checked)}
                />
                <div className="preference-content">
                  <span className="preference-title">🎯 Notificaciones en la App</span>
                  <span className="preference-desc">Mensajes temporales que aparecen en la esquina superior</span>
                </div>
              </label>

              <label className="preference-item-full">
                <input
                  type="checkbox"
                  checked={preferences.desktop !== false}
                  onChange={(e) => handlePreferenceChange('desktop', e.target.checked)}
                  disabled={notificationChannels.desktop.isDenied?.()}
                />
                <div className="preference-content">
                  <span className="preference-title">🖥️ Notificaciones del Dispositivo</span>
                  <span className="preference-desc">Alertas del sistema operativo incluso con la app cerrada</span>
                </div>
              </label>

              <label className="preference-item-full">
                <input
                  type="checkbox"
                  checked={preferences.sound !== false}
                  onChange={(e) => handlePreferenceChange('sound', e.target.checked)}
                />
                <div className="preference-content">
                  <span className="preference-title">🔊 Sonidos</span>
                  <span className="preference-desc">Reproducir sonido al recibir notificaciones</span>
                </div>
              </label>

              <div className="settings-section-actions">
                <button className="btn-primary" onClick={markAllAsRead}>
                  <Check size={16} /> Marcar todo como leído
                </button>
                <button className="btn-secondary" onClick={deleteAllRead}>
                  Limpiar notificaciones leídas
                </button>
                <button className="btn-danger" onClick={handleClearHistory}>
                  <Trash2 size={16} /> Eliminar todo el historial
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
