import { describe, expect, it } from 'vitest';
import {
  baseQuantity,
  blankItem,
  blankParty,
  itemSchema,
  partyLedger,
  partySchema,
  stockAmount,
  stockBalance,
} from './masters';
import { validateImport } from './master-import';
describe('master business rules', () => {
  it('fills a checked GSTIN state and rejects invalid phone and GSTIN', () => {
    expect(
      partySchema.parse({ ...blankParty('29'), name: 'Asha', gstin: ' 27aapfu0939f1zv ' })
        .stateCode,
    ).toBe('27');
    expect(partySchema.safeParse({ ...blankParty(), name: 'Asha', phone: '123' }).success).toBe(
      false,
    );
    expect(
      partySchema.safeParse({ ...blankParty(), name: 'Asha', gstin: '27AAPFU0939F1ZA' }).success,
    ).toBe(false);
  });
  it('starts at signed opening balance and carries earlier entries through date filters', () => {
    const rows = [
      { id: 1, date: '2026-04-03', type: 'sale', number: '1', total: 10000, change: 8000 },
      { id: 2, date: '2026-04-05', type: 'payment_in', number: '1', total: 3000, change: -3000 },
    ];
    expect(partyLedger(-2000, '2026-04-01', rows).map((r) => r.balance)).toEqual([
      -2000, 6000, 3000,
    ]);
    expect(partyLedger(-2000, '2026-04-01', rows, '2026-04-04')[0].balance).toBe(3000);
    expect(partyLedger(15000, '2026-04-01', [])[0].balance).toBe(15000);
  });
  it('converts secondary quantities exactly and values fractional units in integer paise', () => {
    expect(baseQuantity(2, 12)).toBe(24);
    expect(baseQuantity(0.125, 12)).toBe(1.5);
    expect(stockAmount(1.125, 101)).toBe(114);
    expect(stockAmount(-1.125, 101)).toBe(-114);
    expect(() => baseQuantity(0.001, 0.5)).toThrow();
    expect(
      stockBalance([
        { qty: 24, value: 24000 },
        { qty: -1.5, value: -1500 },
        { qty: 0.125, value: 125 },
      ]),
    ).toEqual({ qty: 22.625, value: 22625 });
    expect(() => stockAmount(1e9, Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it('rejects fractional paise, invalid dates and stock on services', () => {
    expect(itemSchema.safeParse({ ...blankItem(), name: 'Bad', salePrice: 1.5 }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({ ...blankItem(), name: 'Bad', openingDate: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({ ...blankItem(), name: 'Bad', type: 'service', openingQty: 1 }).success,
    ).toBe(false);
  });
});
describe('mapped spreadsheet validation', () => {
  it('maps money without floating point rounding and provides per-row errors', () => {
    const result = validateImport(
      'parties',
      {
        headers: ['Customer', 'Mobile', 'Owed'],
        rows: [
          ['Asha', '9876543210', '-1234.56'],
          ['Bad', '123', '1.234'],
          ['', '', ''],
        ],
      },
      { name: 'Customer', phone: 'Mobile', openingBalance: 'Owed' },
    );
    expect(result).toMatchObject({ valid: 1, invalid: 2 });
    expect(result.rows[0].data).toMatchObject({ name: 'Asha', openingBalance: -123456 });
    expect(result.rows[1].errors).toEqual(expect.arrayContaining(['phone', 'openingBalance']));
    expect(result.rows[2].errors).toContain('name');
  });
  it('rejects duplicate codes, unknown units, tax and over-precise quantity', () => {
    const headers = ['name', 'code', 'unit', 'taxRate', 'openingQty', 'salePrice'];
    const result = validateImport(
      'items',
      {
        headers,
        rows: [
          ['Rice', 'A', 'Kg', '5', '1.125', '0.29'],
          ['Rice 2', 'A', 'Kg', '5', '1', '30'],
          ['Bad', 'EXISTS', 'Unknown', '99', '1.0001', '50'],
        ],
      },
      Object.fromEntries(headers.map((h) => [h, h])),
      { codes: ['EXISTS'], taxes: [{ id: 1, rateBps: 500 }], units: [{ id: 1, symbol: 'Kg' }] },
    );
    expect(result).toMatchObject({ valid: 1, invalid: 2 });
    expect(result.rows[0].data).toMatchObject({
      salePrice: 29,
      openingQty: 1.125,
      taxRateId: 1,
      unitId: 1,
    });
    expect(result.rows[1].errors).toContain('code');
    expect(result.rows[2].errors).toEqual(
      expect.arrayContaining(['code', 'unit', 'taxRate', 'openingQty']),
    );
  });
  it('does not reserve a code from an invalid row', () => {
    const result = validateImport(
      'items',
      {
        headers: ['name', 'code'],
        rows: [
          ['', 'A'],
          ['Valid', 'A'],
        ],
      },
      { name: 'name', code: 'code' },
    );
    expect(result).toMatchObject({ valid: 1, invalid: 1 });
  });
});
