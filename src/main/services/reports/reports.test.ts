import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import * as s from '../../db/schema';
import { REPORTS } from '../../../shared/reports';
import { reportsFixture } from './reports-fixture.test-helper';
import { profitFigures } from './profit';
import { position } from './balance';
import { stockItems } from './stock';
import { gstr1Json } from './gstr1-json';
import { gstr1Workbook } from './gstr1-excel';
import { reportWorkbook, INDIAN_MONEY } from './excel';
import { translator } from './labels';
import { utilise } from './gstr3b';
import { resolvePreset } from '../../../shared/report-dates';
import { reportHtml } from './html';

const fixtures: Awaited<ReturnType<typeof reportsFixture>>[] = [];
async function setup() {
  const f = await reportsFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-')))
      throw new Error('Unexpected fixture path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
async function books() {
  const f = await setup();
  // Opening 20 x Rs60 = Rs1200; buy 20 x Rs100 = Rs2000; average = Rs80.
  f.txn({
    type: 'purchase',
    date: '2026-11-01',
    taxable: 200000,
    cgst: 18000,
    sgst: 18000,
    qty: 20,
    stockValue: 200000,
  });
  const sale = f.txn({ taxable: 200000, cgst: 18000, sgst: 18000, qty: -10, stockValue: -60000 });
  f.txn({
    type: 'sale_return',
    date: '2026-11-12',
    taxable: 40000,
    cgst: 3600,
    sgst: 3600,
    qty: 2,
    stockValue: 12000,
    ref: sale.id,
  });
  f.txn({ type: 'expense', taxable: 10000, cgst: 900, sgst: 900 });
  f.txn({ type: 'other_income', taxable: 5000 });
  // Draft/cancelled/deleted documents must never affect the books.
  f.txn({ taxable: 999999, status: 'draft', stockValue: -99999, qty: -1 });
  f.txn({ taxable: 999999, status: 'cancelled' });
  f.txn({ taxable: 999999, deleted: true });
  return f;
}
it('computes P&L using weighted average cost and original return cost, in integer paise', async () => {
  const f = await books(),
    ctx = f.service.context(f.firm.id, f.filters);
  // Net sales 2000-400=1600; COGS (10-2)*80=640; expenses100; income50 => profit910.
  expect(profitFigures(ctx, f.filters.from, f.filters.to)).toMatchObject({
    sales: 200000,
    salesReturns: 40000,
    cogs: 64000,
    netSales: 160000,
    grossProfit: 96000,
    expenseTotal: 10000,
    otherIncome: 5000,
    netProfit: 91000,
  });
  expect(f.service.run(f.firm.id, 'billProfit', f.filters).rows[0].cost).toBe(80000);
  expect(f.service.run(f.firm.id, 'partyProfit', f.filters).rows[0].profit).toBe(96000);
  expect(f.service.run(f.firm.id, 'itemProfit', f.filters).rows[0].profit).toBe(96000);
});
it('values remaining stock at average cost and balances assets with liabilities and capital', async () => {
  const f = await books(),
    ctx = f.service.context(f.firm.id, f.filters);
  // Remaining 32 x Rs80 = Rs2560, ITC credit Rs90, net payable to the party Rs540.
  expect(stockItems(ctx, '2026-11-30')[0]).toMatchObject({ qty: 32, value: 256000 });
  const p = position(ctx);
  expect(p).toMatchObject({
    stock: 256000,
    gstCredit: 9000,
    payables: 54000,
    assets: 265000,
    liabilities: 54000,
    capital: 211000,
  });
  expect(p.assets).toBe(p.liabilities + p.capital);
  const tb = f.service.run(f.firm.id, 'trialBalance', f.filters);
  expect(tb.totals?.debit).toBe(tb.totals?.credit);
});
it('computes GSTR-3B outward, ITC and cash payable, keeping RCM payable in cash', async () => {
  const f = await books();
  f.txn({ type: 'purchase', taxable: 10000, igst: 1800, pos: '27', rc: true });
  const report = f.service.run(f.firm.id, 'gstr3b', f.filters);
  const row = (key: string) => report.rows.find((r) => r.label === `reports.tb.${key}`);
  expect(row('31a')).toMatchObject({ taxable: 160000, cgst: 14400, sgst: 14400 });
  expect(row('31d')).toMatchObject({ taxable: 10000, igst: 1800 });
  expect(row('4c')).toMatchObject({ cgst: 18900, sgst: 18900, igst: 1800 });
  expect(row('cash')).toMatchObject({ igst: 1800, cgst: 0, sgst: 0 });
  expect(row('carry')).toMatchObject({ igst: 0, cgst: 6300, sgst: 4500 });
});
it('does not cross-utilise CGST against SGST or cess against other heads', () => {
  expect(
    utilise(
      { igst: 0, cgst: 0, sgst: 1000, cess: 500 },
      { igst: 0, cgst: 2000, sgst: 0, cess: 900 },
    ),
  ).toEqual({
    cash: { igst: 0, cgst: 0, sgst: 1000, cess: 0 },
    carry: { igst: 0, cgst: 2000, sgst: 0, cess: 400 },
  });
});
it('ages invoices at exact bucket edges and ignores payments and returns after as-on date', async () => {
  const f = await setup();
  const dates = [
    '2026-11-30',
    '2026-10-31',
    '2026-10-30',
    '2026-10-01',
    '2026-09-30',
    '2026-09-01',
    '2026-08-31',
  ];
  const docs = dates.map((date) => f.txn({ date, taxable: 10000 }));
  f.txn({ type: 'sale_return', taxable: 2000, date: '2026-12-01', ref: docs[0].id });
  const receipt = f.txn({ type: 'payment_in', date: '2026-12-01', taxable: 3000 });
  f.context.db
    .insert(s.paymentLinks)
    .values({ paymentTxnId: receipt.id, invoiceTxnId: docs[1].id, amount: 3000 })
    .run();
  const report = f.service.run(f.firm.id, 'allParties', f.filters);
  expect(report.rows[0]).toMatchObject({
    balance: 70000,
    current: 20000,
    d31: 20000,
    d61: 20000,
    d90: 10000,
    other: 0,
  });
});
it('classifies B2B, interstate B2CL over the threshold and small supplies including linked credit notes', async () => {
  const f = await setup();
  const registered = '29ABCDE1234F1ZW';
  f.txn({ taxable: 10000, cgst: 900, sgst: 900, gstin: registered });
  // Threshold is invoice value, strictly over Rs1 lakh; local supplies remain B2CS.
  const large = f.txn({ taxable: 10000001, pos: '27' });
  f.txn({ taxable: 10000000, pos: '27' });
  f.txn({ taxable: 20000000, pos: '29' });
  f.txn({ type: 'sale_return', taxable: 1000, cgst: 90, sgst: 90, gstin: registered });
  f.txn({ type: 'sale_return', taxable: 50000, pos: '27', ref: large.id });
  const data = f.service.gstr1(f.firm.id, f.filters);
  expect(data.b2b).toHaveLength(1);
  expect(data.b2cl).toHaveLength(1);
  expect(data.b2cs.map((r) => r.txval).sort((a, b) => a - b)).toEqual([10000000, 20000000]);
  expect(data.cdnr).toHaveLength(1);
  expect(data.cdnur).toHaveLength(1);
  const json = gstr1Json(data);
  expect(json).toMatchObject({
    gstin: registered,
    fp: '112026',
    b2b: [
      {
        ctin: registered,
        inv: [
          {
            val: 118,
            idt: '10-11-2026',
            itms: [{ itm_det: { rt: 18, txval: 100, camt: 9, samt: 9 } }],
          },
        ],
      },
    ],
    cdnur: [{ typ: 'B2CL', ntty: 'C', val: 500 }],
    hsn: { hsn_b2b: expect.any(Array), hsn_b2c: expect.any(Array) },
    doc_issue: { doc_det: expect.any(Array) },
  });
});
it('uses the pre-August 2024 B2CL threshold and excludes deleted or cancelled invoices', async () => {
  const f = await setup();
  f.txn({ date: '2024-07-10', taxable: 25000000, pos: '27' });
  f.txn({ date: '2024-07-10', taxable: 25000001, pos: '27' });
  f.txn({ date: '2024-07-10', taxable: 30000000, pos: '27', status: 'cancelled' });
  const data = f.service.gstr1(f.firm.id, { from: '2024-07-01', to: '2024-07-31' });
  expect(data.b2cl).toHaveLength(1);
  expect(data.b2cs[0].txval).toBe(25000000);
  expect(data.docs[0]).toMatchObject({ total: 3, cancelled: 1, net: 2 });
  expect(gstr1Json(data).hsn).toHaveProperty('data');
});
it('flags invalid GSTIN and invoice details with a link to the source invoice', async () => {
  const f = await setup(),
    doc = f.txn({ taxable: 10000, gstin: 'INVALID', pos: '' });
  const data = f.service.gstr1(f.firm.id, f.filters);
  expect(data.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'reports.fix.invalidGstin',
        severity: 'error',
        link: `invoices/preview/${doc.id}`,
      }),
      expect.objectContaining({ code: 'reports.fix.noPos' }),
    ]),
  );
});
it('exports numeric rupees, company header, totals and frozen headers in a readable Excel file', async () => {
  const f = await books(),
    report = f.service.run(f.firm.id, 'sale', f.filters);
  const book = reportWorkbook(
    report,
    f.service.header(f.firm.id, 'sale', f.filters, {}),
    translator('en'),
  );
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await book.xlsx.writeBuffer());
  const sheet = reopened.worksheets[0];
  expect(sheet.getCell('A1').value).toBe('Sales Test');
  expect(sheet.getCell('D8').value).toBe(2360);
  expect(sheet.getCell('D7').value).toBe(2360);
  expect(sheet.getColumn(4).numFmt).toBe(INDIAN_MONEY);
  expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 });
});
it('exports GST offline worksheets with row-four headers, dates independent of user date preferences and HSN split', async () => {
  const f = await setup();
  f.txn({ taxable: 10000, cgst: 900, sgst: 900, gstin: '29ABCDE1234F1ZW' });
  const book = await gstr1Workbook(f.service.gstr1(f.firm.id, f.filters), {
    dateFormat: 'yyyy-MM-dd',
  });
  expect(book.worksheets.map((w) => w.name)).toEqual([
    'b2b',
    'b2cl',
    'b2cs',
    'cdnr',
    'cdnur',
    'docs',
    'hsn(b2b)',
    'hsn(b2c)',
  ]);
  expect(book.getWorksheet('b2b')!.getCell('A4').value).toBe('GSTIN/UIN of Recipient');
  expect(book.getWorksheet('b2b')!.getCell('D5').value).toBe('10-11-2026');
  expect(book.getWorksheet('b2b')!.getCell('L5').value).toBe(100);
});
it('runs every registered report on populated books with integer money and translated output labels', async () => {
  const f = await books(),
    tr = translator('en');
  for (const def of REPORTS) {
    const report = f.service.run(f.firm.id, def.id, {
      ...f.filters,
      partyId: f.party.id,
      itemId: f.item.id,
    });
    expect(tr(`reports.name.${def.id}`)).toBeTruthy();
    for (const col of report.columns) {
      expect(tr(col.label), col.label).toBeTruthy();
      if (col.type === 'money')
        for (const row of report.rows)
          if (typeof row[col.key] === 'number')
            expect(Number.isSafeInteger(row[col.key]), `${def.id}/${col.key}`).toBe(true);
    }
    expect(() =>
      reportHtml(report, f.service.header(f.firm.id, def.id, f.filters, {}), tr),
    ).not.toThrow();
  }
});
it('does not include a future opening party balance in historical balances', async () => {
  const f = await setup();
  f.context.db
    .update(s.parties)
    .set({ openingDate: '2026-12-01', openingBalance: 10000 })
    .where(eq(s.parties.id, f.party.id))
    .run();
  expect(f.service.run(f.firm.id, 'allParties', f.filters).rows).toEqual([]);
});
it('resolves financial years and leap-year dates deterministically', () => {
  expect(resolvePreset('fy', '2026-03-31')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  expect(resolvePreset('lastMonth', '2024-03-01')).toEqual({
    from: '2024-02-01',
    to: '2024-02-29',
  });
  expect(resolvePreset('week', '2026-11-10')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
});
