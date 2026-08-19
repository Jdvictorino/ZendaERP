/**
 * Hook: useNotification
 * Proporciona una interfaz fácil de usar para notificaciones
 */

import { useCallback, useEffect } from 'react';
import { notificationService } from '../utils/notificationService.js';
import { notificationChannels } from '../utils/notificationChannels.js';

/**
 * Hook para usar el sistema de notificaciones
 * @param {string} componentName - Nombre del componente (para logging)
 * @returns {Object} Métodos para enviar notificaciones
 */
export const useNotification = (componentName = 'Component') => {
  // Registrar canales en el servicio (solo una vez)
  useEffect(() => {
    if (notificationService.channels.length === 0) {
      notificationService.registerChannel('toast', notificationChannels.toast);
      notificationService.registerChannel('desktop', notificationChannels.desktop);
      notificationService.registerChannel('database', notificationChannels.database);
      notificationService.registerChannel('audit', notificationChannels.audit);
    }
  }, []);

  /**
   * Notificación de éxito
   */
  const notifySuccess = useCallback((message, options = {}) => {
    const channels = options.channels || ['toast', 'audit'];
    return notificationService.success(message, {
      ...options,
      channels,
      componentName,
    });
  }, [componentName]);

  /**
   * Notificación de error
   */
  const notifyError = useCallback((message, options = {}) => {
    const channels = options.channels || ['toast', 'audit'];
    return notificationService.error(message, {
      ...options,
      channels,
      componentName,
    });
  }, [componentName]);

  /**
   * Notificación de información
   */
  const notifyInfo = useCallback((message, options = {}) => {
    const channels = options.channels || ['toast', 'audit'];
    return notificationService.info(message, {
      ...options,
      channels,
      componentName,
    });
  }, [componentName]);

  /**
   * Notificación de advertencia
   */
  const notifyWarning = useCallback((message, options = {}) => {
    const channels = options.channels || ['toast', 'audit'];
    return notificationService.warning(message, {
      ...options,
      channels,
      componentName,
    });
  }, [componentName]);

  /**
   * Evento personalizado
   */
  const notify = useCallback((eventType, data, channels = ['toast', 'audit']) => {
    return notificationService.notify(eventType, {
      ...data,
      componentName,
    }, channels);
  }, [componentName]);

  /**
   * Obtener historial de notificaciones
   */
  const getHistory = useCallback((eventType = null, limit = 50) => {
    return notificationService.getHistory(eventType, limit);
  }, []);

  /**
   * Registrar handler para evento específico
   */
  const onEvent = useCallback((eventType, handler) => {
    notificationService.on(eventType, handler);
    
    // Retornar función para desuscribirse
    return () => {
      notificationService.off(eventType, handler);
    };
  }, []);

  return {
    // Métodos rápidos
    success: notifySuccess,
    error: notifyError,
    info: notifyInfo,
    warning: notifyWarning,

    // Métodos avanzados
    notify,
    onEvent,
    getHistory,

    // Servicio completo
    service: notificationService,
  };
};

export default useNotification;
