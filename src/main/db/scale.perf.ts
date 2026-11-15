/**
 * Scale check: 1,000 parties, 2,000 items, 10,000 sale invoices (3 lines each), 1,000 purchases
 * and payments. Run with `npm run perf` — prints timings; asserts the response-time targets below.
 */
import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './index';
import { repositories } from './repositories';
import { masterRepository } from './masters';
import { salesRepository } from './sales';
import * as s from './schema';
import { dashboard } from '../services/dashboard';
import { taxLines } from '../services/reports/gst-lines';
import { valuation } from '../services/reports/valuation';
import { reportService } from '../services/reports';
import { blankParty } from '../../shared/masters';
import { blankDocument, lineFromItem, totals } from '../../shared/sales';

const PARTIES = 1000,
  ITEMS = 2000,
  SALES = 10000,
  PURCHASES = 1000;
const path = mkdtempSync(join(tmpdir(), 'billsathi-perf-'));
afterAll(() => rmSync(path, { recursive: true, force: true }));
const timings: Record<string, number> = {};
function time<T>(label: string, fn: () => T, runs = 3): T {
  let result!: T;
  const all: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    result = fn();
    all.push(performance.now() - start);
  }
  timings[label] = Math.round(all.sort((a, b) => a - b)[Math.floor(runs / 2)]);
  return result;
}

it(
  'stays fast with 10,000 invoices',
  async () => {
    const context = await openDatabase(path);
    const repo = repositories(context),
      masters = masterRepository(context),
      sales = salesRepository(context);
    const firm = repo.create({
      name: 'Scale Test',
      phone: '9876543210',
      category: 'grocery',
      stateCode: '29',
      gstin: '',
      pan: '',
      address: 'Bengaluru',
      email: '',
      bankName: '',
      accountNumber: '',
      ifsc: '',
      upiId: '',
      demo: false,
    }).id;
    const unit = masters.lookups(firm).units[0].id;
    const seedStart = performance.now();
    context.sqlite.transaction(() => {
      const db = context.db;
      const at = new Date().toISOString();
      for (let i = 0; i < PARTIES; i += 500)
        db.insert(s.parties)
          .values(
            Array.from({ length: Math.min(500, PARTIES - i) }, (_, j) => {
              const p = blankParty('29');
              return {
                firmId: firm,
                name: `Customer ${i + j + 1}`,
                phone: String(9000000000 + i + j),
                gstType: p.gstType,
                stateCode: '29',
                openingBalance: 0,
              };
            }),
          )
          .run();
      for (let i = 0; i < ITEMS; i += 500)
        db.insert(s.items)
          .values(
            Array.from({ length: Math.min(500, ITEMS - i) }, (_, j) => ({
              firmId: firm,
              name: `Item ${i + j + 1}`,
              code: `IT${i + j + 1}`,
              unitId: unit,
              salePrice: 10000 + ((i + j) % 50) * 100,
              purchasePrice: 7000,
              customFields: '{}',
            })),
          )
          .run();
      const parties = db.select().from(s.parties).all();
      const items = masters.items(firm);
      // Opening stock so sales never go negative.
      for (let i = 0; i < items.length; i += 500)
        db.insert(s.stockLedger)
          .values(
            items.slice(i, i + 500).map((it) => ({
              firmId: firm,
              itemId: it.id,
              date: '2025-04-01',
              qty: 1000,
              value: 7000000,
              reason: 'opening',
            })),
          )
          .run();
      const cash = sales.accounts(firm).find((a) => a.type === 'cash')!.id;
      const make = (type: 'sale' | 'purchase', n: number) => {
        const day = new Date(Date.UTC(2025, 3, 1) + (n % 590) * 86400000)
          .toISOString()
          .slice(0, 10);
        const party = parties[n % parties.length];
        const lines = [0, 1, 2].map((k) =>
          lineFromItem(items[(n * 3 + k) % items.length], [0, 500, 1200, 1800][k % 4], 1 + k),
        );
        const doc = {
          ...blankDocument(type, '29'),
          prefix: type === 'sale' ? 'INV-' : 'PUR-',
          number: n + 1,
          date: day,
          partyId: party.id,
          partyName: party.name,
          lines,
        };
        return { doc, calc: totals(doc, '29') };
      };
      const insertDocs = (type: 'sale' | 'purchase', count: number) => {
        for (let start = 0; start < count; start += 250) {
          const batch = Array.from({ length: Math.min(250, count - start) }, (_, k) =>
            make(type, start + k),
          );
          const rows = db
            .insert(s.txns)
            .values(
              batch.map(({ doc, calc }) => ({
                firmId: firm,
                type,
                partyId: doc.partyId,
                prefix: doc.prefix,
                number: doc.number,
                date: doc.date,
                placeOfSupply: '29',
                status: 'posted',
                subtotal: calc.gross,
                discount: 0,
                taxable: calc.taxable,
                cgst: calc.cgst,
                sgst: calc.sgst,
                igst: calc.igst,
                cess: calc.cess,
                charges: 0,
                roundOff: calc.roundOff,
                total: calc.total,
                metadata: JSON.stringify({ document: doc, firmState: '29' }),
                createdAt: at,
                updatedAt: at,
              })),
            )
            .returning({ id: s.txns.id })
            .all();
          rows.forEach(({ id }, k) => {
            const { doc, calc } = batch[k];
            const lineRows = db
              .insert(s.txnLines)
              .values(
                doc.lines.map((l, p) => ({
                  ...l,
                  txnId: id,
                  discount: calc.lines[p].discount,
                  taxable: calc.lines[p].taxable,
                  cgst: calc.lines[p].cgst,
                  sgst: calc.lines[p].sgst,
                  igst: calc.lines[p].igst,
                  cess: calc.lines[p].cess,
                  total: calc.lines[p].total,
                  position: p,
                })),
              )
              .returning({ id: s.txnLines.id })
              .all();
            db.insert(s.stockLedger)
              .values(
                doc.lines.map((l, p) => ({
                  firmId: firm,
                  itemId: l.itemId!,
                  txnId: id,
                  txnLineId: lineRows[p].id,
                  date: doc.date,
                  qty: type === 'sale' ? -l.qty : l.qty,
                  value: (type === 'sale' ? -7000 : 7000) * l.qty,
                  reason: type,
                })),
              )
              .run();
            // Two in three bills are paid in cash at once.
            if ((start + k) % 3)
              db.insert(s.txnPayments)
                .values({
                  txnId: id,
                  accountId: cash,
                  amount: calc.total,
                  direction: type === 'sale' ? 1 : -1,
                  reference: '',
                })
                .run();
          });
        }
      };
      insertDocs('sale', SALES);
      insertDocs('purchase', PURCHASES);
    })();
    timings['seed (one-time)'] = Math.round(performance.now() - seedStart);

    const reports = reportService(context, () => '2026-11-14');
    const year = { from: '2025-04-01', to: '2026-03-31' };
    time('masters.items (2,000)', () => masters.items(firm));
    time('masters.parties (1,000)', () => masters.parties(firm));
    const list = time('sales.list sale (10,000)', () => sales.list(firm, 'sale'));
    expect(list).toHaveLength(SALES);
    time('sales.get one invoice', () => sales.get(firm, list[5000].id));
    time('dashboard', () => dashboard(context, firm));
    time('report P&L (FY)', () => reports.run(firm, 'profitLoss', year));
    time('report GSTR-1 (FY)', () => reports.run(firm, 'gstr1', year));
    time('report stock summary', () =>
      reports.run(firm, 'stockSummary', { ...year, asOn: '2026-11-14' }),
    );
    time('report all parties + ageing', () =>
      reports.run(firm, 'allParties', { ...year, asOn: '2026-11-14' }),
    );
    time('report sale register (FY)', () => reports.run(firm, 'sale', year));
    const rctx = { context, firm, filters: { ...year, asOn: '2026-11-14' }, today: '2026-11-14' };
    time('· taxLines (FY)', () => taxLines(rctx, ['sale', 'sale_return'], year.from, year.to));
    time('· valuation', () => valuation(rctx, '2026-11-14'));
    const items = masters.items(firm);
    const party = masters.parties(firm)[0];
    let n = SALES;
    time(
      'save a new invoice (incl. disk write)',
      () =>
        sales.save(firm, null, {
          ...blankDocument('sale', '29'),
          prefix: 'INV-',
          number: ++n,
          date: '2026-11-14',
          partyId: party.id,
          partyName: party.name,
          lines: [lineFromItem(items[1], 1800, 2), lineFromItem(items[2], 500, 1)],
        }),
      5,
    );
    time('next invoice number', () => sales.next(firm, 'sale', 'INV-'));
    console.table(timings);
    context.sqlite.close();
    // Response-time targets for this fixture.
    expect(timings['dashboard']).toBeLessThan(1000);
    expect(timings['report P&L (FY)']).toBeLessThan(1000);
    expect(timings['report GSTR-1 (FY)']).toBeLessThan(1000);
    expect(timings['report stock summary']).toBeLessThan(1000);
    expect(timings['sales.list sale (10,000)']).toBeLessThan(500);
    expect(timings['save a new invoice (incl. disk write)']).toBeLessThan(1000);
  },
  20 * 60 * 1000,
);
