import { expect, it } from 'vitest';
import { calculate, gstOn } from './calc';

it('does shop arithmetic with the usual precedence and brackets', () => {
  expect(calculate('12 + 3 × 4')).toBe(24);
  expect(calculate('(12 + 3) × 4')).toBe(60);
  expect(calculate('100 ÷ 8')).toBe(12.5);
  expect(calculate('0.1 + 0.2')).toBe(0.3);
  expect(calculate('-5 + 2')).toBe(-3);
  expect(calculate('1,250 × 2')).toBe(2500);
});
it('understands percentages like a counter calculator', () => {
  expect(calculate('200 + 18%')).toBe(236);
  expect(calculate('500 - 10%')).toBe(450);
  expect(calculate('50%')).toBe(0.5);
  expect(calculate('200 × 18%')).toBe(36);
});
it('refuses anything that is not plain arithmetic', () => {
  expect(calculate('')).toBeNull();
  expect(calculate('2 +')).toBeNull();
  expect(calculate('(2 + 3')).toBeNull();
  expect(calculate('5 / 0')).toBeNull();
  expect(calculate('alert(1)')).toBeNull();
  expect(calculate('2 ** 3')).toBeNull();
});
it('adds or removes GST', () => {
  expect(gstOn(100, 18, false)).toEqual({ base: 100, tax: 18, total: 118 });
  expect(gstOn(118, 18, true)).toEqual({ base: 100, tax: 18, total: 118 });
  expect(gstOn(105, 5, true)).toEqual({ base: 100, tax: 5, total: 105 });
});
