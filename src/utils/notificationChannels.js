/**
 * Canales de Notificación
 * Implementación de diferentes canales: Toast, Desktop, Base de Datos
 */

import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound, playWarningSound } from './soundPlayer.js';

/**
 * CANAL 1: IN-APP TOAST
 * Feedback visual inmediato en la interfaz
 * Usa react-hot-toast
 */
export const toastChannel = {
  name: 'toast',
  
  send: async (data, notification) => {
    const { message, type = 'success', duration = 3000, icon } = data;

    // Reproducir sonidos opcionales
    if (data.sound !== false) {
      if (type === 'success') playSuccessSound();
      else if (type === 'error') playErrorSound();
      else if (type === 'warning') playWarningSound();
    }

    // Mostrar toast según tipo
    switch (type) {
      case 'success':
        toast.success(message, {
          duration,
          position: 'top-right',
          icon: icon || '✅',
          style: {
            background: '#10b981',
            color: '#fff',
          },
        });
        break;

      case 'error':
        toast.error(message, {
          duration,
          position: 'top-right',
          icon: icon || '❌',
          style: {
            background: '#ef4444',
            color: '#fff',
          },
        });
        break;

      case 'warning':
        toast(message, {
          duration,
          position: 'top-right',
          icon: icon || '⚠️',
          style: {
            background: '#f59e0b',
            color: '#fff',
          },
        });
        break;

      case 'info':
        toast(message, {
          duration,
          position: 'top-right',
          icon: icon || 'ℹ️',
          style: {
            background: '#3b82f6',
            color: '#fff',
          },
        });
        break;

      case 'loading':
        toast.loading(message, {
          position: 'top-right',
        });
        break;

      default:
        toast(message, {
          duration,
          position: 'top-right',
        });
    }
  },
};

/**
 * CANAL 2: NOTIFICACIONES DESKTOP/NAVEGADOR
 * Usa Web Notifications API
 * Requiere permisos del usuario
 */
export const desktopChannel = {
  name: 'desktop',

  send: async (data, notification) => {
    const {
      title = 'Zenda ERP',
      message,
      icon = '/logo.png',
      tag = 'invoice-alert',
      badge = '/badge.png',
      requireInteraction = true,
      data: notifData = {},
    } = data;

    // Verificar soporte del navegador
    if (!('Notification' in window)) {
      console.log('Notificaciones de navegador no soportadas');
      return;
    }

    // Solicitar permisos si es necesario
    if (Notification.permission === 'default') {
      try {
        await this.requestPermission();
      } catch (error) {
        console.error('Error solicitando permisos:', error);
        return;
      }
    }

    // Enviar notificación si tenemos permisos
    if (Notification.permission === 'granted') {
      try {
        const options = {
          body: message,
          icon,
          badge,
          tag, // Evita duplicar notificaciones
          requireInteraction,
          data: notifData,
          // Opcionales: actions, image, etc.
        };

        // Crear notificación
        const notif = new Notification(title, options);

        // Manejar clicks en la notificación
        notif.onclick = () => {
          window.focus();
          notif.close();

          // Ejecutar acción personalizada si existe
          if (notifData.action && typeof notifData.action === 'function') {
            notifData.action();
          }
        };

        notif.onclose = () => {
          console.log('Notificación cerrada');
        };

      } catch (error) {
        console.error('Error creando notificación desktop:', error);
      }
    }
  },

  requestPermission: async () => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          const permission = await Notification.requestPermission();
          return permission === 'granted';
        } catch (error) {
          console.error('Error solicitando permiso:', error);
          return false;
        }
      }
      return Notification.permission === 'granted';
    }
    return false;
  },

  isGranted: () => {
    return 'Notification' in window && Notification.permission === 'granted';
  },

  isDenied: () => {
    return 'Notification' in window && Notification.permission === 'denied';
  },
};

/**
 * CANAL 3: BASE DE DATOS (Firestore)
 * Almacena notificaciones en Firebase para historial persistente
 */
export const databaseChannel = {
  name: 'database',

  send: async (data, notification, db = null) => {
    // Este será implementado posteriormente cuando tengamos la config de Firebase
    // Por ahora, usar localStorage como fallback

    try {
      const notifRecord = {
        ...notification,
        data,
        savedAt: new Date().toISOString(),
      };

      // Guardar en localStorage como fallback
      const stored = localStorage.getItem('notifications') || '[]';
      const notifications = JSON.parse(stored);
      notifications.push(notifRecord);

      // Mantener solo las últimas 100 notificaciones
      if (notifications.length > 100) {
        notifications.shift();
      }

      localStorage.setItem('notifications', JSON.stringify(notifications));

      // Si Firebase está disponible, sincronizar
      if (db && notification.userId) {
        // Se implementará después
        console.log('Pendiente: guardar en Firestore');
      }

    } catch (error) {
      console.error('Error guardando en base de datos:', error);
    }
  },
};

/**
 * CANAL 4: AUDITORÍA/LOGGER
 * Registra todas las notificaciones para auditoría
 */
export const auditChannel = {
  name: 'audit',

  send: async (data, notification) => {
    try {
      const auditRecord = {
        timestamp: new Date().toISOString(),
        type: notification.type,
        message: data.message,
        userId: data.userId || 'anonymous',
        level: data.type || 'info',
        details: data,
      };

      // Log en consola
      console.group(`[AUDIT] ${notification.type}`);
      console.log('Timestamp:', auditRecord.timestamp);
      console.log('Message:', data.message);
      console.log('Data:', data);
      console.groupEnd();

      // En producción, enviar a servicio de logging
      if (window.logService) {
        window.logService.log(auditRecord);
      }

    } catch (error) {
      console.error('Error en auditoría:', error);
    }
  },
};

/**
 * Configuración de canales disponibles
 */
export const notificationChannels = {
  toast: toastChannel,
  desktop: desktopChannel,
  database: databaseChannel,
  audit: auditChannel,
};

export default notificationChannels;
