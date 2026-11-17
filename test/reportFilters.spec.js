import { describe, it, expect } from 'vitest';
import { filterByDateRange } from '../src/utils/reportFilters.js';

describe('filterByDateRange', () => {
  it('toma las fechas YYYY-MM-DD como días locales (incluye el último día del rango)', () => {
    const items = [
      { date: new Date(2026, 9, 31, 22, 0).toISOString() },
      { date: new Date(2026, 10, 1, 9, 0).toISOString() },
      { date: new Date(2026, 10, 30, 21, 30).toISOString() },
      { date: new Date(2026, 11, 1, 0, 30).toISOString() },
    ];
    const r = filterByDateRange(items, 'date', '2026-11-01', '2026-11-30');
    expect(r).toEqual([items[1], items[2]]);
  });
});
