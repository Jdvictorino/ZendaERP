import { describe, it, expect } from 'vitest';
import { applyCouponToCart, validateCoupon } from '../src/utils/offers';

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
