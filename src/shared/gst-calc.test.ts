import { describe, expect, it } from 'vitest';
import { calculateInvoice, calculateLine, type InvoiceInput, type LineInput } from './gst-calc';
const line: LineInput = { qty: 1, price: 10000, taxRate: 18 };
const invoice = (patch: Partial<InvoiceInput> = {}) =>
  calculateInvoice({ lines: [line], firmState: '29', placeOfSupply: '29', ...patch });
describe('GST lines', () => {
  it('splits intra-state GST without losing paise', () =>
    expect(calculateLine(line, '29', '29')).toMatchObject({
      taxable: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      total: 11800,
    }));
  it('uses IGST for interstate supplies', () =>
    expect(calculateLine(line, '29', '27')).toMatchObject({
      cgst: 0,
      sgst: 0,
      igst: 1800,
      total: 11800,
    }));
  it('backs out inclusive GST and cess', () =>
    expect(
      calculateLine({ ...line, price: 12000, inclusive: true, cessRate: 2 }, '29', '29'),
    ).toMatchObject({ taxable: 10000, cgst: 900, sgst: 900, cess: 200, total: 12000 }));
  it('handles fractional quantities without float money math', () =>
    expect(calculateLine({ ...line, qty: '0.125', price: 9999 }, '29', '27')).toMatchObject({
      gross: 1250,
      taxable: 1250,
      igst: 225,
      total: 1475,
    }));
  it('applies percent line discount before GST', () =>
    expect(
      calculateLine({ ...line, discount: { kind: 'percent', value: 10 } }, '29', '29'),
    ).toMatchObject({ discount: 1000, taxable: 9000, total: 10620 }));
  it('applies an amount discount to inclusive gross before backing out tax', () =>
    expect(
      calculateLine(
        { ...line, price: 11800, inclusive: true, discount: { kind: 'amount', value: 1180 } },
        '29',
        '29',
      ),
    ).toMatchObject({ discount: 1180, taxable: 9000, total: 10620 }));
  it.each([0, 0.25, 3, 5, 12, 18, 28, 40])('supports a %s percent standard rate', (taxRate) => {
    const result = calculateLine({ ...line, taxRate }, '29', '27');
    expect(result.igst).toBe(taxRate * 100);
    expect(result.total).toBe(10000 + taxRate * 100);
  });
  it('deterministically splits an odd tax paise', () =>
    expect(calculateLine({ qty: 1, price: 3, taxRate: 18 }, '29', '29')).toMatchObject({
      cgst: 1,
      sgst: 0,
      total: 4,
    }));
  it('handles zero qty, free items and full discount', () => {
    for (const input of [
      { ...line, qty: 0 },
      { ...line, price: 0 },
      { ...line, discount: { kind: 'percent' as const, value: 100 } },
    ])
      expect(calculateLine(input, '29', '29').total).toBe(0);
  });
  it('preserves every inclusive gross paise over small prices and mixed rates', () => {
    for (let price = 0; price < 150; price++)
      for (const taxRate of [0, 0.25, 3, 18, 40])
        for (const cessRate of [0, 2, 100]) {
          const result = calculateLine(
            { qty: 1, price, taxRate, cessRate, inclusive: true },
            '29',
            '29',
          );
          expect(result.total).toBe(price);
          expect(result.cgst).toBeGreaterThanOrEqual(0);
          expect(result.cess).toBeGreaterThanOrEqual(0);
        }
  });
  it.each([
    { qty: -1 },
    { price: -1 },
    { price: 0.5 },
    { qty: 1.0001 },
    { taxRate: -1 },
    { taxRate: 101 },
    { cessRate: 101 },
    { discount: { kind: 'amount' as const, value: 10001 } },
    { discount: { kind: 'percent' as const, value: 101 } },
    { price: Number.MAX_SAFE_INTEGER, qty: 10 },
    { qty: NaN },
    { qty: Infinity },
  ])('rejects invalid inputs %j', (patch) =>
    expect(() => calculateLine({ ...line, ...patch }, '29', '29')).toThrow(),
  );
});
describe('invoice totals', () => {
  it('returns an empty zero invoice', () =>
    expect(invoice({ lines: [] })).toMatchObject({
      total: 0,
      taxable: 0,
      roundOff: 0,
      cgst: 0,
      sgst: 0,
    }));
  it('includes taxable additional charges in the totals', () =>
    expect(invoice({ charges: [{ qty: 1, price: 1000, taxRate: 18 }] })).toMatchObject({
      taxable: 11000,
      cgst: 990,
      sgst: 990,
      total: 12980,
    }));
  it('allocates transaction discounts before GST across mixed tax rates', () => {
    const result = invoice({
      lines: [line, { ...line, taxRate: 5 }],
      discount: { kind: 'percent', value: 10 },
    });
    expect(result).toMatchObject({ transactionDiscount: 2000, taxable: 18000, total: 20070 });
    expect(result.lines.map((row) => row.transactionDiscount)).toEqual([1000, 1000]);
  });
  it('allocates an odd transaction discount with no remainder', () => {
    const result = invoice({
      lines: Array.from({ length: 3 }, () => ({ qty: 1, price: 1, taxRate: 0 })),
      discount: { kind: 'amount', value: 2 },
    });
    expect(result.lines.map((row) => row.transactionDiscount)).toEqual([1, 0, 1]);
    expect(result.total).toBe(1);
  });
  it('includes charges when allocating the transaction discount', () =>
    expect(invoice({ charges: [line], discount: { kind: 'amount', value: 20000 } }).total).toBe(0));
  it('rejects a discount on an empty invoice', () =>
    expect(() => invoice({ lines: [], discount: { kind: 'amount', value: 1 } })).toThrow());
  it('requires state information', () => expect(() => invoice({ placeOfSupply: '' })).toThrow());
  it.each([
    ['nearest', 100, 12350, 12400],
    ['nearest', 50, 12325, 12350],
    ['nearest', 10, 12345, 12350],
    ['up', 100, 12301, 12400],
    ['up', 50, 12301, 12350],
    ['up', 10, 12301, 12310],
    ['down', 100, 12399, 12300],
    ['down', 50, 12349, 12300],
    ['down', 10, 12349, 12340],
    ['up', 100, 12300, 12300],
    ['down', 100, 12300, 12300],
  ] as const)('rounds %s to %s paise', (mode, step, price, total) => {
    const result = invoice({ lines: [{ qty: 1, price, taxRate: 0 }], roundOff: { mode, step } });
    expect(result.total).toBe(total);
    expect(result.beforeRoundOff + result.roundOff).toBe(total);
  });
  it('keeps every component integer and reconciles invoice totals', () => {
    for (let i = 1; i <= 200; i++) {
      const result = invoice({
        lines: [
          { ...line, qty: String(i / 1000), price: 7319 },
          { qty: '2.5', price: 87, taxRate: 0.25, cessRate: 2 },
        ],
        discount: { kind: 'percent', value: 7.25 },
        roundOff: { mode: 'nearest', step: 50 },
      });
      expect(
        result.taxable + result.cgst + result.sgst + result.igst + result.cess + result.roundOff,
      ).toBe(result.total);
      for (const value of Object.values(result))
        if (typeof value === 'number') expect(Number.isSafeInteger(value)).toBe(true);
    }
  });
});
