import { describe, expect, it } from 'vitest';
import {
  allocateFefo,
  duplicateSerials,
  expiryStatus,
  fefoOrder,
  findByCode,
  scanDetector,
  netQty,
  parseSerials,
  posChange,
  posSummary,
  serialCountMatches,
  settlePos,
  splitValue,
  transferMovements,
  transferSchema,
} from './inventory';
import { PATTERNS, code128Svg, code128Values, code128Widths } from './code128';

const batches = [
  { id: 1, number: 'B-LATE', expDate: '2027-06-30', qty: 10 },
  { id: 2, number: 'B-OLD', expDate: '2026-11-01', qty: 5 },
  { id: 3, number: 'B-SOON', expDate: '2026-12-15', qty: 4 },
  { id: 4, number: 'B-NODATE', expDate: null, qty: 7 },
];

describe('batches (FEFO)', () => {
  it('orders by earliest expiry, undated last', () => {
    expect(fefoOrder(batches).map((b) => b.id)).toEqual([2, 3, 1, 4]);
  });
  it('skips expired batches and spills over to the next expiry', () => {
    // On 14 Nov 2026 B-OLD (1 Nov) has expired.
    expect(allocateFefo(batches, 6, '2026-11-14')).toEqual({
      allocations: [
        { batchId: 3, qty: 4 },
        { batchId: 1, qty: 2 },
      ],
      remainder: 0,
    });
  });
  it('uses expired stock only when allowed, and reports what it could not cover', () => {
    expect(allocateFefo(batches, 30, '2026-11-14', true)).toEqual({
      allocations: [
        { batchId: 2, qty: 5 },
        { batchId: 3, qty: 4 },
        { batchId: 1, qty: 10 },
        { batchId: 4, qty: 7 },
      ],
      remainder: 4,
    });
    expect(allocateFefo(batches, 0.3, '2026-10-01').allocations).toEqual([
      { batchId: 2, qty: 0.3 },
    ]);
  });
  it('labels expiry windows', () => {
    expect(expiryStatus('2026-11-13', '2026-11-14')).toBe('expired');
    expect(expiryStatus('2026-11-14', '2026-11-14')).toBe('expiring30');
    expect(expiryStatus('2027-01-10', '2026-11-14')).toBe('expiring60');
    expect(expiryStatus('2027-02-10', '2026-11-14')).toBe('expiring90');
    expect(expiryStatus('2027-06-30', '2026-11-14')).toBe('ok');
    expect(expiryStatus(null, '2026-11-14')).toBe('none');
  });
  it('splits stock value by quantity without losing a paisa', () => {
    const parts = splitValue(1000, 3, [1, 1, 1]);
    expect(parts).toEqual([333, 333, 334]);
    expect(parts.reduce((a, b) => a + b)).toBe(1000);
    expect(splitValue(-999, 2, [0.5, 1.5])).toEqual([-249, -750]);
  });
});

describe('serial numbers', () => {
  it('parses pasted lists and finds duplicates', () => {
    expect(parseSerials('IMEI1\nIMEI2, IMEI3;\tIMEI4\n\n')).toEqual([
      'IMEI1',
      'IMEI2',
      'IMEI3',
      'IMEI4',
    ]);
    expect(duplicateSerials(['a1', 'B2', 'A1'])).toEqual(['A1']);
  });
  it('needs one serial per unit', () => {
    expect(serialCountMatches(2, ['x', 'y'])).toBe(true);
    expect(serialCountMatches(2, ['x'])).toBe(false);
    expect(serialCountMatches(1.5, ['x'])).toBe(false);
  });
});

describe('godown transfer', () => {
  it('moves stock out of one godown into another and conserves totals', () => {
    const input = transferSchema.parse({
      date: '2026-11-14',
      fromId: 1,
      toId: 2,
      lines: [
        { itemId: 7, qty: 2.5 },
        { itemId: 8, qty: 1, batchId: 3 },
      ],
    });
    const rows = transferMovements(input, (_item, qty) => Math.round(qty * 4000));
    expect(rows).toHaveLength(4);
    for (const item of [7, 8]) expect(netQty(rows.filter((r) => r.itemId === item))).toBe(0);
    expect(rows.reduce((n, r) => n + r.value, 0)).toBe(0);
    expect(rows.filter((r) => r.godownId === 2).map((r) => r.qty)).toEqual([2.5, 1]);
  });
  it('rejects a transfer into the same godown', () => {
    expect(
      transferSchema.safeParse({
        date: '2026-11-14',
        fromId: 1,
        toId: 1,
        lines: [{ itemId: 1, qty: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('POS', () => {
  it('computes change and split payments in paise', () => {
    expect(posChange(43750, 50000)).toBe(6250);
    expect(
      settlePos(
        43750,
        [
          { method: 'cash', amount: 20000 },
          { method: 'upi', amount: 23750 },
        ],
        50000,
      ),
    ).toEqual({ paid: 43750, change: 30000 });
    expect(() => settlePos(43750, [{ method: 'cash', amount: 40000 }])).toThrow('validation');
    expect(() => settlePos(100, [{ method: 'card', amount: 200 }])).toThrow('overpayment');
    expect(() => settlePos(100, [{ method: 'cash', amount: 100 }], 50)).toThrow();
  });
  it('summarises the day by payment method', () => {
    expect(
      posSummary([
        { total: 100, parts: [{ method: 'cash', amount: 100 }] },
        {
          total: 250,
          parts: [
            { method: 'upi', amount: 200 },
            { method: 'card', amount: 50 },
          ],
        },
      ]),
    ).toEqual({ bills: 2, total: 350, cash: 100, upi: 200, card: 50 });
  });
});

describe('Code 128', () => {
  it('has 107 distinct symbols of 11 modules (stop 13)', () => {
    expect(PATTERNS).toHaveLength(107);
    expect(new Set(PATTERNS).size).toBe(107);
    PATTERNS.forEach((p, i) =>
      expect([...p].reduce((n, c) => n + Number(c), 0)).toBe(i === 106 ? 13 : 11),
    );
  });
  it('encodes text in code set B with the mod-103 checksum', () => {
    // PJJ123C: 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });
  it('packs even-length digits two per symbol in code set C', () => {
    // 105 + 12·1 + 34·2 + 56·3 = 353 → 353 mod 103 = 44
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44, 106]);
    expect(code128Values('12345')[0]).toBe(104);
  });
  it('produces the right module count and an SVG', () => {
    const widths = code128Widths('AB');
    expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * 4 + 13);
    expect(widths[0]).toBe(2); // start B begins with a 2-module bar
    const svg = code128Svg('AB-12');
    expect(svg).toMatch(/^<svg/);
    // start + 5 data + checksum = 7 symbols × 3 bars, plus 4 bars in STOP
    expect(svg.match(/<rect/g)).toHaveLength(7 * 3 + 4);
    expect(() => code128Values('नमस्ते')).toThrow();
  });
});

describe('barcode scanner input', () => {
  it('finds items by exact barcode, then code', () => {
    const items = [
      { id: 1, code: 'ABC', barcode: '8901234567890' },
      { id: 2, code: '8901234567890', barcode: null },
      { id: 3, code: 'abc1', barcode: '' },
    ];
    expect(findByCode(items, '8901234567890')?.id).toBe(1);
    expect(findByCode(items, ' abc ')?.id).toBe(1);
    expect(findByCode(items, 'ABC1')?.id).toBe(3);
    expect(findByCode(items, 'AB')).toBeUndefined();
  });
  it('accepts a fast burst ending in Enter and ignores normal typing', () => {
    const scan = scanDetector(50, 3);
    let t = 0;
    for (const c of '890123') expect(scan(c, (t += 10))).toBeNull();
    expect(scan('Enter', (t += 10))).toBe('890123');
    // Human typing: 200 ms between keys.
    for (const c of 'abc') scan(c, (t += 200));
    expect(scan('Enter', (t += 200))).toBeNull();
    // A pause restarts the burst, so only the fast tail counts.
    scan('x', (t += 10));
    for (const c of 'A12') scan(c, (t += 500 * Number(c === 'A') + 10));
    expect(scan('Enter', t + 10)).toBe('A12');
  });
});
