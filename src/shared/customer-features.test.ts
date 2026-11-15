import { expect, it } from 'vitest';
import { blankItem } from './masters';
import { blankDocument } from './sales';
import {
  catchUp,
  customerLine,
  earnedPoints,
  firstOccurrence,
  nextOccurrence,
  redemption,
  renderMessage,
  whatsappLink,
  type Recurrence,
} from './customer-features';
const rule: Recurrence = {
  id: 1,
  sourceId: 1,
  start: '2024-01-31',
  end: '',
  frequency: 'monthly',
  day: 31,
  mode: 'draft',
  next: '2024-01-31',
  paused: false,
  error: '',
};
it('anchors month-end and leap-year schedules without drifting', () => {
  expect(nextOccurrence('2024-01-31', rule)).toBe('2024-02-29');
  expect(nextOccurrence('2024-02-29', rule)).toBe('2024-03-31');
  expect(nextOccurrence('2024-02-29', { frequency: 'yearly', day: 29 })).toBe('2025-02-28');
  expect(nextOccurrence('2025-02-28', { frequency: 'yearly', day: 29 })).toBe('2026-02-28');
  expect(nextOccurrence('2027-02-28', { frequency: 'yearly', day: 29 })).toBe('2028-02-29');
  expect(firstOccurrence({ ...rule, start: '2026-01-20', day: 5 })).toBe('2026-02-05');
  expect(firstOccurrence({ ...rule, start: '2026-11-10', frequency: 'weekly', day: 1 })).toBe(
    '2026-11-15',
  );
});
it('catches up chronologically through the inclusive end date and is bounded', () => {
  expect(catchUp({ ...rule, end: '2024-03-31' }, '2024-12-01')).toEqual({
    dates: ['2024-01-31', '2024-02-29', '2024-03-31'],
    next: '2024-04-30',
  });
  expect(catchUp({ ...rule, paused: true }, '2024-12-01').dates).toEqual([]);
  expect(catchUp({ ...rule, frequency: 'daily' }, '2026-12-01', 3)).toEqual({
    dates: ['2024-01-31', '2024-02-01', '2024-02-02'],
    next: '2024-02-03',
  });
  expect(nextOccurrence('2026-12-28', { frequency: 'weekly', day: 1 })).toBe('2027-01-04');
});
it('uses party rate before wholesale before retail and keeps purchases independent', () => {
  const item = {
    ...blankItem(),
    firmId: 1,
    id: 1,
    qty: 100,
    value: 0,
    salePrice: 10000,
    wholesalePrice: 9000,
    wholesaleQty: 5,
    unitId: 1,
    secondaryUnitId: 2,
    conversion: 10,
    purchasePrice: 6000,
  };
  const doc = { ...blankDocument('sale', '29'), partyId: 3 };
  const rates = [{ partyId: 3, itemId: 1, price: 7500, inclusive: true }];
  expect(customerLine(doc, item, 1800, rates, { partyRates: true }, 10)).toMatchObject({
    price: 7500,
    inclusive: true,
  });
  expect(customerLine(doc, item, 1800, rates, { partyRates: false }, 10).price).toBe(9000);
  expect(customerLine(doc, item, 1800, [], {}, 1).price).toBe(10000);
  expect(customerLine(doc, item, 1800, rates, { partyRates: true }, 1, 2).price).toBe(75000);
  expect(
    customerLine({ ...doc, type: 'purchase' }, item, 1800, rates, { partyRates: true }).price,
  ).toBe(6000);
});
it('renders placeholders literally and only encodes the user-triggered WhatsApp URL', () => {
  const values = {
    party: '{firm} & Sons',
    doc_no: 'SO-1',
    amount: '₹1,000.00',
    balance: '₹500.00',
    due_date: '10/11/2026',
    firm: 'Shop',
    upi_link: 'upi://pay?pa=x@y',
  };
  const message = renderMessage(
    '{party} {doc_no} {amount} {balance} {due_date} {firm} {upi_link} {unknown}',
    values,
  );
  expect(message).toBe(
    '{firm} & Sons SO-1 ₹1,000.00 ₹500.00 10/11/2026 Shop upi://pay?pa=x@y {unknown}',
  );
  expect(new URL(whatsappLink('+91 98765 43210', message)).searchParams.get('text')).toBe(message);
  expect(() => whatsappLink('12', message)).toThrow('phone');
});
it('earns whole points in integer paise and prevents excess redemption', () => {
  expect(earnedPoints(29999, 2, 10000)).toBe(4);
  expect(redemption(4, 10, 125, 1000)).toBe(500);
  expect(() => redemption(11, 10, 100, 10000)).toThrow('validation');
  expect(() => redemption(10, 10, 125, 1000)).toThrow('overpayment');
});
