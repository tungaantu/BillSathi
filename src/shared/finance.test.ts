import { expect, it } from 'vitest';
import { emiSplit, transferEntries, runningStatement, validateChequeAction } from './finance';
import { formatDate, parseDate } from './dates';
it('formats stored ISO dates in Indian formats and validates dates without timezone shifts', () => {
  expect(formatDate('2026-11-10')).toBe('10/11/2026');
  expect(formatDate('2026-11-10', { dateFormat: 'DD-MM-YYYY' })).toBe('10-11-2026');
  expect(formatDate('2026-11-10', { dateFormat: 'DD MMM YYYY' })).toBe('10 Nov 2026');
  expect(parseDate('10/11/2026')).toBe('2026-11-10');
  expect(parseDate('10 Nov 2026')).toBe('2026-11-10');
  expect(() => parseDate('31/02/2026')).toThrow();
});
it('uses exact paise for transfers and EMI splits, rejecting excessive principal', () => {
  expect(transferEntries(1, 2, 10001).reduce((n, p) => n + p.direction * p.amount, 0)).toBe(0);
  expect(emiSplit(10000, 1234, 567)).toEqual({
    principal: 1234,
    interest: 567,
    payment: 1801,
    remaining: 8766,
  });
  expect(() => emiSplit(1000, 1001, 0)).toThrow();
});
it('orders running balances by date and disallows acting on completed cheques', () => {
  expect(
    runningStatement(100, [
      { id: 2, date: '2026-11-02', description: '', incoming: 0, outgoing: 75 },
      { id: 1, date: '2026-11-01', description: '', incoming: 50, outgoing: 0 },
    ]).map((r) => r.balance),
  ).toEqual([150, 75]);
  expect(() => validateChequeAction('bounced', 'cleared', 'in', 'bank')).toThrow();
  expect(() => validateChequeAction('open', 'deposited', 'out', 'bank')).toThrow();
});
