import { describe, expect, it } from 'vitest';
import { matchStatement, type PaymentCandidate } from './reconcile';
import {
  detectSheet,
  parseCsv,
  parseLines,
  parseStatementAmount,
  parseStatementDate,
  suggestMapping,
  toYoupiCsv,
  type StatementLine,
} from './statement-parse';

const line = (
  index: number,
  date: string,
  creditPaise: number,
  utrs: string[] = [],
  description = '',
): StatementLine => ({ index, date, description, creditPaise, debitPaise: 0, utrs });
const pay = (txnId: number, date: string, amountPaise: number, utr = ''): PaymentCandidate => ({
  txnId,
  date,
  amountPaise,
  utr,
  label: `RCPT-${txnId}`,
});

describe('statement matcher', () => {
  it('matches on UTR first, even when the date is far away', () => {
    const result = matchStatement(
      [line(0, '2026-11-20', 50000, ['401537805904'])],
      [pay(1, '2026-11-01', 50000, '401537805904'), pay(2, '2026-11-20', 50000)],
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ reason: 'utr', candidate: { txnId: 1 } });
    expect(result.possible).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });
  it('flags the same UTR with a different amount as possible, never as matched', () => {
    const result = matchStatement(
      [line(0, '2026-11-10', 40000, ['401537805904'])],
      [pay(1, '2026-11-10', 50000, '401537805904')],
    );
    expect(result.matched).toEqual([]);
    expect(result.possible).toMatchObject([
      { reason: 'amountDiffers', candidates: [{ txnId: 1 }] },
    ]);
  });
  it('matches on amount and date within two days when there is a single candidate', () => {
    const result = matchStatement(
      [line(0, '2026-11-12', 25000)],
      [pay(1, '2026-11-10', 25000), pay(2, '2026-11-10', 99900)],
    );
    expect(result.matched).toMatchObject([{ reason: 'amountDate', candidate: { txnId: 1 } }]);
  });
  it('does not match outside the two-day window or with another amount', () => {
    const result = matchStatement(
      [line(0, '2026-11-13', 25000), line(1, '2026-11-10', 25001)],
      [pay(1, '2026-11-10', 25000)],
    );
    expect(result.matched).toEqual([]);
    expect(result.unmatched.map((l) => l.index)).toEqual([0, 1]);
  });
  it('treats the window as inclusive and works backwards across month ends', () => {
    expect(
      matchStatement([line(0, '2026-12-01', 100)], [pay(1, '2026-11-29', 100)]).matched,
    ).toHaveLength(1);
    expect(
      matchStatement([line(0, '2026-11-28', 100)], [pay(1, '2026-12-01', 100)]).matched,
    ).toHaveLength(0);
  });
  it('puts an ambiguous amount and date match in possible', () => {
    const result = matchStatement(
      [line(0, '2026-11-10', 30000)],
      [pay(1, '2026-11-10', 30000), pay(2, '2026-11-11', 30000)],
    );
    expect(result.matched).toEqual([]);
    expect(result.possible).toHaveLength(1);
    expect(result.possible[0].reason).toBe('ambiguous');
    expect(result.possible[0].candidates.map((c) => c.txnId)).toEqual([1, 2]);
  });
  it('puts two bank credits competing for one payment in possible, not matched', () => {
    const result = matchStatement(
      [line(0, '2026-11-10', 30000), line(1, '2026-11-10', 30000)],
      [pay(1, '2026-11-10', 30000)],
    );
    expect(result.matched).toEqual([]);
    expect(result.possible.map((p) => p.line.index)).toEqual([0, 1]);
  });
  it('lets the UTR claim a payment before amount and date can', () => {
    const result = matchStatement(
      [line(0, '2026-11-10', 30000), line(1, '2026-11-10', 30000, ['401537805904'])],
      [pay(1, '2026-11-10', 30000, '401537805904'), pay(2, '2026-11-10', 30000)],
    );
    expect(result.matched.map((m) => [m.line.index, m.candidate.txnId, m.reason])).toEqual([
      [1, 1, 'utr'],
      [0, 2, 'amountDate'],
    ]);
  });
  it('never pairs two different references as the same payment', () => {
    const result = matchStatement(
      [line(0, '2026-11-10', 30000, ['111111111111'])],
      [pay(1, '2026-11-10', 30000, '222222222222')],
    );
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });
  it('ignores debits and uses a payment only once', () => {
    const debit: StatementLine = { ...line(0, '2026-11-10', 0), debitPaise: 30000 };
    const result = matchStatement(
      [
        debit,
        line(1, '2026-11-10', 30000, ['401537805904']),
        line(2, '2026-11-10', 30000, ['401537805904']),
      ],
      [pay(1, '2026-11-10', 30000, '401537805904')],
    );
    expect(result.matched).toHaveLength(1);
    expect(result.unmatched.map((l) => l.index)).toEqual([2]);
  });
});

describe('statement reading', () => {
  it('reads Indian date styles', () => {
    const cases: [string, string | null][] = [
      ['2026-11-10', '2026-11-10'],
      ['10/11/2026', '2026-11-10'],
      ['10-11-26', '2026-11-10'],
      ['5.1.2026', '2026-01-05'],
      ['10 Nov 2026', '2026-11-10'],
      ['10-Nov-26', '2026-11-10'],
      ['10-November-2026', '2026-11-10'],
      ['31/02/2026', null],
      ['Opening balance', null],
      ['', null],
    ];
    for (const [raw, iso] of cases) expect(parseStatementDate(raw)).toBe(iso);
  });
  it('reads amounts with Indian grouping, rupee signs and Cr/Dr', () => {
    const cases: [string, number | null][] = [
      ['1,23,456.78', 12345678],
      ['₹ 500', 50000],
      ['250.5', 25050],
      ['99.00 Cr', 9900],
      ['', 0],
      ['-', 0],
      ['abc', null],
      ['1.234', null],
    ];
    for (const [raw, paise] of cases) expect(parseStatementAmount(raw)).toBe(paise);
  });
  it('parses quoted CSV cells, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
  const hdfc = [
    ['Statement of account', '', '', '', '', ''],
    [
      'Date',
      'Narration',
      'Chq./Ref.No.',
      'Value Dt',
      'Withdrawal Amt.',
      'Deposit Amt.',
      'Closing Balance',
    ],
    [
      '10/11/26',
      'UPI-RAHUL-rahul@okhdfcbank-HDFC0001234-401537805904-PAY',
      '0000401537805904',
      '10/11/26',
      '',
      '1,500.00',
      '9,000.00',
    ],
    ['11/11/26', 'ATM WDL', '0000000012', '11/11/26', '200.00', '', '8,800.00'],
    ['Total', '', '', '', '200.00', '1,500.00', ''],
  ];
  it('finds the header row, suggests columns and parses credits and debits', () => {
    const found = detectSheet(hdfc)!;
    expect(found.mapping).toEqual({ date: 0, narration: 1, credit: 5, debit: 4, utr: 2 });
    const lines = parseLines(found.sheet, found.mapping!);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      date: '2026-11-10',
      creditPaise: 150000,
      debitPaise: 0,
      utrs: ['401537805904'],
    });
    expect(lines[1]).toMatchObject({ debitPaise: 20000, creditPaise: 0 });
  });
  it('recognises other banks’ header names', () => {
    expect(
      suggestMapping(['Txn Date', 'Description', 'UTR No', 'Debit', 'Credit', 'Balance']),
    ).toEqual({ date: 0, narration: 1, credit: 4, debit: 3, utr: 2 });
    expect(
      suggestMapping([
        'Transaction Date',
        'Transaction Remarks',
        'Withdrawal Amount (INR)',
        'Deposit Amount (INR)',
      ]),
    ).toEqual({ date: 0, narration: 1, credit: 3, debit: 2, utr: -1 });
    expect(suggestMapping(['Foo', 'Bar'])).toBeNull();
  });
  it('still returns the sheet when columns cannot be guessed', () => {
    const found = detectSheet([
      ['A', 'B', 'C'],
      ['1', '2', '3'],
    ])!;
    expect(found.mapping).toBeNull();
    expect(found.sheet.headers).toEqual(['A', 'B', 'C']);
  });
  it('writes the CSV layout YouPI-PG accepts', () => {
    const found = detectSheet(hdfc)!;
    expect(toYoupiCsv(parseLines(found.sheet, found.mapping!))).toBe(
      [
        'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.',
        '10/11/2026,"UPI-RAHUL-rahul@okhdfcbank-HDFC0001234-401537805904-PAY","401537805904",,1500.00',
        '11/11/2026,"ATM WDL","",200.00,',
      ].join('\n'),
    );
  });
});
