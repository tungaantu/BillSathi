import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { setupSales } from './sales-fixture.test-helper';
import { openDatabase } from './index';
import { salesRepository } from './sales';
import * as s from './schema';
const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
it('posts split payments, line taxes, stock, audit and party/account balances in one save', async () => {
  const { sales, masters, context, firm, document, cash, upi } = await setup();
  const saved = sales.save(firm.id, null, {
    ...document(2),
    payments: [
      { accountId: cash.id, amount: 1000, reference: '' },
      { accountId: upi.id, amount: 5000, reference: 'UPI-1' },
    ],
  });
  expect(saved).toMatchObject({
    total: 23600,
    received: 6000,
    balance: 17600,
    paymentStatus: 'partial',
  });
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 18, value: 108000 });
  expect(masters.parties(firm.id)[0].balance).toBe(17600);
  expect(
    context.sqlite.prepare('SELECT balance FROM account_balances WHERE id=?').get(upi.id)?.balance,
  ).toBe(5000);
  expect(context.db.select().from(s.txnLines).all()[0]).toMatchObject({
    cgst: 1800,
    sgst: 1800,
    total: 23600,
  });
  expect(
    context.db.select().from(s.auditLog).where(eq(s.auditLog.entity, 'txns')).all(),
  ).toHaveLength(1);
});
it('persists and edits invoices without duplicating stock or payments, retaining number reservations', async () => {
  const { sales, masters, context, firm, document, path } = await setup();
  const first = sales.save(firm.id, null, document(2));
  sales.save(firm.id, first.id, { ...first, lines: document(3).lines });
  expect(masters.items(firm.id)[0].qty).toBe(17);
  expect(masters.parties(firm.id)[0].balance).toBe(35400);
  const reopened = await openDatabase(path);
  try {
    expect(salesRepository(reopened).get(firm.id, first.id).lines[0].qty).toBe(3);
  } finally {
    reopened.sqlite.close();
  }
  sales.action(firm.id, first.id, 'delete');
  expect(masters.items(firm.id)[0].qty).toBe(20);
  expect(sales.next(firm.id, 'sale', 'INV-')).toBe(2);
  expect(() => sales.save(firm.id, null, document())).toThrow('duplicate');
  sales.action(firm.id, first.id, 'restore');
  expect(masters.items(firm.id)[0].qty).toBe(17);
  expect(context.db.select().from(s.txnLines).all()).toHaveLength(1);
});
it('allocates receipt and discount oldest-first, updates invoices and preserves cash separately', async () => {
  const { sales, masters, context, firm, document, receipt, cash } = await setup();
  const a = sales.save(firm.id, null, { ...document(), date: '2026-11-01' });
  const b = sales.save(firm.id, null, { ...document(), number: 2, date: '2026-11-02' });
  const r = sales.receipt(firm.id, { ...receipt(15000), discount: 1000 });
  expect(sales.get(firm.id, a.id)).toMatchObject({
    received: 11800,
    balance: 0,
    paymentStatus: 'paid',
  });
  expect(sales.get(firm.id, b.id)).toMatchObject({
    received: 4200,
    balance: 7600,
    paymentStatus: 'partial',
  });
  expect(masters.parties(firm.id)[0].balance).toBe(7600);
  expect(
    context.sqlite.prepare('SELECT balance FROM account_balances WHERE id=?').get(cash.id)?.balance,
  ).toBe(15000);
  expect(() => sales.action(firm.id, a.id, 'delete')).toThrow('linked');
  expect(() => sales.save(firm.id, a.id, a)).toThrow('linked');
  sales.action(firm.id, r, 'cancel');
  expect(sales.get(firm.id, a.id).balance).toBe(11800);
  sales.action(firm.id, r, 'reopen');
  expect(sales.get(firm.id, a.id).balance).toBe(0);
});
it('validates manual allocation, foreign parties, discount advances and duplicate links', async () => {
  const { sales, firm, document, receipt } = await setup();
  const a = sales.save(firm.id, null, document());
  expect(() =>
    sales.receipt(firm.id, {
      ...receipt(1000),
      auto: false,
      allocations: [{ invoiceId: a.id, amount: 1001 }],
    }),
  ).toThrow('allocation');
  expect(() => sales.receipt(firm.id, { ...receipt(12000), discount: 1000 })).toThrow('allocation');
  const id = sales.receipt(firm.id, {
    ...receipt(1000),
    auto: false,
    allocations: [{ invoiceId: a.id, amount: 500 }],
  });
  expect(sales.get(firm.id, a.id).received).toBe(500);
  expect(sales.own(firm.id, id).total).toBe(1000);
});
it('returns stock and credits the source bill, prevents repeated returns, reverses refunds', async () => {
  const { sales, masters, firm, document, cash } = await setup();
  const invoice = sales.save(firm.id, null, document(2));
  const returned = sales.save(firm.id, null, {
    ...document(),
    type: 'sale_return',
    prefix: 'CN-',
    refTxnId: invoice.id,
    payments: [{ accountId: cash.id, amount: 1800, reference: 'refund' }],
  });
  expect(masters.items(firm.id)[0].qty).toBe(19);
  expect(masters.parties(firm.id)[0].balance).toBe(13600);
  expect(sales.get(firm.id, invoice.id).balance).toBe(11800);
  expect(() =>
    sales.save(firm.id, null, { ...returned, number: 2, lines: document(2).lines }),
  ).toThrow('overpayment');
  expect(() => sales.action(firm.id, invoice.id, 'cancel')).toThrow('linked');
  sales.action(firm.id, returned.id, 'cancel');
  expect(masters.items(firm.id)[0].qty).toBe(18);
  expect(masters.parties(firm.id)[0].balance).toBe(23600);
});
it('holds estimates without stock or balance effects and converts exactly once atomically', async () => {
  const { sales, masters, firm, document } = await setup();
  const estimate = sales.save(firm.id, null, { ...document(2), type: 'estimate', prefix: 'EST-' });
  expect(masters.items(firm.id)[0].qty).toBe(20);
  expect(masters.parties(firm.id)[0].balance).toBe(0);
  const invoice = sales.convert(firm.id, estimate.id, 'sale');
  expect(invoice).toMatchObject({
    refTxnId: estimate.id,
    type: 'sale',
    prefix: 'INV-',
    number: 1,
    total: 23600,
  });
  expect(masters.items(firm.id)[0].qty).toBe(18);
  expect(sales.get(firm.id, estimate.id).status).toBe('converted');
  expect(() => sales.convert(firm.id, estimate.id, 'sale')).toThrow('validation');
});
it('rolls back every table on late attachment failure and handles aggregate negative stock', async () => {
  const { sales, masters, context, firm, document } = await setup();
  const before = context.db.select().from(s.auditLog).all().length;
  expect(() => sales.save(firm.id, null, { ...document(), attachmentIds: [9999] })).toThrow(
    'validation',
  );
  expect(sales.list(firm.id)).toHaveLength(0);
  expect(context.db.select().from(s.txnLines).all()).toHaveLength(0);
  expect(context.db.select().from(s.auditLog).all()).toHaveLength(before);
  expect(masters.items(firm.id)[0].qty).toBe(20);
  expect(() =>
    sales.save(firm.id, null, {
      ...document(),
      lines: [...document(11).lines, ...document(11).lines],
    }),
  ).toThrow('negativeStock');
  // Repository references still work after connection replacement on rollback.
  expect(sales.save(firm.id, null, document()).number).toBe(1);
});
it('cancels and restores invoices, and blocks restore when the released stock was consumed', async () => {
  const { sales, masters, firm, document } = await setup();
  const a = sales.save(firm.id, null, document(15));
  sales.action(firm.id, a.id, 'cancel');
  expect(masters.items(firm.id)[0].qty).toBe(20);
  sales.save(firm.id, null, { ...document(15), number: 2 });
  expect(() => sales.action(firm.id, a.id, 'reopen')).toThrow('negativeStock');
  expect(sales.get(firm.id, a.id).status).toBe('cancelled');
});

it('restores original cost and tax after master changes and retains cancelled state when restoring from bin', async () => {
  const { sales, masters, repo, firm, document } = await setup();
  const invoice = sales.save(firm.id, null, document(2));
  sales.action(firm.id, invoice.id, 'cancel');
  const item = masters.items(firm.id)[0];
  masters.saveItem(firm.id, item.id, { ...item, purchasePrice: 9000 });
  repo.update(firm.id, { ...repo.get(firm.id), stateCode: '27' });
  sales.action(firm.id, invoice.id, 'reopen');
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 18, value: 108000 });
  expect(sales.get(firm.id, invoice.id)).toMatchObject({ firmState: '29', total: 23600 });
  sales.action(firm.id, invoice.id, 'cancel');
  sales.action(firm.id, invoice.id, 'delete');
  sales.action(firm.id, invoice.id, 'restore');
  expect(sales.get(firm.id, invoice.id).status).toBe('cancelled');
  expect(masters.items(firm.id)[0].qty).toBe(20);
});
it('blocks cancelling a return after returned stock has been sold again', async () => {
  const { sales, firm, document } = await setup();
  const source = sales.save(firm.id, null, document(20));
  const returned = sales.save(firm.id, null, {
    ...document(2),
    type: 'sale_return',
    prefix: 'CN-',
    refTxnId: source.id,
  });
  sales.save(firm.id, null, { ...document(2), number: 2 });
  expect(() => sales.action(firm.id, returned.id, 'cancel')).toThrow('negativeStock');
  expect(sales.get(firm.id, returned.id).status).toBe('posted');
});
it('treats cash received separately from payment discount and requires full payment for walk-ins', async () => {
  const { sales, firm, document, receipt, cash } = await setup();
  expect(() => sales.save(firm.id, null, { ...document(), cash: true, partyId: null })).toThrow(
    'overpayment',
  );
  const invoice = sales.save(firm.id, null, document());
  const r = sales.receipt(firm.id, { ...receipt(11000), discount: 800 });
  expect(sales.list(firm.id, 'payment_in')[0]).toMatchObject({
    id: r,
    total: 11800,
    received: 11000,
    balance: 0,
    paymentStatus: 'paid',
  });
  expect(sales.get(firm.id, invoice.id).balance).toBe(0);
  const walkin = sales.save(firm.id, null, {
    ...document(),
    number: 2,
    cash: true,
    partyId: null,
    partyName: '',
    payments: [{ accountId: cash.id, amount: 11800, reference: '' }],
  });
  expect(walkin.balance).toBe(0);
});
it('keeps converted quotation status final and gates sale-order conversion by setting', async () => {
  const { sales, repo, masters, firm, document } = await setup();
  const estimate = sales.save(firm.id, null, { ...document(), type: 'estimate', prefix: 'EST-' });
  expect(() => sales.convert(firm.id, estimate.id, 'sale_order')).toThrow('validation');
  expect(sales.get(firm.id, estimate.id).status).toBe('open');
  repo.set(firm.id, 'orders', true);
  sales.convert(firm.id, estimate.id, 'sale_order');
  expect(masters.items(firm.id)[0].qty).toBe(20);
  expect(() => sales.action(firm.id, estimate.id, 'close')).toThrow('validation');
  expect(() => sales.action(firm.id, estimate.id, 'cancel')).toThrow('validation');
});

it('uses original inventory cost for linked returns after an item cost change', async () => {
  const { sales, masters, firm, document } = await setup();
  const invoice = sales.save(firm.id, null, document(2));
  const item = masters.items(firm.id)[0];
  masters.saveItem(firm.id, item.id, { ...item, purchasePrice: 9000 });
  sales.save(firm.id, null, {
    ...document(),
    type: 'sale_return',
    prefix: 'CN-',
    refTxnId: invoice.id,
  });
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 19, value: 114000 });
});
