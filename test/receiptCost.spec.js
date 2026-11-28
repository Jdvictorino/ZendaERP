import { allocateCharges as srv } from '../backend/src/services/purchases.js';
import { allocateCharges, previewUnitCosts } from '../src/utils/receiptCost.js';

describe('receiptCost (copia de la app)', () => {
  it('reparte igual que el servidor', () => {
    const casos = [
      [[{ itemId: 'a', quantity: 3, unitCost: 10, factor: 1 }, { itemId: 'b', quantity: 1, unitCost: 33.33, factor: 12 }, { itemId: 'c', quantity: 7, unitCost: 1.07, factor: 1 }], { flete: 100.01, seguro: '5', otros: '' }],
      [[{ itemId: 'a', quantity: 2, unitCost: 0, factor: 1 }, { itemId: 'b', quantity: 1, unitCost: 0, factor: 6 }], { aranceles: 10 }],
      [[{ itemId: 'a', quantity: 1, unitCost: 5, factor: 1 }], {}]
    ];
    for (const [lines, ch] of casos) expect(allocateCharges(lines, ch)).toEqual(srv(lines, ch));
  });
  it('vista previa: caja de 120 (factor 12) con flete 12 -> 11', () => {
    expect(previewUnitCosts([{ itemId: 'a', quantity: 1, unitCost: 120, factor: 12 }], { flete: 12 })).toEqual({ a: 11 });
  });
});
