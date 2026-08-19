/**
 * Utilidades de ofertas/cupones - Migrado a PostgreSQL API
 * Las funciones principales están en api/client.js -> offers
 */
import { offers as offersApi } from '../api/client.js';

/**
 * Crear un cupón
 */
export async function createCoupon(data) {
  return await offersApi.create(data);
}

/**
 * Actualizar un cupón
 */
export async function updateCoupon(id, data) {
  return await offersApi.update(id, data);
}

/**
 * Eliminar un cupón
 */
export async function deleteCoupon(id) {
  return await offersApi.delete(id);
}

/**
 * Obtener cupón por código
 */
export async function getCouponByCode(code) {
  const coupons = await offersApi.list({ code: code.toUpperCase() });
  return coupons.find(c => c.code === code.toUpperCase()) || null;
}

/**
 * Validar si un cupón es aplicable
 */
export function validateCoupon(coupon, cart = [], customer = null) {
  if (!coupon) return { valid: false, reason: 'Cupón no encontrado' };
  if (!coupon.active) return { valid: false, reason: 'El cupón no está activo' };
  
  const now = new Date();
  if (coupon.startAt && new Date(coupon.startAt) > now) {
    return { valid: false, reason: 'El cupón aún no está vigente' };
  }
  if (coupon.endAt && new Date(coupon.endAt) < now) {
    return { valid: false, reason: 'El cupón ha expirado' };
  }
  
  if (coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit) {
    return { valid: false, reason: 'El cupón ha alcanzado su límite de uso' };
  }

  return { valid: true };
}

/**
 * Aplicar cupón al carrito
 */
export function applyCouponToCart(coupon, cart = []) {
  const validation = validateCoupon(coupon, cart);
  if (!validation.valid) {
    return { discount: 0, ...validation };
  }

  let discount = 0;
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (coupon.type === 'percentage') {
    discount = subtotal * (coupon.value / 100);
  } else if (coupon.type === 'fixed') {
    discount = Math.min(coupon.value, subtotal);
  }

  return {
    valid: true,
    discount: Math.round(discount * 100) / 100,
    couponId: coupon.id,
    couponCode: coupon.code
  };
}

/**
 * Redimir un cupón en una transacción (incrementar timesUsed)
 */
export async function redeemCouponTransaction(couponId) {
  if (!couponId) return;
  try {
    // La API incrementará el contador de uso
    await offersApi.redeem(couponId);
  } catch (e) {
    console.warn('Error redeeming coupon:', e);
  }
}

export default {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponByCode,
  validateCoupon,
  applyCouponToCart,
  redeemCouponTransaction
};
