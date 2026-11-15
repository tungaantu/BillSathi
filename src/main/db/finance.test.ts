import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { setupSales } from './sales-fixture.test-helper';
import { financeRepository } from './finance';
import { blankBank } from '../../shared/finance';
import { blankDocument, blankLine, documentLineFromItem } from '../../shared/sales';
import * as s from './schema';
const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  const finance = financeRepository(f.context);
  const bank = finance.saveAccount(f.firm.id, null, {
    ...blankBank(),
    name: 'Trade Bank',
    openingBalance: 100000,
    openingDate: '2026-04-01',
    accountNumber: '123456789',
    isDefault: true,
  });
  return { ...f, finance, bank };
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
it('posts inter-state inclusive purchases, exact stock cost and linked debit note reversal', async () => {
  const f = await setup(),
    { sales, firm, item, masters, document } = f;
  const bill = sales.save(firm.id, null, {
    ...document(),
    type: 'purchase',
    prefix: 'PUR-',
    placeOfSupply: '27',
    lines: [{ ...documentLineFromItem('purchase', item, 1800, 2), price: 7080, inclusive: true }],
    supplierBillNo: 'SUP-2',
    supplierBillDate: '2026-11-09',
  });
  expect(bill.total).toBe(14160);
  expect(bill.balance).toBe(14160);
  expect(f.context.db.select().from(s.txns).where(eq(s.txns.id, bill.id)).get()).toMatchObject({
    cgst: 0,
    sgst: 0,
    igst: 2160,
    taxable: 12000,
  });
  expect(masters.parties(firm.id)[0].balance).toBe(-14160);
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 22, value: 132000 });
  const debit = sales.save(firm.id, null, {
    ...bill,
    type: 'purchase_return',
    prefix: 'DN-',
    refTxnId: bill.id,
    lines: [{ ...bill.lines[0], qty: 1 }],
  });
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 21, value: 126000 });
  expect(sales.get(firm.id, bill.id).balance).toBe(7080);
  sales.action(firm.id, debit.id, 'delete');
  expect(masters.items(firm.id)[0].qty).toBe(22);
  sales.action(firm.id, debit.id, 'restore');
  expect(masters.items(firm.id)[0].qty).toBe(21);
});
it('allocates payment out oldest-first, supports manual allocation and restores the payable after deletion', async () => {
  const { sales, firm, document, receipt, masters } = await setup();
  const first = sales.save(firm.id, null, {
    ...document(),
    type: 'purchase',
    prefix: 'PUR-',
    date: '2026-11-01',
  });
  const second = sales.save(firm.id, null, {
    ...document(),
    type: 'purchase',
    prefix: 'PUR-',
    number: 2,
  });
  const payment = sales.receipt(firm.id, {
    ...receipt(13000),
    type: 'payment_out',
    prefix: 'PAY-',
    discount: 1000,
  });
  expect(sales.get(firm.id, first.id).balance).toBe(0);
  expect(sales.get(firm.id, second.id).balance).toBe(9600);
  expect(masters.parties(firm.id)[0].balance).toBe(-9600);
  sales.action(firm.id, payment, 'delete');
  expect(sales.get(firm.id, first.id).balance).toBe(11800);
  sales.receipt(firm.id, {
    ...receipt(1000),
    type: 'payment_out',
    prefix: 'PAY-',
    number: 2,
    auto: false,
    allocations: [{ invoiceId: second.id, amount: 1000 }],
  });
  expect(sales.get(firm.id, first.id).balance).toBe(11800);
  expect(sales.get(firm.id, second.id).balance).toBe(10800);
});
it('bounces an allocated receipt cheque and reopens its invoice without changing bank cash', async () => {
  const { sales, finance, firm, document, receipt, bank, masters } = await setup();
  const bill = sales.save(firm.id, null, document());
  const account = sales.accounts(firm.id).find((a) => a.type === 'cheque')!;
  sales.receipt(firm.id, {
    ...receipt(11800),
    accountId: account.id,
    reference: 'CH-123',
    chequeDate: '2026-11-12',
  });
  const cheque = finance.cheques(firm.id)[0];
  expect(sales.get(firm.id, bill.id).balance).toBe(0);
  finance.cheque(firm.id, cheque.id, 'deposited', '2026-11-12', bank);
  expect(finance.accounts(firm.id).find((a) => a.id === bank)?.balance).toBe(100000);
  finance.cheque(firm.id, cheque.id, 'bounced', '2026-11-13', null);
  expect(sales.get(firm.id, bill.id).balance).toBe(11800);
  expect(masters.parties(firm.id)[0].balance).toBe(11800);
  expect(finance.accounts(firm.id).find((a) => a.id === bank)?.balance).toBe(100000);
  expect(() => finance.cheque(firm.id, cheque.id, 'cleared', '2026-11-14', bank)).toThrow();
});
it('reverses only the bounced portion of split payments and credits cleared cheques to the chosen bank', async () => {
  const { sales, finance, firm, document, cash, bank, masters } = await setup();
  const chequeAccount = sales.accounts(firm.id).find((a) => a.type === 'cheque')!;
  const bill = sales.save(firm.id, null, {
    ...document(),
    payments: [
      { accountId: cash.id, amount: 1800, reference: '' },
      { accountId: chequeAccount.id, amount: 10000, reference: 'SPLIT' },
    ],
  });
  finance.cheque(firm.id, finance.cheques(firm.id)[0].id, 'bounced', '2026-11-10', null);
  expect(sales.get(firm.id, bill.id)).toMatchObject({ received: 1800, balance: 10000 });
  expect(masters.parties(firm.id)[0].balance).toBe(10000);
  expect(masters.ledger(firm.id, bill.partyId!, '', '').at(-1)?.balance).toBe(10000);
  sales.receipt(firm.id, {
    type: 'payment_in',
    attachmentIds: [],
    reference: 'SECOND',
    chequeDate: '',
    partyId: bill.partyId!,
    accountId: chequeAccount.id,
    amount: 10000,
    discount: 0,
    prefix: 'R-',
    number: 1,
    date: '2026-11-10',
    description: '',
    allocations: [],
    auto: true,
  });
  const next = finance.cheques(firm.id).find((c) => c.number === 'SECOND')!;
  finance.cheque(firm.id, next.id, 'cleared', '2026-11-11', bank);
  expect(finance.accounts(firm.id).find((a) => a.id === bank)?.balance).toBe(110000);
  expect(finance.statement(firm.id, bank).at(-1)?.date).toBe('2026-11-11');
});
it('keeps total cash and bank money constant across deposit, withdrawal and bank transfer', async () => {
  const { finance, firm, cash, bank } = await setup();
  const second = finance.saveAccount(firm.id, null, { ...blankBank(), name: 'Savings' });
  const total = () =>
    finance
      .accounts(firm.id)
      .filter((a) => ['cash', 'bank'].includes(a.type))
      .reduce((n, a) => n + a.balance, 0);
  const initial = total();
  for (const [fromId, toId] of [
    [bank, cash.id],
    [cash.id, second],
    [second, bank],
  ])
    finance.transfer(firm.id, {
      fromId,
      toId,
      amount: 10000,
      date: '2026-11-10',
      description: 'Move',
    });
  expect(total()).toBe(initial);
  expect(finance.statement(firm.id, cash.id).at(-1)?.balance).toBe(0);
  expect(() =>
    finance.transfer(firm.id, {
      fromId: bank,
      toId: bank,
      amount: 100,
      date: '2026-11-10',
      description: '',
    }),
  ).toThrow();
});
it('posts GST expenses without stock, and splits an EMI into principal and interest expense', async () => {
  const { finance, sales, context, firm, bank, masters } = await setup();
  const category = sales.categories(firm.id, 'expense')[0].id;
  const expense = sales.save(firm.id, null, {
    ...blankDocument('expense', '29'),
    categoryId: category,
    lines: [{ ...blankLine(), name: 'Repairs', price: 10000, taxBps: 1800 }],
    payments: [{ accountId: bank, amount: 11800, reference: '' }],
  });
  expect(expense.total).toBe(11800);
  expect(
    context.db.select().from(s.stockLedger).where(eq(s.stockLedger.txnId, expense.id)).all(),
  ).toHaveLength(0);
  const loan = finance.loan(firm.id, {
    name: 'Trade loan',
    partyId: null,
    amount: 200000,
    interestBps: 1200,
    accountId: bank,
    date: '2026-11-10',
  });
  finance.emi(firm.id, {
    loanId: loan,
    principal: 10000,
    interest: 2000,
    accountId: bank,
    date: '2026-11-11',
    description: 'First EMI',
  });
  expect(finance.loans(firm.id)[0].balance).toBe(190000);
  expect(finance.accounts(firm.id).find((a) => a.id === bank)?.balance).toBe(276200);
  expect(sales.list(firm.id, 'expense').map((e) => e.total)).toContain(2000);
  expect(masters.parties(firm.id)[0].balance).toBe(0);
});
it('supports partial purchase order receipts, rejects excess and reopens quantities after deletion', async () => {
  const { sales, firm, document, masters } = await setup();
  const order = sales.save(firm.id, null, {
    ...document(5),
    type: 'purchase_order',
    prefix: 'PO-',
  });
  expect(masters.items(firm.id)[0].qty).toBe(20);
  const bill = sales.convert(firm.id, order.id, 'purchase', [2]);
  expect(sales.get(firm.id, order.id).status).toBe('partially_received');
  expect(() => sales.convert(firm.id, order.id, 'purchase', [4])).toThrow();
  sales.convert(firm.id, order.id, 'purchase', [3]);
  expect(sales.get(firm.id, order.id).status).toBe('closed');
  sales.action(firm.id, bill.id, 'delete');
  expect(sales.get(firm.id, order.id).status).toBe('partially_received');
});
it('rolls back all rows if a cheque is missing its reference, and preserves item metadata on price updates', async () => {
  const { sales, firm, document, context, repo, masters, item } = await setup();
  const cheque = sales.accounts(firm.id).find((a) => a.type === 'cheque')!;
  expect(() =>
    sales.save(firm.id, null, {
      ...document(),
      type: 'purchase',
      payments: [{ accountId: cheque.id, amount: 1000, reference: '' }],
    }),
  ).toThrow();
  expect(sales.list(firm.id)).toHaveLength(0);
  expect(context.db.select().from(s.txnLines).all()).toHaveLength(0);
  repo.set(firm.id, 'updatePurchasePrice', true);
  const before = masters.items(firm.id)[0];
  sales.save(firm.id, null, {
    ...document(),
    type: 'purchase',
    lines: [{ ...document().lines[0], price: 7000, inclusive: true }],
  });
  expect(masters.items(firm.id)[0]).toMatchObject({
    id: item.id,
    purchasePrice: 7000,
    purchaseInclusive: true,
    conversion: before.conversion,
    openingPrice: before.openingPrice,
  });
});
it('edits payment receipts atomically without allocating their own previous payments twice', async () => {
  const { sales, firm, document, receipt, masters } = await setup();
  const bill = sales.save(firm.id, null, { ...document(), type: 'purchase' });
  const payment = sales.receipt(firm.id, { ...receipt(11800), type: 'payment_out' });
  const original = sales.getReceipt(firm.id, payment);
  sales.receipt(firm.id, { ...original, amount: 5000 }, payment);
  expect(sales.get(firm.id, bill.id).balance).toBe(6800);
  expect(masters.ledger(firm.id, bill.partyId!, '', '').at(-1)?.balance).toBe(-6800);
  expect(() =>
    sales.receipt(
      firm.id,
      {
        ...original,
        amount: 12000,
        auto: false,
        allocations: [{ invoiceId: bill.id, amount: 12000 }],
      },
      payment,
    ),
  ).toThrow();
  expect(sales.get(firm.id, bill.id).balance).toBe(6800);
  expect(sales.getReceipt(firm.id, payment).amount).toBe(5000);
});
it('rolls nested financial work back with the outer transaction', async () => {
  const { context, finance, firm, cash, bank } = await setup();
  expect(() =>
    context.sqlite.transaction(() => {
      finance.transfer(firm.id, {
        fromId: bank,
        toId: cash.id,
        amount: 10000,
        date: '2026-11-10',
        description: '',
      });
      throw new Error('stop');
    })(),
  ).toThrow('stop');
  expect(finance.accounts(firm.id).find((a) => a.id === bank)?.balance).toBe(100000);
  expect(context.db.select().from(s.txnPayments).all()).toHaveLength(0);
});
