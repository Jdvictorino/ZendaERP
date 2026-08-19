/**
 * Servicio Central de Notificaciones
 * Gestiona todos los eventos y canales de notificación
 * Soporta: Toast, Desktop Notifications, Base de Datos
 */

class NotificationService {
  constructor() {
    this.handlers = {};
    this.history = [];
    this.maxHistorySize = 1000;
    this.channels = [];
    this.userPreferences = {
      toast: true,
      desktop: false,
      sound: true,
      email: false,
    };
  }

  /**
   * Registra un handler para un tipo de evento
   * @param {string} eventType - Tipo de evento (e.g., 'ORDER_CREATED', 'PAYMENT_RECEIVED')
   * @param {Function} handler - Función que se ejecuta cuando ocurre el evento
   */
  on(eventType, handler) {
    if (!this.handlers[eventType]) {
      this.handlers[eventType] = [];
    }
    this.handlers[eventType].push(handler);
  }

  /**
   * Desregistra un handler
   */
  off(eventType, handler) {
    if (this.handlers[eventType]) {
      this.handlers[eventType] = this.handlers[eventType].filter(h => h !== handler);
    }
  }

  /**
   * Registra un canal de notificación
   * @param {string} channelName - Nombre del canal
   * @param {Object} channelHandler - Objeto con método send()
   */
  registerChannel(channelName, channelHandler) {
    this.channels.push({
      name: channelName,
      handler: channelHandler,
    });
  }

  /**
   * Emite una notificación a través de canales configurados
   * @param {string} eventType - Tipo de evento
   * @param {Object} data - Datos de la notificación
   * @param {Array} activeChannels - Canales activos para esta notificación
   */
  async notify(eventType, data, activeChannels = ['toast']) {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      channels: activeChannels,
      status: 'sent',
    };

    try {
      // Ejecutar handlers globales ("*") primero
      if (this.handlers['*']) {
        for (const handler of this.handlers['*']) {
          try {
            await handler(data, notification);
          } catch (error) {
            console.error(`Error en handler global:`, error);
          }
        }
      }

      // Ejecutar handlers registrados del evento específico
      if (this.handlers[eventType]) {
        for (const handler of this.handlers[eventType]) {
          try {
            await handler(data, notification);
          } catch (error) {
            console.error(`Error en handler para ${eventType}:`, error);
          }
        }
      }

      // Enviar a través de canales configurados
      for (const channelName of activeChannels) {
        const channel = this.channels.find(c => c.name === channelName);
        if (channel && this.userPreferences[channelName] !== false) {
          try {
            await channel.handler.send(data, notification);
            notification.channels_sent = [...(notification.channels_sent || []), channelName];
          } catch (error) {
            console.error(`Error enviando a canal ${channelName}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error en notificación:', error);
      notification.status = 'error';
      notification.error = error.message;
    }

    // Guardar en historial
    this.addToHistory(notification);

    return notification;
  }

  /**
   * Notificación rápida de éxito
   */
  async success(message, options = {}) {
    return this.notify('SUCCESS', {
      message,
      type: 'success',
      duration: 3000,
      ...options,
    }, options.channels || ['toast']);
  }

  /**
   * Notificación rápida de error
   */
  async error(message, options = {}) {
    return this.notify('ERROR', {
      message,
      type: 'error',
      duration: 4000,
      ...options,
    }, options.channels || ['toast']);
  }

  /**
   * Notificación rápida de información
   */
  async info(message, options = {}) {
    return this.notify('INFO', {
      message,
      type: 'info',
      duration: 3000,
      ...options,
    }, options.channels || ['toast']);
  }

  /**
   * Notificación rápida de advertencia
   */
  async warning(message, options = {}) {
    return this.notify('WARNING', {
      message,
      type: 'warning',
      duration: 3000,
      ...options,
    }, options.channels || ['toast']);
  }

  /**
   * Mantiene historial de últimas notificaciones
   */
  addToHistory(notification) {
    this.history.push(notification);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Guardar en localStorage para persistencia
    try {
      const recentHistory = this.history.slice(-50);
      localStorage.setItem('notificationHistory', JSON.stringify(recentHistory));
    } catch (error) {
      console.warn('No se pudo guardar historial en localStorage:', error);
    }
  }

  /**
   * Obtiene historial de notificaciones
   */
  getHistory(eventType = null, limit = 50) {
    let filtered = this.history;
    if (eventType) {
      filtered = filtered.filter(n => n.type === eventType);
    }
    return filtered.slice(-limit);
  }

  /**
   * Carga historial desde localStorage
   */
  loadHistory() {
    try {
      const stored = localStorage.getItem('notificationHistory');
      if (stored) {
        this.history = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('No se pudo cargar historial:', error);
    }
  }

  /**
   * Limpia historial
   */
  clearHistory() {
    this.history = [];
    localStorage.removeItem('notificationHistory');
  }

  /**
   * Actualiza preferencias del usuario
   */
  setPreferences(preferences) {
    this.userPreferences = {
      ...this.userPreferences,
      ...preferences,
    };
    localStorage.setItem('notificationPreferences', JSON.stringify(this.userPreferences));
  }

  /**
   * Carga preferencias del usuario
   */
  loadPreferences() {
    try {
      const stored = localStorage.getItem('notificationPreferences');
      if (stored) {
        this.userPreferences = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('No se pudo cargar preferencias:', error);
    }
  }

  /**
   * Obtiene preferencias del usuario
   */
  getPreferences() {
    return { ...this.userPreferences };
  }

  /**
   * Obtiene estadísticas de notificaciones
   */
  getStatistics() {
    const stats = {
      total: this.history.length,
      byType: {},
      byChannel: {},
      recentNotifications: this.history.slice(-10),
    };

    this.history.forEach(notif => {
      stats.byType[notif.type] = (stats.byType[notif.type] || 0) + 1;
      notif.channels.forEach(channel => {
        stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;
      });
    });

    return stats;
  }
}

// Instancia singleton
export const notificationService = new NotificationService();

// Cargar preferencias e historial al inicializar
notificationService.loadPreferences();
notificationService.loadHistory();

export default notificationService;
