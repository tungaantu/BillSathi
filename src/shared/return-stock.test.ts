import { expect, it } from 'vitest';
import { returnStock } from './return-stock';
it('reverses historical units and preserves every cost paise across partial returns', () => {
  const source = { qty: -12, value: -100, documentQty: 1 };
  const first = returnStock(source, { qty: 0, value: 0 }, 0.333);
  expect(first).toEqual({ qty: 3.996, value: 33 });
  const second = returnStock(source, first, 0.667);
  expect(second).toEqual({ qty: 8.004, value: 67 });
  expect(() => returnStock(source, first, 1)).toThrow('validation');
});
