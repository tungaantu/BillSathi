import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from './sales-fixture.test-helper';
import * as s from './schema';
import { recurringInvoices } from '../services/recurring-invoices';
import { loyaltyBalance } from './customer-loyalty';
import { customerMessages } from '../services/customer-messages';
const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  for (const k of ['orders', 'challan', 'proforma', 'challanReturns'])
    f.repo.set(f.firm.id, k, true);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
it('partially delivers an order then bills its challans without deducting stock twice', async () => {
  const { sales, masters, firm, document, cash, context } = await setup();
  const order = sales.save(firm.id, null, {
    ...document(10),
    type: 'sale_order',
    prefix: 'SO-',
    payments: [{ accountId: cash.id, amount: 10000, reference: 'advance' }],
  });
  expect(masters.items(firm.id)[0].qty).toBe(20);
  expect(masters.parties(firm.id)[0].balance).toBe(-10000);
  const challan = sales.convert(firm.id, order.id, 'delivery_challan', [4]);
  expect(sales.get(firm.id, order.id).status).toBe('partially_delivered');
  expect(masters.items(firm.id)[0].qty).toBe(16);
  const invoice = sales.convert(firm.id, challan.id, 'sale', [2]);
  expect(invoice).toMatchObject({ received: 10000, balance: 13600 });
  expect(masters.items(firm.id)[0].qty).toBe(16);
  expect(masters.parties(firm.id)[0].balance).toBe(13600);
  sales.convert(firm.id, challan.id, 'sale');
  expect(sales.get(firm.id, challan.id).status).toBe('closed');
  sales.convert(firm.id, order.id, 'sale', [6]);
  expect(sales.get(firm.id, order.id).status).toBe('closed');
  expect(masters.items(firm.id)[0].qty).toBe(10);
  expect(
    context.sqlite.prepare('SELECT balance FROM account_balances WHERE id=?').get(cash.id)?.balance,
  ).toBe(10000);
  expect(() => sales.convert(firm.id, order.id, 'sale', [1])).toThrow('validation');
});
it('prevents over-conversion and releases quantities on child cancellation/deletion', async () => {
  const { sales, masters, firm, document } = await setup();
  const order = sales.save(firm.id, null, { ...document(5), type: 'sale_order', prefix: 'SO-' });
  expect(() => sales.convert(firm.id, order.id, 'sale', [6])).toThrow('overpayment');
  expect(sales.list(firm.id, 'sale')).toHaveLength(0);
  const invoice = sales.convert(firm.id, order.id, 'sale', [3]);
  expect(() => sales.convert(firm.id, order.id, 'sale', [3])).toThrow('overpayment');
  sales.action(firm.id, invoice.id, 'delete');
  expect(sales.get(firm.id, order.id).status).toBe('open');
  sales.convert(firm.id, order.id, 'sale', [5]);
  expect(() => sales.action(firm.id, invoice.id, 'restore')).toThrow();
  expect(masters.items(firm.id)[0].qty).toBe(15);
});
it('returns unbilled challan quantities and respects the stock setting', async () => {
  const { sales, masters, repo, firm, document } = await setup();
  const challan = sales.save(firm.id, null, {
    ...document(4),
    type: 'delivery_challan',
    prefix: 'DC-',
  });
  sales.convert(firm.id, challan.id, 'challan_return', [1]);
  expect(masters.items(firm.id)[0].qty).toBe(17);
  sales.convert(firm.id, challan.id, 'sale', [3]);
  expect(masters.items(firm.id)[0].qty).toBe(17);
  expect(masters.parties(firm.id)[0].balance).toBe(35400);
  repo.set(firm.id, 'challanStock', false);
  const second = sales.save(firm.id, null, {
    ...document(2),
    type: 'delivery_challan',
    prefix: 'DC-',
    number: 2,
  });
  expect(masters.items(firm.id)[0].qty).toBe(17);
  sales.convert(firm.id, second.id, 'sale');
  expect(masters.items(firm.id)[0].qty).toBe(15);
});
it('converts proforma exactly once without prior stock or balance effects', async () => {
  const { sales, masters, firm, document } = await setup();
  const doc = sales.save(firm.id, null, { ...document(), type: 'proforma', prefix: 'PRO-' });
  expect(masters.parties(firm.id)[0].balance).toBe(0);
  sales.convert(firm.id, doc.id, 'sale');
  expect(masters.items(firm.id)[0].qty).toBe(19);
  expect(() => sales.convert(firm.id, doc.id, 'sale')).toThrow('validation');
});
it('creates missed recurring drafts once, without accounting effects, then posts a draft', async () => {
  const { sales, masters, context, firm, document } = await setup();
  const source = sales.save(firm.id, null, document());
  const recurring = recurringInvoices(context);
  recurring.create(firm.id, {
    sourceId: source.id,
    frequency: 'monthly',
    day: 31,
    start: '2026-01-31',
    end: '2026-03-31',
    mode: 'draft',
  });
  expect(recurring.run(firm.id, '2026-04-10')).toBe(3);
  expect(recurring.run(firm.id, '2026-04-10')).toBe(0);
  expect(masters.items(firm.id)[0].qty).toBe(19);
  const draft = sales.list(firm.id).find((r) => r.status === 'draft')!;
  sales.save(firm.id, draft.id, sales.get(firm.id, draft.id));
  expect(masters.items(firm.id)[0].qty).toBe(18);
  const rule = recurring.list(firm.id)[0];
  recurring.pause(firm.id, rule.id, true);
  expect(recurring.list(firm.id)[0].paused).toBe(true);
});
it('earns, redeems and reverses points on invoice deletion, cancellation and returns', async () => {
  const { sales, repo, context, firm, party, document } = await setup();
  repo.set(firm.id, 'loyalty', true);
  const source = sales.save(firm.id, null, {
    ...document(10),
    lines: document(10).lines.map((l) => ({ ...l, taxBps: 0 })),
  });
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(10);
  const redeemed = sales.save(firm.id, null, {
    ...document(),
    number: 2,
    loyaltyRedeem: 5,
    loyaltyDiscount: 500,
  });
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(6);
  sales.action(firm.id, redeemed.id, 'delete');
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(10);
  sales.action(firm.id, redeemed.id, 'restore');
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(6);
  sales.action(firm.id, redeemed.id, 'cancel');
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(10);
  sales.save(firm.id, null, {
    ...document(5),
    type: 'sale_return',
    prefix: 'CN-',
    refTxnId: source.id,
    lines: document(5).lines.map((l) => ({ ...l, taxBps: 0 })),
  });
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(5);
  expect(
    context.db
      .select()
      .from(s.loyaltyEntries)
      .all()
      .some((e) => e.kind.startsWith('reverse')),
  ).toBe(true);
});
it('earns paid-basis points as linked receipts arrive and reverses them on receipt cancellation', async () => {
  const { sales, repo, context, firm, party, document, receipt } = await setup();
  repo.set(firm.id, 'loyalty', true);
  repo.set(firm.id, 'loyaltyBasis', 'paid');
  sales.save(firm.id, null, document(2));
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(0);
  const payment = sales.receipt(firm.id, receipt(15000));
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(1);
  sales.action(firm.id, payment, 'cancel');
  expect(loyaltyBalance(context, firm.id, party.id)).toBe(0);
});
it('builds payment ageing and service reminders from the most recent sale', async () => {
  const { sales, masters, context, firm, item, document } = await setup();
  masters.saveItem(firm.id, item.id, { ...item, serviceReminderDays: 10 });
  sales.save(firm.id, null, { ...document(), date: '2026-10-01', dueDate: '2026-10-15' });
  const messages = customerMessages(context),
    reminders = messages.reminders(firm.id, '2026-11-10');
  expect(reminders).toHaveLength(2);
  expect(reminders.find((r) => r.kind === 'payment')).toMatchObject({ age: 26, amount: 11800 });
  expect(reminders.find((r) => r.kind === 'service')?.due).toBe('2026-10-11');
  expect(messages.message(firm.id, sales.list(firm.id)[0].id).message).toContain('INV-0001');
});
