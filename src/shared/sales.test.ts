import { describe, expect, it } from 'vitest';
import {
  allocateOldest,
  blankDocument,
  exceedsCredit,
  documentCreditWarning,
  stockShortages,
  validateReturnAgainst,
  lineFromItem,
  documentLineFromItem,
  paymentStatus,
  stockMovement,
  totals,
  validateAllocations,
} from './sales';
import { blankItem, type Item } from './masters';
import { nextDocumentNumber } from './numbering';
const item: Item = {
  ...blankItem(),
  id: 1,
  firmId: 1,
  name: 'Notebook',
  unitId: 1,
  secondaryUnitId: 2,
  conversion: 12,
  salePrice: 11800,
  purchasePrice: 6000,
  inclusive: true,
  wholesalePrice: 10620,
  wholesaleQty: 12,
  qty: 20,
  value: 120000,
};
describe('sales calculator integration', () => {
  it.each(['29', '27'])(
    'backs out inclusive tax, discounts lines and bill, taxes charges, rounds (%s)',
    (state) => {
      const d = blankDocument('sale', '29');
      d.placeOfSupply = state;
      d.lines = [{ ...lineFromItem(item, 1800), discountAmount: 1180 }];
      d.charges = [{ name: 'Packing', amount: 1000, taxBps: 1800 }];
      d.discountBps = 1000;
      d.roundMode = 'nearest';
      d.roundStep = 100;
      expect(totals(d, '29')).toMatchObject({
        gross: 12800,
        lineDiscount: 1180,
        transactionDiscount: 1000,
        taxable: 9000,
        total: 10600,
        roundOff: -20,
        ...(state === '29' ? { cgst: 810, sgst: 810, igst: 0 } : { cgst: 0, sgst: 0, igst: 1620 }),
      });
    },
  );
  it('reprices wholesale quantities and secondary units using integer paise', () => {
    expect(lineFromItem(item, 1800, 11).price).toBe(11800);
    expect(lineFromItem(item, 1800, 12).price).toBe(10620);
    expect(lineFromItem(item, 1800, 1, 2).price).toBe(127440);
  });
  it('moves billed and free stock in base units and reverses returns', () => {
    const line = { ...lineFromItem(item, 1800, 1, 2), freeQty: 0.5 };
    expect(stockMovement('sale', line, item)).toEqual({ qty: -18, value: -108000 });
    expect(stockMovement('sale_return', line, item)).toEqual({ qty: 18, value: 108000 });
    expect(stockMovement('estimate', line, item)).toEqual({ qty: 0, value: 0 });
    expect(stockMovement('sale', line, { ...item, type: 'service' })).toEqual({ qty: 0, value: 0 });
  });
  it('checks credit boundaries including receipt and existing signed balances', () => {
    expect(exceedsCredit(5000, 10000, 3000, 12000)).toBe(false);
    expect(exceedsCredit(5001, 10000, 3000, 12000)).toBe(true);
    expect(exceedsCredit(-5000, 10000, 3000, 12000)).toBe(false);
    expect(exceedsCredit(50000, 10000, 0, null)).toBe(false);
    expect(exceedsCredit(0, 1, 0, 0)).toBe(true);
  });
  it('separates sequences by prefix, document type and firm', () => {
    const docs = [
      { firmId: 1, type: 'sale', prefix: 'FY26/', number: 9 },
      { firmId: 1, type: 'sale', prefix: 'INV-', number: 99 },
      { firmId: 2, type: 'sale', prefix: 'FY26/', number: 100 },
    ];
    expect(nextDocumentNumber(docs, 1, 'sale', 'FY26/').number).toBe(10);
    expect(nextDocumentNumber(docs, 1, 'estimate', 'FY26/').number).toBe(1);
  });
});
describe('payment settlement', () => {
  const invoices = [
    { id: 3, date: '2026-11-02', balance: 9000 },
    { id: 2, date: '2026-11-01', balance: 5000 },
    { id: 1, date: '2026-11-01', balance: 6000 },
  ];
  it('allocates oldest-first with stable ID order, preserves paise and leaves advances', () => {
    expect(allocateOldest(11001, invoices)).toEqual([
      { invoiceId: 1, amount: 6000 },
      { invoiceId: 2, amount: 5000 },
      { invoiceId: 3, amount: 1 },
    ]);
    expect(allocateOldest(50000, invoices).reduce((n, a) => n + a.amount, 0)).toBe(20000);
    expect(allocateOldest(0, invoices)).toEqual([]);
  });
  it('rejects duplicate, foreign, over-allocated, and overpaid invoice links', () => {
    for (const allocations of [
      [{ invoiceId: 1, amount: 6001 }],
      [{ invoiceId: 7, amount: 1 }],
      [
        { invoiceId: 1, amount: 1 },
        { invoiceId: 1, amount: 1 },
      ],
      [
        { invoiceId: 1, amount: 3000 },
        { invoiceId: 2, amount: 3000 },
      ],
    ])
      expect(() => validateAllocations(5000, allocations, invoices)).toThrow('allocation');
  });
  it('derives paid, partial, unpaid and overdue without changing posting status', () => {
    expect(paymentStatus(1000, 1000, '2026-10-01', '2026-11-10')).toBe('paid');
    expect(paymentStatus(1000, 500, '2026-12-01', '2026-11-10')).toBe('partial');
    expect(paymentStatus(1000, 0, null)).toBe('unpaid');
    expect(paymentStatus(1000, 500, '2026-10-01', '2026-11-10')).toBe('overdue');
  });
});

it('projects edits without counting the existing invoice twice or warning on unrelated low stock', () => {
  const doc = { ...blankDocument('sale', '29'), partyId: 1, lines: [lineFromItem(item, 1800)] };
  const party = { id: 1, balance: 11800, creditLimit: 12000 };
  expect(documentCreditWarning(doc, '29', party, doc)).toBe(false);
  expect(
    documentCreditWarning({ ...doc, lines: [lineFromItem(item, 1800, 2)] }, '29', party, doc),
  ).toBe(true);
  expect(stockShortages(doc, [{ ...item, qty: 0 }], doc)).toEqual([]);
  expect(
    stockShortages({ ...doc, lines: [lineFromItem(item, 1800, 2)] }, [{ ...item, qty: 0 }], doc),
  ).toEqual([1]);
  expect(stockShortages({ ...doc, lines: [] }, [{ ...item, qty: -1 }])).toEqual([]);
});
it('prevents quantity-only excess returns even with a zero-price credit note', () => {
  const line = lineFromItem(item, 1800);
  expect(() =>
    validateReturnAgainst(
      { total: 11800, lines: [line] },
      { total: 0, lines: [{ ...line, qty: 2 }] },
      [],
    ),
  ).toThrow('validation');
  expect(() =>
    validateReturnAgainst(
      { total: 11800, lines: [line] },
      { total: 5900, lines: [{ ...line, qty: 0.5 }] },
      [{ total: 5900, lines: [{ ...line, qty: 0.5 }] }],
    ),
  ).not.toThrow();
});

it('configures purchase pricing and stock signs through the shared document model', () => {
  expect(documentLineFromItem('purchase', item, 1800, 12)).toMatchObject({
    price: 6000,
    inclusive: false,
    discountBps: 0,
  });
  expect(documentLineFromItem('sale', item, 1800, 12).price).toBe(10620);
  const line = documentLineFromItem('purchase', item, 1800, 2);
  expect(stockMovement('purchase', line, item)).toEqual({ qty: 2, value: 12000 });
  expect(stockMovement('purchase_return', line, item)).toEqual({ qty: -2, value: -12000 });
});
