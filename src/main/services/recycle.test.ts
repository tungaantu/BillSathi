import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { setupSales } from '../db/sales-fixture.test-helper';
import * as s from '../db/schema';
import { recycleService } from './recycle';
import { auditList } from './audit-read';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  return { ...f, bin: recycleService(f.context) };
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    rmSync(f.path, { recursive: true, force: true });
  }
});
const actions = (f: Awaited<ReturnType<typeof setup>>) =>
  auditList(f.context, f.firm.id, {}).map((a) => `${a.entity}:${a.action}`);

describe('recycle bin', () => {
  it('lists deleted documents of every type; balances and stock ignore them; restore brings them back with an audit entry', async () => {
    const f = await setup();
    const sale = f.sales.save(f.firm.id, null, f.document(2));
    f.sales.receipt(f.firm.id, f.receipt(1000));
    const [receipt] = f.sales.list(f.firm.id, 'payment_in');
    expect(f.masters.parties(f.firm.id)[0].balance).toBe(23600 - 1000);
    expect(f.masters.items(f.firm.id)[0].qty).toBe(18);
    expect(f.bin.list(f.firm.id)).toEqual([]);

    f.sales.action(f.firm.id, receipt.id, 'delete');
    f.sales.action(f.firm.id, sale.id, 'delete');
    const rows = f.bin.list(f.firm.id);
    expect(rows.map((r) => r.type).sort()).toEqual(['payment_in', 'sale']);
    expect(rows.every((r) => r.daysLeft === 30)).toBe(true);
    expect(f.masters.parties(f.firm.id)[0].balance).toBe(0);
    expect(f.masters.items(f.firm.id)[0].qty).toBe(20);

    f.bin.restore(f.firm.id, sale.id);
    expect(f.bin.list(f.firm.id).map((r) => r.type)).toEqual(['payment_in']);
    expect(f.masters.parties(f.firm.id)[0].balance).toBe(23600);
    expect(f.masters.items(f.firm.id)[0].qty).toBe(18);
    expect(actions(f)).toContain('txns:restore');
  });

  it('refuses to restore when a live document has taken the number', async () => {
    const f = await setup();
    const sale = f.sales.save(f.firm.id, null, f.document(1));
    f.sales.action(f.firm.id, sale.id, 'delete');
    // Normally the unique index reserves the number; simulate legacy data where it was released.
    f.context.db.run(sql`DROP INDEX txn_number`);
    f.context.db.run(
      sql`INSERT INTO txns (firm_id,type,prefix,number,date,status,total,created_at,updated_at,metadata)
          SELECT firm_id,type,prefix,number,date,status,total,created_at,updated_at,metadata FROM txns WHERE id=${sale.id}`,
    );
    f.context.db.run(sql`UPDATE txns SET deleted_at=NULL WHERE id<>${sale.id}`);
    expect(() => f.bin.restore(f.firm.id, sale.id)).toThrow('duplicate');
    expect(f.bin.list(f.firm.id)).toHaveLength(1);
  });

  it('restoring a sale is blocked when the stock is gone (negative stock rule)', async () => {
    const f = await setup();
    const sale = f.sales.save(f.firm.id, null, f.document(15));
    f.sales.action(f.firm.id, sale.id, 'delete');
    f.sales.save(f.firm.id, null, { ...f.document(15), number: 2 });
    expect(() => f.bin.restore(f.firm.id, sale.id)).toThrow('negativeStock');
    expect(f.bin.list(f.firm.id)).toHaveLength(1);
  });

  it('deletes forever with its lines, payments and stock rows, and records it', async () => {
    const f = await setup();
    const sale = f.sales.save(f.firm.id, null, {
      ...f.document(1),
      payments: [{ accountId: f.cash.id, amount: 500, reference: '' }],
    });
    expect(() => f.bin.purge(f.firm.id, sale.id)).toThrow('notFound');
    f.sales.action(f.firm.id, sale.id, 'delete');
    f.bin.purge(f.firm.id, sale.id);
    for (const table of [s.txns, s.txnLines, s.txnPayments, s.stockLedger])
      expect(
        f.context.db
          .select()
          .from(table)
          .where(table === s.txns ? eq(s.txns.id, sale.id) : undefined)
          .all().length,
      ).toBe(table === s.stockLedger ? 1 : 0);
    expect(actions(f)).toContain('txns:purge');
    expect(f.bin.list(f.firm.id)).toEqual([]);
  });

  it('auto-purges only items deleted more than 30 days ago', async () => {
    const f = await setup();
    const old = f.sales.save(f.firm.id, null, f.document(1));
    const recent = f.sales.save(f.firm.id, null, { ...f.document(1), number: 2 });
    f.sales.action(f.firm.id, old.id, 'delete');
    f.sales.action(f.firm.id, recent.id, 'delete');
    f.context.db
      .update(s.txns)
      .set({ deletedAt: '2026-09-01T00:00:00.000Z' })
      .where(eq(s.txns.id, old.id))
      .run();
    expect(f.bin.purgeExpired(new Date('2026-11-10T00:00:00Z'))).toBe(1);
    expect(f.bin.list(f.firm.id).map((r) => r.id)).toEqual([recent.id]);
    expect(f.bin.empty(f.firm.id)).toBe(1);
    expect(f.bin.list(f.firm.id)).toEqual([]);
  });
});

describe('audit trail setting', () => {
  it('stops writing audit rows when turned off (default is on), but keeps the setting change itself', async () => {
    const f = await setup();
    const before = auditList(f.context, f.firm.id, {}).length;
    f.sales.save(f.firm.id, null, f.document(1));
    expect(auditList(f.context, f.firm.id, {}).length).toBeGreaterThan(before);
    f.repo.set(f.firm.id, 'auditTrail', false);
    const off = auditList(f.context, f.firm.id, {}).length;
    f.sales.save(f.firm.id, null, { ...f.document(1), number: 2 });
    expect(auditList(f.context, f.firm.id, {}).length).toBe(off);
    expect(auditList(f.context, f.firm.id, { entity: 'settings' })[0].action).toBe('update');
    f.repo.set(f.firm.id, 'auditTrail', true);
    f.sales.save(f.firm.id, null, { ...f.document(1), number: 3 });
    expect(auditList(f.context, f.firm.id, { entity: 'txns' })).toHaveLength(2);
  });
  it('filters by date, entity and action', async () => {
    const f = await setup();
    f.sales.save(f.firm.id, null, f.document(1));
    expect(auditList(f.context, f.firm.id, { entity: 'txns', action: 'create' })).toHaveLength(1);
    expect(auditList(f.context, f.firm.id, { entity: 'txns', action: 'delete' })).toHaveLength(0);
    expect(auditList(f.context, f.firm.id, { from: '2999-01-01' })).toHaveLength(0);
    expect(auditList(f.context, f.firm.id, { to: '2000-01-01' })).toHaveLength(0);
    expect(auditList(f.context, f.firm.id, { limit: 1 })).toHaveLength(1);
  });
});
