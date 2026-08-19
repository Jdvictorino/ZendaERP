/**
 * Cola offline para operaciones cuando no hay conexión
 * Versión simplificada sin Firebase - usa localStorage
 */

const STORAGE_KEY = 'si_offline_queue_v1';

/**
 * Leer cola del localStorage
 */
const readQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('offlineQueue read failed', e);
    return [];
  }
};

/**
 * Escribir cola al localStorage
 */
const writeQueue = (arr) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('offlineQueue write failed', e);
  }
};

/**
 * Configurar contexto (ya no necesita `db` de Firebase)
 */
export const setOfflineContext = (db, userId) => {
  // No-op para compatibilidad - no necesitamos db con PostgreSQL
  console.log('offlineQueue: context set (PostgreSQL mode)');
};

/**
 * Inicializar cola offline
 */
export const initOfflineQueue = () => {
  // Intentar procesar cola pendiente al iniciar
  if (navigator.onLine) {
    flushOfflineQueue().catch(console.warn);
  }
  
  // Escuchar cuando vuelve la conexión
  window.addEventListener('online', () => {
    flushOfflineQueue().catch(console.warn);
  });
};

/**
 * Encolar una operación
 */
export const enqueueOperation = (op) => {
  const q = readQueue();
  q.push({ ...op, enqueuedAt: Date.now() });
  writeQueue(q);
};

/**
 * Encolar actualización de pago de factura
 */
export const enqueueInvoicePaymentUpdate = ({ invoiceId, paymentBreakdown, newPaidAmount, newPaymentStatus }) => {
  enqueueOperation({
    type: 'updateInvoicePayment',
    payload: { invoiceId, paymentBreakdown, newPaidAmount, newPaymentStatus },
  });
};

/**
 * Procesar cola pendiente
 */
export const flushOfflineQueue = async () => {
  const queue = readQueue();
  if (!queue.length) return 0;

  // Importar dinámicamente para evitar dependencias circulares
  const { invoices } = await import('../api/client.js');

  let processed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      if (item.type === 'updateInvoicePayment') {
        const { invoiceId, paymentBreakdown, newPaidAmount, newPaymentStatus } = item.payload;
        await invoices.update(invoiceId, {
          paymentBreakdown,
          amountPaid: newPaidAmount,
          paymentStatus: newPaymentStatus
        });
        processed++;
      } else {
        // Operación desconocida, mantener en cola
        remaining.push(item);
      }
    } catch (e) {
      console.warn('offlineQueue: operation failed, keeping in queue', e);
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return processed;
};

/**
 * Obtener cantidad de operaciones pendientes
 */
export const getPendingCount = () => {
  return readQueue().length;
};

/**
 * Limpiar cola
 */
export const clearQueue = () => {
  writeQueue([]);
};

export default {
  setOfflineContext,
  initOfflineQueue,
  enqueueOperation,
  enqueueInvoicePaymentUpdate,
  flushOfflineQueue,
  getPendingCount,
  clearQueue
};
