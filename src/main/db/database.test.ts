import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { openDatabase, type DatabaseContext } from './index';
import { repositories } from './repositories';
import { dashboard } from '../services/dashboard';
import * as s from './schema';
import type { FirmInput } from '../../shared/types';
const input: FirmInput = {
  name: 'Test Shop',
  phone: '9876543210',
  category: 'grocery',
  stateCode: '29',
  gstin: '',
  pan: '',
  address: '',
  email: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  demo: false,
};
const directories: string[] = [];
const contexts: DatabaseContext[] = [];
async function setup() {
  const path = mkdtempSync(join(tmpdir(), 'billsathi-db-test-'));
  directories.push(path);
  const context = await openDatabase(path);
  contexts.push(context);
  return { context, path, repo: repositories(context) };
}
afterEach(() => {
  for (const context of contexts.splice(0)) context.sqlite.close();
  for (const path of directories.splice(0)) {
    if (!path.startsWith(join(tmpdir(), 'billsathi-db-test-')))
      throw new Error('Unexpected test directory');
    rmSync(path, { recursive: true, force: true });
  }
});
describe('SQLite persistence, schema and repositories', () => {
  it('restores in-memory state after a failed disk write, then accepts later writes', async () => {
    const { repo, path } = await setup();
    const firm = repo.create(input);
    mkdirSync(join(path, 'billsathi.db.tmp'));
    expect(() => repo.update(firm.id, { ...input, name: 'Must not persist' })).toThrow();
    expect(repo.get(firm.id).name).toBe('Test Shop');
    rmdirSync(join(path, 'billsathi.db.tmp'));
    repo.update(firm.id, { ...input, name: 'Safe update' });
    const reopened = await openDatabase(path);
    contexts.push(reopened);
    expect(repositories(reopened).get(firm.id).name).toBe('Safe update');
  });
  it('rejects fractional paise, over-precise quantities and cross-business references', async () => {
    const { context, repo } = await setup();
    const a = repo.create(input),
      b = repo.create(input);
    expect(() =>
      context.sqlite.transaction(() =>
        context.db.insert(s.items).values({ firmId: a.id, name: 'Invalid', salePrice: 1.5 }).run(),
      )(),
    ).toThrow();
    const item = context.sqlite.transaction(() =>
      context.db
        .insert(s.items)
        .values({ firmId: a.id, name: 'Valid', salePrice: 100 })
        .returning()
        .get(),
    )();
    expect(() =>
      context.sqlite.transaction(() =>
        context.db
          .insert(s.stockLedger)
          .values({ firmId: a.id, itemId: item.id, date: '2026-01-01', qty: 1.0001, value: 1 })
          .run(),
      )(),
    ).toThrow();
    expect(() =>
      context.sqlite.transaction(() =>
        context.db
          .insert(s.stockLedger)
          .values({ firmId: b.id, itemId: item.id, date: '2026-01-01', qty: 1, value: 100 })
          .run(),
      )(),
    ).toThrow();
    expect(() =>
      context.sqlite.transaction(() =>
        context.db.insert(s.items).values({ firmId: 999999, name: 'Orphan' }).run(),
      )(),
    ).toThrow();
  });
  it('migrates and seeds the complete core schema idempotently', async () => {
    const { context, path, repo } = await setup();
    expect(repo.units()).toHaveLength(30);
    expect(context.db.select().from(s.taxRates).all()).toHaveLength(17);
    expect(context.db.select().from(s.states).all()).toHaveLength(37);
    for (const table of [
      'firms',
      'settings',
      'party_groups',
      'parties',
      'item_categories',
      'units',
      'unit_conversions',
      'items',
      'godowns',
      'stock_ledger',
      'batches',
      'serials',
      'tax_rates',
      'payment_accounts',
      'txns',
      'txn_lines',
      'txn_payments',
      'payment_links',
      'cheques',
      'loans',
      'expense_categories',
      'additional_charges',
      'audit_log',
      'attachments',
    ])
      expect(
        context.sqlite.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table),
      ).toBeDefined();
    const reopened = await openDatabase(path);
    contexts.push(reopened);
    expect(repositories(reopened).units()).toHaveLength(30);
    expect(readFileSync(join(path, 'billsathi.db')).subarray(0, 15).toString()).toBe(
      'SQLite format 3',
    );
  });
  it('creates a business, Cash, categories, presets and audit entries together', async () => {
    const { context, repo } = await setup();
    const firm = repo.create({ ...input, category: 'pharmacy' });
    expect(repo.getSettings(firm.id).batches).toBe(true);
    expect(context.db.select().from(s.paymentAccounts).all()).toMatchObject([
      { type: 'cash', openingBalance: 0 },
    ]);
    expect(context.db.select().from(s.expenseCategories).all()).toHaveLength(6);
    expect(context.db.select().from(s.auditLog).all()).toHaveLength(8);
    expect(dashboard(context, firm.id)).toMatchObject({
      receive: 0,
      pay: 0,
      cash: 0,
      stock: 0,
      todaySale: 0,
      checklist: { profile: true, item: false, party: false, invoice: false, backup: false },
    });
  });
  it('survives a full database close and reopen', async () => {
    const { context, repo, path } = await setup();
    const firm = repo.create(input);
    repo.set(firm.id, 'language', 'hi');
    repo.update(firm.id, { ...input, name: 'Updated Shop' });
    context.sqlite.close();
    contexts.splice(contexts.indexOf(context), 1);
    const reopened = await openDatabase(path);
    contexts.push(reopened);
    expect(repositories(reopened).get(firm.id).name).toBe('Updated Shop');
    expect(repositories(reopened).getSettings(firm.id).language).toBe('hi');
  });
  it('rolls back all writes on failure and keeps the repository usable', async () => {
    const { context, repo, path } = await setup();
    const firm = repo.create(input);
    expect(() =>
      context.sqlite.transaction(() => {
        context.db
          .update(s.firms)
          .set({ name: 'Lost change' })
          .where(eq(s.firms.id, firm.id))
          .run();
        throw new Error('forced');
      })(),
    ).toThrow('forced');
    expect(repo.get(firm.id).name).toBe('Test Shop');
    repo.set(firm.id, 'theme', 'dark');
    const reopened = await openDatabase(path);
    contexts.push(reopened);
    expect(repositories(reopened).get(firm.id).name).toBe('Test Shop');
    expect(repositories(reopened).getSettings(firm.id).theme).toBe('dark');
  });
  it('rejects invalid and cross-state GSTIN data and unknown settings', async () => {
    const { repo } = await setup();
    expect(() => repo.create({ ...input, phone: '12' })).toThrow();
    expect(() => repo.create({ ...input, gstin: '27AAPFU0939F1ZV' })).toThrow();
    const firm = repo.create(input);
    expect(() => repo.set(firm.id, 'zoom', 200)).toThrow();
    expect(() => repo.set(firm.id, 'unknown', true)).toThrow();
  });
  it('isolates settings and dashboard counts between firms, soft-removes demo masters', async () => {
    const { context, repo } = await setup();
    const demo = repo.create({ ...input, demo: true });
    const fresh = repo.create(input);
    repo.set(demo.id, 'language', 'hi');
    expect(repo.getSettings(fresh.id).language).toBe('en');
    expect(dashboard(context, demo.id).checklist.item).toBe(true);
    expect(dashboard(context, fresh.id).checklist.item).toBe(false);
    expect(repo.clearDemo(demo.id).demo).toBe(false);
    expect(dashboard(context, demo.id).checklist).toMatchObject({ item: false, party: false });
    expect(context.db.select().from(s.items).all()[0].deletedAt).toBeTruthy();
    expect(repo.restoreDemo(demo.id).demo).toBe(true);
    expect(dashboard(context, demo.id).checklist).toMatchObject({ item: true, party: true });
  });
  it('derives balances from posted ledgers, ignores drafts, cancelled and deleted entries', async () => {
    const { context, repo } = await setup();
    const firm = repo.create(input);
    context.sqlite.transaction(() => {
      const party = context.db
        .insert(s.parties)
        .values({ firmId: firm.id, name: 'Customer', openingBalance: 1000 })
        .returning()
        .get();
      const account = context.db.select().from(s.paymentAccounts).get()!;
      const sale = context.db
        .insert(s.txns)
        .values({
          firmId: firm.id,
          partyId: party.id,
          type: 'sale',
          prefix: 'INV-',
          number: 1,
          date: new Date().toLocaleDateString('en-CA'),
          status: 'posted',
          total: 10000,
          createdAt: 'now',
          updatedAt: 'now',
        })
        .returning()
        .get();
      context.db
        .insert(s.txnPayments)
        .values({ txnId: sale.id, accountId: account.id, amount: 4000, direction: 1 })
        .run();
      const payment = context.db
        .insert(s.txns)
        .values({
          firmId: firm.id,
          partyId: party.id,
          type: 'payment_in',
          number: 1,
          date: '2026-01-01',
          status: 'posted',
          total: 2000,
          createdAt: 'now',
          updatedAt: 'now',
        })
        .returning()
        .get();
      context.db
        .insert(s.txnPayments)
        .values({ txnId: payment.id, accountId: account.id, amount: 2000, direction: 1 })
        .run();
      context.db
        .insert(s.paymentLinks)
        .values({ paymentTxnId: payment.id, invoiceTxnId: sale.id, amount: 2000 })
        .run();
      for (const [index, status] of ['draft', 'cancelled', 'posted'].entries())
        context.db
          .insert(s.txns)
          .values({
            firmId: firm.id,
            partyId: party.id,
            type: 'sale',
            number: index + 2,
            date: '2026-01-01',
            status,
            total: 99999,
            deletedAt: index === 2 ? 'removed' : null,
            createdAt: 'now',
            updatedAt: 'now',
          })
          .run();
      const item = context.db
        .insert(s.items)
        .values({ firmId: firm.id, name: 'Notebook', purchasePrice: 3000 })
        .returning()
        .get();
      context.db
        .insert(s.stockLedger)
        .values({
          firmId: firm.id,
          itemId: item.id,
          date: '2026-01-01',
          qty: 2,
          value: 6000,
          reason: 'opening',
        })
        .run();
    })();
    expect(dashboard(context, firm.id)).toMatchObject({
      receive: 5000,
      pay: 0,
      cash: 6000,
      stock: 6000,
      todaySale: 10000,
    });
  });
});
