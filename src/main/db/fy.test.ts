import { afterEach, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from './sales-fixture.test-helper';
import { fyRepository } from './fy';
import { partyBalances } from '../services/reports/parties';
import { stockItems } from '../services/reports/stock';
import { fyStarting } from '../../shared/fy';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  // "Today" is May 2027, so 2026-27 (Apr 2026 – Mar 2027) can be closed.
  const fy = fyRepository(f.context, () => '2027-05-10');
  const backup = join(f.path, 'before-close.bsbk');
  writeFileSync(backup, 'backup');
  return { ...f, fy, backup, year: fyStarting(2026) };
}

it('closes a finished year, carries balances forward and locks the old dates', async () => {
  const { sales, firm, document, receipt, fy, backup, year, context, repo } = await setup();
  const bill = sales.save(firm.id, null, document(3));
  sales.receipt(firm.id, receipt(5000));
  const before = fy.preview(firm.id, year);
  expect(before.parties).toHaveLength(1);
  expect(before.totals.receivable).toBe(bill.total - 5000);
  expect(before.unpaid.map((u) => u.id)).toEqual([bill.id]);
  expect(() => fy.close(firm.id, 2026, join(tmpdir(), 'missing.bsbk'), false)).toThrow(
    'backupFirst',
  );
  expect(() => fy.close(firm.id, 2027, backup, false)).toThrow('validation'); // not over yet
  const snapshot = fy.close(firm.id, 2026, backup, true);
  expect(fy.status(firm.id)).toMatchObject({ closedThrough: '2027-03-31', next: null });
  // Next year's opening = this year's closing (balances are derived from the ledger).
  const ctx = { context, firm: firm.id, filters: { from: '', to: '' }, today: '2027-05-10' };
  expect(partyBalances(ctx, year.end).filter((p) => p.balance !== 0)).toMatchObject(
    snapshot.parties.map((p) => ({ id: p.id, balance: p.balance })),
  );
  const stock = stockItems(ctx, year.end);
  expect(stock.reduce((n, i) => n + i.value, 0)).toBe(snapshot.totals.stockValue);
  expect(stock[0].qty).toBe(17);
  // Locked: no new, edited, cancelled or deleted documents in the closed year.
  expect(() => sales.save(firm.id, null, { ...document(), number: 2 })).toThrow('closedYear');
  expect(() => sales.save(firm.id, bill.id, document(1))).toThrow('closedYear');
  expect(() => sales.action(firm.id, bill.id, 'cancel')).toThrow('closedYear');
  expect(() => sales.action(firm.id, bill.id, 'delete')).toThrow('closedYear');
  // Moving an old bill into the new year is also blocked (its old date is locked).
  expect(() => sales.save(firm.id, bill.id, { ...document(1), date: '2027-04-02' })).toThrow(
    'closedYear',
  );
  // The new year is open, and numbering restarts with a year tag.
  expect(repo.getSettings(firm.id)['prefix.sale']).toBe('INV-2728-');
  const fresh = sales.save(firm.id, null, {
    ...document(1),
    prefix: 'INV-2728-',
    number: 1,
    date: '2027-04-02',
  });
  expect(fresh.number).toBe(1);
  // The lock date cannot be moved through the ordinary settings screen.
  expect(() => repo.set(firm.id, 'booksClosedThrough', '')).toThrow('validation');
});

it('reopens the last closed year so mistakes can be corrected', async () => {
  const { sales, firm, document, fy, backup } = await setup();
  const bill = sales.save(firm.id, null, document(1));
  fy.close(firm.id, 2026, backup, false);
  expect(() => sales.action(firm.id, bill.id, 'cancel')).toThrow('closedYear');
  expect(fy.reopen(firm.id)).toBe('');
  sales.action(firm.id, bill.id, 'cancel');
  expect(sales.get(firm.id, bill.id).status).toBe('cancelled');
  expect(fy.status(firm.id).history[0].reopenedAt).toBeTruthy();
  expect(() => fy.reopen(firm.id)).toThrow('validation');
});
