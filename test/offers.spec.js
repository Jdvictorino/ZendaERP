import { describe, it, expect } from 'vitest';
import { applyCouponToCart, couponCart, validateCoupon } from '../src/utils/offers';

describe('offers utils', () => {
  it('apply percentage coupon to whole cart', () => {
    const coupon = { active: true, type: 'percentage', value: 10, appliesTo: 'all' };
    const cart = [{ productId: 'p1', categoryId: 'c1', price: 100, quantity: 2 }];
    const res = applyCouponToCart(coupon, cart);
    expect(res.valid).toBe(true);
    expect(res.discount).toBeCloseTo(20);
  });

  it('apply fixed coupon to product subset', () => {
    const coupon = { active: true, type: 'fixed', value: 15, appliesTo: 'all' };
    const cart = [
      { productId: 'p1', categoryId: 'c1', price: 50, quantity: 1 },
      { productId: 'p2', categoryId: 'c2', price: 30, quantity: 2 }
    ];
    const res = applyCouponToCart(coupon, cart);
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(15);
  });

  it('validate expired coupon', () => {
    const coupon = { active: true, startAt: null, endAt: new Date(Date.now() - 1000).toISOString(), timesUsed: 0 };
    const res = validateCoupon(coupon, []);
    expect(res.valid).toBe(false);
  });
});

describe('couponCart: el cupón se calcula sobre el precio con ITBIS', () => {
  const coupon = { active: true, type: 'percentage', value: 10, appliesTo: 'all' };
  it('factura nueva (precio sin ITBIS): 10% sobre 100 + 18% da 11.80, como antes', () => {
    const cart = couponCart({ pricesIncludeTax: false, items: [{ id: 'l1', productId: 'p1', unitPrice: 100, taxRate: 18, quantity: 1 }] });
    expect(cart[0].price).toBeCloseTo(118, 2);
    expect(applyCouponToCart(coupon, cart).discount).toBe(11.8);
  });
  it('factura vieja (precio con ITBIS): usa el precio guardado', () => {
    const cart = couponCart({ pricesIncludeTax: true, items: [{ id: 'l1', productId: 'p1', unitPrice: 118, taxRate: 18, quantity: 1 }] });
    expect(applyCouponToCart(coupon, cart).discount).toBe(11.8);
  });
});
