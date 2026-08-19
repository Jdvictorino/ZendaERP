/**
 * Utilidades de envíos - Migrado de Firebase a PostgreSQL API
 */
import { shipments as shipmentsApi } from '../api/client.js';

/**
 * Crear un nuevo envío
 */
export const createShipment = async ({
  orderId = null,
  items = [],
  toAddress = {},
  courier = 'local',
  postage = 0,
  expectedDeliveryDate = null,
  sender = {},
  assignedDriverId = null,
  weightKg = null,
  dimensions = null,
  trackingNumber = null,
}) => {
  const payload = {
    orderId,
    items,
    toAddress,
    courier,
    postage,
    expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : null,
    sender,
    assignedDriverId,
    weightKg: weightKg != null ? Number(weightKg) : null,
    dimensions: dimensions || null,
    trackingNumber: trackingNumber || null,
  };

  return await shipmentsApi.create(payload);
};

/**
 * Actualizar estado de un envío
 */
export const updateShipmentStatus = async (shipmentId, status, extras = {}) => {
  return await shipmentsApi.updateStatus(shipmentId, status, extras);
};

/**
 * Actualizar datos de un envío
 */
export const updateShipment = async (shipmentId, patch = {}) => {
  return await shipmentsApi.update(shipmentId, patch);
};

/**
 * Generar URL de confirmación de entrega
 */
export const generateConfirmUrl = (shipmentId, token) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app-domain.example';
  return `${origin}/delivery/confirm?shipmentId=${encodeURIComponent(shipmentId)}&token=${encodeURIComponent(token)}`;
};

/**
 * Construir payload para etiqueta de envío
 */
export const buildLabelPayload = (shipmentData) => {
  const data = shipmentData;
  const id = data.id;
  const orderCode = data.orderId || data.orderNumber || id;
  const confirmUrl = data.token ? generateConfirmUrl(id, data.token) : '';
  
  return {
    id,
    orderNumber: data.orderNumber || null,
    orderId: data.orderId || null,
    code: orderCode,
    to: data.toAddress,
    sender: data.sender,
    items: data.items,
    courier: data.courier,
    postage: data.postage,
    weightKg: data.weightKg || null,
    dimensions: data.dimensions || null,
    expectedDeliveryDate: data.expectedDeliveryDate || null,
    status: data.status,
    trackingNumber: data.trackingNumber || null,
    confirmUrl,
  };
};

/**
 * Obtener un envío por ID
 */
export const getShipment = async (shipmentId) => {
  return await shipmentsApi.get(shipmentId);
};

/**
 * Listar envíos
 */
export const listShipments = async (params = {}) => {
  return await shipmentsApi.list(params);
};

/**
 * Eliminar un envío
 */
export const deleteShipment = async (shipmentId) => {
  return await shipmentsApi.delete(shipmentId);
};

/**
 * Confirmar entrega
 */
export const confirmDelivery = async (shipmentId, code, notes, signatureUrl) => {
  return await shipmentsApi.confirmDelivery(shipmentId, code, notes, signatureUrl);
};

/**
 * Asignar conductor
 */
export const assignDriver = async (shipmentId, driverId) => {
  return await shipmentsApi.assignDriver(shipmentId, driverId);
};

export default {
  createShipment,
  updateShipmentStatus,
  updateShipment,
  generateConfirmUrl,
  buildLabelPayload,
  getShipment,
  listShipments,
  deleteShipment,
  confirmDelivery,
  assignDriver,
};
