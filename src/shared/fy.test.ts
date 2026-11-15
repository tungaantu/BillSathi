import { expect, it } from 'vitest';
import { closableYear, fyOf, fyStarting, isLocked, withFyTag } from './fy';

it('finds the Indian financial year of a date', () => {
  expect(fyOf('2026-11-14')).toEqual({
    startYear: 2026,
    start: '2026-04-01',
    end: '2027-03-31',
    label: '2026-27',
  });
  expect(fyOf('2027-03-31').label).toBe('2026-27');
  expect(fyOf('2027-04-01').label).toBe('2027-28');
  expect(fyStarting(2099).label).toBe('2099-00');
});
it('locks only dates up to the closing date', () => {
  expect(isLocked('2026-03-31', '2026-03-31')).toBe(true);
  expect(isLocked('2026-04-01', '2026-03-31')).toBe(false);
  expect(isLocked('2020-01-01', '')).toBe(false);
  expect(isLocked('2020-01-01', undefined)).toBe(false);
});
it('tags number prefixes with the new year so numbering restarts', () => {
  expect(withFyTag('INV-', 2026)).toBe('INV-2627-');
  expect(withFyTag('INV-2627-', 2027)).toBe('INV-2728-');
  expect(withFyTag('BILL/', 2026)).toBe('BILL/2627-');
  expect(withFyTag('', 2026)).toBe('2627-');
  expect(withFyTag('SALE', 2026)).toBe('SALE-2627-');
});
it('offers the last finished year that is still open', () => {
  expect(closableYear('2026-11-14', '')?.label).toBe('2025-26');
  expect(closableYear('2026-11-14', '2026-03-31')).toBeNull();
  expect(closableYear('2027-04-02', '2026-03-31')?.label).toBe('2026-27');
});
