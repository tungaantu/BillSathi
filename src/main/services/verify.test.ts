import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { setupSales } from '../db/sales-fixture.test-helper';
import { applyVerifyFix, runVerify } from './verify';
import { auditList } from './audit-read';
import type { VerifyId } from '../../shared/safety-api';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  const sale = f.sales.save(f.firm.id, null, f.document(2));
  return { ...f, sale };
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    rmSync(f.path, { recursive: true, force: true });
  }
});
type F = Awaited<ReturnType<typeof setup>>;
const check = (f: F, id: VerifyId) =>
  runVerify(f.context, f.firm.id).checks.find((c) => c.id === id)!;
const unchecked = (f: F, run: () => void) => {
  f.context.db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    run();
  } finally {
    f.context.db.run(sql`PRAGMA foreign_keys = ON`);
  }
};

describe('Verify My Data', () => {
  it('reports a clean business as all green', async () => {
    const f = await setup();
    f.sales.receipt(f.firm.id, f.receipt(1000));
    const report = runVerify(f.context, f.firm.id);
    expect(report.checks.map((c) => c.id)).toEqual([
      'integrity',
      'orphanLines',
      'totals',
      'allocations',
      'numbering',
      'negativeStock',
      'balances',
    ]);
    expect(report.checks.map((c) => c.status)).toEqual(Array(7).fill('ok'));
  });

  it('finds lines that belong to no transaction', async () => {
    const f = await setup();
    unchecked(f, () =>
      f.context.db.run(sql`INSERT INTO txn_lines (txn_id,name,qty) VALUES (9999,'Ghost line',1)`),
    );
    expect(check(f, 'orphanLines')).toMatchObject({
      status: 'error',
      count: 1,
      details: ['#2 Ghost line'],
    });
    expect(check(f, 'integrity').status).toBe('error');
  });

  it('finds totals that disagree with the lines, and fixes them safely with an audit entry', async () => {
    const f = await setup();
    f.context.db.run(sql`UPDATE txns SET total = total + 500, cgst = 0 WHERE id = ${f.sale.id}`);
    f.context.db.run(sql`UPDATE txn_lines SET total = 1 WHERE txn_id = ${f.sale.id}`);
    const bad = check(f, 'totals');
    expect(bad).toMatchObject({ status: 'error', count: 1, fixable: true });
    expect(bad.details[0]).toContain('INV-0001'.replace('INV-', f.sale.prefix));
    const report = applyVerifyFix(f.context, f.firm.id, 'totals');
    expect(report.checks.find((c) => c.id === 'totals')).toMatchObject({
      status: 'ok',
      fixable: false,
    });
    expect(f.sales.get(f.firm.id, f.sale.id).total).toBe(23600);
    const log = auditList(f.context, f.firm.id, { entity: 'txns', action: 'update' });
    expect(log).toHaveLength(1);
    expect(log[0].after).toContain('verifyData');
  });

  it('refuses fixes for checks that cannot be repaired safely', async () => {
    const f = await setup();
    expect(() => applyVerifyFix(f.context, f.firm.id, 'numbering')).toThrow('validation');
  });

  it('finds payments that settle more than the invoice or the receipt', async () => {
    const f = await setup();
    f.sales.receipt(f.firm.id, f.receipt(1000));
    f.context.db.run(sql`UPDATE payment_links SET amount = 99999999`);
    const found = check(f, 'allocations');
    expect(found.status).toBe('error');
    expect(found.count).toBe(2);
  });

  it('warns about gaps and flags duplicate document numbers', async () => {
    const f = await setup();
    const second = f.sales.save(f.firm.id, null, { ...f.document(1), number: 2 });
    const third = f.sales.save(f.firm.id, null, { ...f.document(1), number: 3 });
    f.context.db.run(sql`UPDATE txns SET number = 5 WHERE id = ${third.id}`);
    const gap = check(f, 'numbering');
    expect(gap.status).toBe('warn');
    expect(gap.details.every((d) => d.endsWith('(missing)'))).toBe(true);
    expect(gap.count).toBe(2);
    f.context.db.run(sql`DROP INDEX txn_number`);
    f.context.db.run(sql`UPDATE txns SET number = 1 WHERE id = ${second.id}`);
    const dup = check(f, 'numbering');
    expect(dup.status).toBe('error');
    expect(dup.details[0]).toContain('duplicate');
  });

  it('warns about items with negative stock', async () => {
    const f = await setup();
    f.context.db.run(
      sql`INSERT INTO stock_ledger (firm_id,item_id,date,qty,value) VALUES (${f.firm.id},${f.item.id},'2026-11-10',-500,0)`,
    );
    expect(check(f, 'negativeStock')).toMatchObject({
      status: 'warn',
      count: 1,
      details: ['Book (-482)'],
    });
  });

  it('compares party and account balances with a fresh recomputation from the ledgers', async () => {
    const f = await setup();
    f.sales.receipt(f.firm.id, f.receipt(1000));
    expect(check(f, 'balances').status).toBe('ok');
    f.context.db.run(sql`DROP VIEW party_balances`);
    f.context.db.run(
      sql`CREATE VIEW party_balances AS SELECT id, firm_id, 12345 AS balance FROM parties`,
    );
    f.context.db.run(sql`DROP VIEW account_balances`);
    f.context.db.run(
      sql`CREATE VIEW account_balances AS SELECT id, firm_id, type, 1 AS balance FROM payment_accounts`,
    );
    const found = check(f, 'balances');
    expect(found.status).toBe('error');
    expect(found.details[0]).toContain('Customer');
    expect(found.count).toBeGreaterThanOrEqual(2);
  });

  it('ignores deleted documents', async () => {
    const f = await setup();
    f.context.db.run(sql`UPDATE txns SET total = total + 500, deleted_at = '2026-11-10T00:00:00Z'`);
    expect(check(f, 'totals').status).toBe('ok');
  });
});

describe('Verify My Data with the full demo business', () => {
  it('has no errors on purchases, expenses, transfers, cheques and loans', async () => {
    const f = await setupSales();
    fixtures.push(f);
    const demo = f.repo.create({ ...f.repo.get(f.firm.id), name: 'Demo Full', demo: true });
    const report = runVerify(f.context, demo.id);
    expect(report.checks.filter((c) => c.status === 'error')).toEqual([]);
    expect(
      f.context.sqlite.prepare('SELECT COUNT(*) n FROM txns WHERE firm_id = ?').get(demo.id)?.n,
    ).toBeGreaterThan(5);
    expect(report.checks.filter((c) => c.status === 'error')).toEqual([]);
  });
});
