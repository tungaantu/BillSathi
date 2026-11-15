import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from './sales-fixture.test-helper';
import { paymentsRepository } from './payments';
import { paymentConfigStore } from '../services/upi/config';
import { collectService } from '../services/upi/collect';
import { statementService } from '../services/upi/statement';
import type { FetchLike } from '../services/upi/youpi-client';
import type { PaymentConfigInput } from '../../shared/payments-api';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});

/** Scripted YouPI gateway keyed by "METHOD path". */
function gateway(routes: Record<string, () => { status?: number; body?: unknown } | Error>) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    calls.push(key);
    const reply = routes[key]?.() ?? { status: 404, body: { error: 'nope' } };
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  };
  return { calls, fetchImpl };
}
const box = {
  available: () => true,
  encrypt: (v: string) => `enc1:${Buffer.from(v).toString('base64')}`,
  decrypt: (v: string) => Buffer.from(v.slice(5), 'base64').toString(),
};
const youpiConfig: PaymentConfigInput = {
  payeeName: '',
  youpiEnabled: true,
  baseUrl: 'http://localhost:6100',
  merchantId: 'm-1',
  apiKey: 'secret-key',
  webhookEnabled: false,
  webhookPort: 6390,
};

async function setup(fetchImpl?: FetchLike) {
  const f = await setupSales();
  fixtures.push(f);
  const store = paymentConfigStore(f.context, box, fetchImpl);
  const collect = collectService(f.context, store);
  const invoice = f.sales.save(f.firm.id, null, f.document(2)); // total 23600
  return { ...f, store, collect, invoice, repo: paymentsRepository(f.context) };
}

it('collects by manual UTR: QR, Payment-In with the UTR as reference, allocation and a UPI badge', async () => {
  const { collect, sales, firm, invoice, repo } = await setup();
  const started = await collect.start(firm.id, invoice.id, 10000);
  if (!started.ok) throw new Error('start failed');
  const c = started.collection;
  expect(c).toMatchObject({ provider: 'manual', amount: 10000, upiId: 'test@upi', hasParty: true });
  expect(c.link).toMatch(
    /^upi:\/\/pay\?pa=test@upi&pn=Sales%20Test&am=100\.00&cu=INR&tn=INV-0001&tr=BS1T\d+A1$/,
  );
  expect(c.qr).toMatch(/^data:image\/png;base64,/);

  expect(collect.record(firm.id, c.id, { utr: '12345', last4: '' })).toEqual({
    ok: false,
    reason: 'badUtr',
  });
  const recorded = collect.record(firm.id, c.id, { utr: '401537805904', last4: '4821' });
  if (!recorded.ok) throw new Error('record failed');

  const after = sales.get(firm.id, invoice.id);
  expect(after).toMatchObject({ received: 10000, balance: 13600 });
  const row = sales.list(firm.id, 'payment_in').find((p) => p.id === recorded.paymentTxnId);
  expect(row).toMatchObject({ total: 10000 });
  expect(repo.confirmation(recorded.paymentTxnId)).toMatchObject({
    state: 'recorded',
    utr: '401537805904',
    payerLast4: '4821',
    source: 'manual',
  });
  expect(repo.badges(firm.id)).toEqual({
    payments: { [recorded.paymentTxnId]: 'upi' },
    invoices: { [invoice.id]: 'upi' },
  });
  expect(repo.collection(firm.id, c.id).status).toBe('recorded');
  // The same UTR cannot be recorded twice, and a recorded request is closed.
  const second = await collect.start(firm.id, invoice.id, 5000);
  if (!second.ok) throw new Error('start failed');
  expect(collect.record(firm.id, second.collection.id, { utr: '401537805904', last4: '' })).toEqual(
    {
      ok: false,
      reason: 'duplicateUtr',
    },
  );
  expect(collect.record(firm.id, c.id, { utr: '401537805999', last4: '' })).toEqual({
    ok: false,
    reason: 'notRecordable',
  });
});
it('refuses a bad amount, and an invoice that is already paid', async () => {
  const { collect, firm, invoice } = await setup();
  expect(await collect.start(firm.id, invoice.id, 0)).toEqual({ ok: false, reason: 'badAmount' });
  expect(await collect.start(firm.id, invoice.id, 23601)).toEqual({
    ok: false,
    reason: 'badAmount',
  });
  const started = await collect.start(firm.id, invoice.id, 23600);
  if (!started.ok) throw new Error('start failed');
  collect.record(firm.id, started.collection.id, { utr: '401537805904', last4: '' });
  expect(await collect.start(firm.id, invoice.id, 100)).toEqual({
    ok: false,
    reason: 'notPayable',
  });
});

it('resumes a live QR for the same amount and starts a new attempt for another amount', async () => {
  const { collect, firm, invoice } = await setup();
  const a = await collect.start(firm.id, invoice.id, 10000);
  const b = await collect.start(firm.id, invoice.id, 10000);
  const c = await collect.start(firm.id, invoice.id, 5000);
  if (!a.ok || !b.ok || !c.ok) throw new Error('start failed');
  expect(b.collection.id).toBe(a.collection.id);
  expect(c.collection.id).not.toBe(a.collection.id);
  expect(c.collection.ref).not.toBe(a.collection.ref);
});

it('uses YouPI: creates the order, sees the bank alert, records as Seen, then Confirmed after reconciliation', async () => {
  let status: Record<string, unknown> = { status: 'ACTIVE', settlementState: 'NOT_APPLICABLE' };
  const gw = gateway({
    'POST /api/v1/payments': () => ({
      status: 201,
      body: {
        paymentId: 'pay-1',
        orderId: 'BS-1-1-1',
        amountPaise: '10000',
        status: 'INITIATED',
        checkoutUrl: 'http://localhost:7000/checkout/pay-1',
      },
    }),
    'GET /api/v1/checkout/pay-1/state': () => ({
      body: { payeeVpa: 'gateway@okaxis', payeeName: 'Gateway Shop' },
    }),
    'GET /api/v1/payments/pay-1': () => ({
      body: {
        paymentId: 'pay-1',
        orderId: 'BS-1-1-1',
        amountPaise: '10000',
        method: 'UPI',
        ...status,
      },
    }),
  });
  const { collect, store, firm, invoice, repo, sales } = await setup(gw.fetchImpl);
  store.save(firm.id, youpiConfig);
  expect(store.get(firm.id)).toMatchObject({
    youpiEnabled: true,
    hasApiKey: true,
    merchantId: 'm-1',
  });
  expect(JSON.stringify(repo.readSettings(firm.id))).not.toContain('secret-key');

  const started = await collect.start(firm.id, invoice.id, 10000);
  if (!started.ok) throw new Error('start failed');
  const c = started.collection;
  expect(c).toMatchObject({
    provider: 'youpi',
    upiId: 'gateway@okaxis',
    payeeName: 'Gateway Shop',
    checkoutUrl: 'http://localhost:7000/checkout/pay-1',
    youpiProblem: null,
  });
  expect(repo.collection(firm.id, c.id).orderId).toBe(`BS-${firm.id}-${invoice.id}-1`);

  expect((await collect.poll(firm.id, c.id)).gateway).toBe('waiting');
  status = { status: 'OBSERVED_SUCCESS', settlementState: 'NOT_RECONCILED', utr: '401537805904' };
  const seen = await collect.poll(firm.id, c.id);
  expect(seen.gateway).toBe('seen');
  expect(seen.collection).toMatchObject({ status: 'seen', seenUtr: '401537805904' });
  // Seen is only an alert: nothing is recorded until the owner clicks.
  expect(sales.get(firm.id, invoice.id).received).toBe(0);
  expect(repo.alert(firm.id)).toMatchObject({ seenRecorded: 0, waitingToRecord: 1 });

  const recorded = collect.record(firm.id, c.id, { utr: '401537805904', last4: '' });
  if (!recorded.ok) throw new Error('record failed');
  expect(repo.confirmation(recorded.paymentTxnId)).toMatchObject({
    state: 'observed',
    source: 'youpi',
    providerPaymentId: 'pay-1',
  });
  expect(repo.badges(firm.id).payments[recorded.paymentTxnId]).toBe('seen');
  expect(repo.alert(firm.id)).toEqual({
    seenRecorded: 1,
    seenRecordedAmount: 10000,
    waitingToRecord: 0,
  });

  expect(await collect.sync(firm.id)).toEqual({ checked: 1, confirmed: 0 });
  status = { status: 'RECONCILED', settlementState: 'RECONCILED' };
  expect(await collect.sync(firm.id)).toEqual({ checked: 1, confirmed: 1 });
  expect(repo.confirmation(recorded.paymentTxnId)).toMatchObject({
    state: 'confirmed',
    confirmedBy: 'youpi',
  });
  expect(repo.badges(firm.id)).toMatchObject({
    payments: { [recorded.paymentTxnId]: 'confirmed' },
    invoices: { [invoice.id]: 'confirmed' },
  });
  expect(repo.alert(firm.id).seenRecorded).toBe(0);
});

it('records a seen payment without a UTR, but rejects a malformed one', async () => {
  const gw = gateway({
    'POST /api/v1/payments': () => ({
      status: 201,
      body: {
        paymentId: 'pay-2',
        orderId: 'x',
        amountPaise: '5000',
        status: 'INITIATED',
        checkoutUrl: 'http://localhost:7000/c',
      },
    }),
    'GET /api/v1/checkout/pay-2/state': () => ({ body: {} }),
    'GET /api/v1/payments/pay-2': () => ({
      body: {
        paymentId: 'pay-2',
        amountPaise: '5000',
        status: 'OBSERVED_SUCCESS',
        settlementState: 'NOT_RECONCILED',
      },
    }),
  });
  const { collect, store, firm, invoice } = await setup(gw.fetchImpl);
  store.save(firm.id, youpiConfig);
  const started = await collect.start(firm.id, invoice.id, 5000);
  if (!started.ok) throw new Error('start failed');
  expect(started.collection.upiId).toBe('test@upi');
  await collect.poll(firm.id, started.collection.id);
  expect(collect.record(firm.id, started.collection.id, { utr: '12', last4: '' })).toEqual({
    ok: false,
    reason: 'badUtr',
  });
  expect(collect.record(firm.id, started.collection.id, { utr: '', last4: '' }).ok).toBe(true);
});

it('falls back to manual collection when YouPI is unreachable or rejects the keys', async () => {
  const down = gateway({ 'POST /api/v1/payments': () => new TypeError('fetch failed') });
  const a = await setup(down.fetchImpl);
  a.store.save(a.firm.id, youpiConfig);
  const unreachable = await a.collect.start(a.firm.id, a.invoice.id, 1000);
  expect(unreachable.ok && unreachable.collection).toMatchObject({
    provider: 'manual',
    youpiProblem: 'unreachable',
  });
  const denied = gateway({
    'POST /api/v1/payments': () => ({ status: 401, body: { error: 'bad key' } }),
  });
  const b = await setup(denied.fetchImpl);
  b.store.save(b.firm.id, youpiConfig);
  const result = await b.collect.start(b.firm.id, b.invoice.id, 1000);
  expect(result.ok && result.collection.youpiProblem).toBe('auth');
});

it('retries with a new attempt number when YouPI reports an amount mismatch', async () => {
  let n = 0;
  const gw = gateway({
    'POST /api/v1/payments': () =>
      n++ === 0
        ? { status: 409, body: { code: 'ORDER_AMOUNT_MISMATCH', error: 'ORDER_AMOUNT_MISMATCH' } }
        : {
            status: 201,
            body: {
              paymentId: 'pay-3',
              orderId: 'BS-1-1-2',
              amountPaise: '1000',
              status: 'INITIATED',
              checkoutUrl: '',
            },
          },
    'GET /api/v1/checkout/pay-3/state': () => ({ body: {} }),
  });
  const { collect, store, firm, invoice, repo } = await setup(gw.fetchImpl);
  store.save(firm.id, youpiConfig);
  const started = await collect.start(firm.id, invoice.id, 1000);
  if (!started.ok) throw new Error('start failed');
  expect(started.collection.provider).toBe('youpi');
  expect(repo.collection(firm.id, started.collection.id)).toMatchObject({
    attempt: 2,
    orderId: `BS-${firm.id}-${invoice.id}-2`,
  });
});

it('applies a verified webhook to the matching order only', async () => {
  const gw = gateway({
    'POST /api/v1/payments': () => ({
      status: 201,
      body: {
        paymentId: 'pay-4',
        orderId: 'o',
        amountPaise: '1000',
        status: 'INITIATED',
        checkoutUrl: '',
      },
    }),
    'GET /api/v1/checkout/pay-4/state': () => ({ body: {} }),
  });
  const { collect, store, firm, invoice, repo } = await setup(gw.fetchImpl);
  store.save(firm.id, youpiConfig);
  const started = await collect.start(firm.id, invoice.id, 1000);
  if (!started.ok) throw new Error('start failed');
  const orderId = repo.collection(firm.id, started.collection.id).orderId!;
  const payload = (over: Record<string, unknown>) => ({
    event: 'OBSERVED_SUCCESS',
    settlementState: 'NOT_RECONCILED',
    orderId,
    amountPaise: 1000,
    utr: '401537805904',
    paymentId: 'pay-4',
    deliveryId: 'd',
    timestamp: Date.now(),
    verificationTag: '',
    verificationLevel: 1,
    raw: {},
    ...over,
  });
  expect(collect.applyWebhook(firm.id, payload({ orderId: 'someone-else' }))).toBe(false);
  expect(collect.applyWebhook(firm.id, payload({ amountPaise: 999 }))).toBe(false);
  expect(collect.applyWebhook(firm.id, payload({}))).toBe(true);
  expect(repo.collection(firm.id, started.collection.id)).toMatchObject({
    status: 'seen',
    seenUtr: '401537805904',
  });
});

it('confirms Payment-Ins from a bank statement and shows them as Confirmed', async () => {
  const { collect, store, sales, firm, invoice, repo, context, upi } = await setup();
  const statements = statementService(context, store, collect);
  const first = await collect.start(firm.id, invoice.id, 10000);
  if (!first.ok) throw new Error('start failed');
  const one = collect.record(firm.id, first.collection.id, { utr: '401537805904', last4: '' });
  const second = await collect.start(firm.id, invoice.id, 5000);
  if (!second.ok) throw new Error('start failed');
  const two = collect.record(firm.id, second.collection.id, { utr: '412345678901', last4: '' });
  // A UPI Payment-In entered by hand, with no UTR anywhere.
  const manual = sales.receipt(firm.id, {
    type: 'payment_in',
    attachmentIds: [],
    reference: '',
    chequeDate: '',
    partyId: invoice.partyId!,
    amount: 2000,
    discount: 0,
    accountId: upi.id,
    date: '2026-11-10',
    prefix: 'RCPT-',
    number: sales.next(firm.id, 'payment_in', 'RCPT-'),
    description: '',
    allocations: [],
    auto: true,
  });
  if (!one.ok || !two.ok) throw new Error('record failed');
  expect(repo.badges(firm.id).payments[manual]).toBe('upi');

  const csv = [
    'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.',
    '10/11/2026,"UPI-RAHUL-rahul@okhdfcbank-HDFC0001234-401537805904-PAY","",,100.00',
    '11/11/2026,"UPI/412345678901/Payment from PhonePe","",,50.00',
    '10/11/2026,"NEFT SOMEONE","",,20.00',
    '10/11/2026,"CASH DEPOSIT","",,777.00',
  ].join('\n');
  const { parseCsv } = await import('../services/upi/statement-parse');
  const preview = statements.preview(parseCsv(csv), 'march.csv');
  expect(preview.mapping).toEqual({ date: 0, narration: 1, credit: 4, debit: 3, utr: 2 });
  const result = statements.match(firm.id, preview.token, preview.mapping!);
  expect(result.matched.map((m) => [m.candidate.txnId, m.reason])).toEqual([
    [one.paymentTxnId, 'utr'],
    [two.paymentTxnId, 'utr'],
    [manual, 'amountDate'],
  ]);
  expect(result.unmatched).toHaveLength(1);
  expect(result.openPayments).toBe(3);

  // Mismatched amount picks are refused; nothing changes until a valid confirm.
  expect(() =>
    statements.confirm(firm.id, preview.token, preview.mapping!, [
      { txnId: one.paymentTxnId, lineIndex: result.unmatched[0].index },
    ]),
  ).toThrow('validation');
  expect(repo.confirmation(one.paymentTxnId)?.state).toBe('recorded');

  const picks = result.matched.map((m) => ({ txnId: m.candidate.txnId, lineIndex: m.line.index }));
  expect(statements.confirm(firm.id, preview.token, preview.mapping!, picks)).toBe(3);
  expect(repo.confirmation(one.paymentTxnId)).toMatchObject({
    state: 'confirmed',
    confirmedBy: 'statement',
  });
  expect(repo.confirmation(manual)).toMatchObject({ state: 'confirmed', source: 'statement' });
  expect(repo.badges(firm.id).invoices[invoice.id]).toBe('confirmed');
  expect(statements.match(firm.id, preview.token, preview.mapping!).openPayments).toBe(0);
});
