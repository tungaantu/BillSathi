import { describe, expect, it, vi } from 'vitest';
import {
  createYoupiClient,
  mapStatus,
  normalizeBaseUrl,
  YoupiError,
  type FetchLike,
} from './youpi-client';

type Reply = { status?: number; body?: unknown; throws?: Error };
/** A fake gateway: replies in order and records every request. */
function gateway(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 500 };
    if (reply.throws) throw reply.throws;
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
    });
  };
  return { calls, fetchImpl };
}
const config = {
  baseUrl: 'http://localhost:6100/',
  merchantId: 'merchant-1',
  apiKey: 'key-1',
  adminToken: 'admin-1',
};
const headersOf = (call: { init: RequestInit }) => call.init.headers as Record<string, string>;

describe('YouPI client: create order', () => {
  it('posts to /api/v1/payments with merchant headers, rupee amount string and idempotency key', async () => {
    const { calls, fetchImpl } = gateway({
      status: 201,
      body: {
        paymentId: 'pay-1',
        orderId: 'BS-1-12-1',
        amount: '1234.50',
        amountPaise: '123450',
        currency: 'INR',
        status: 'INITIATED',
        checkoutUrl: 'http://localhost:7000/checkout/pay-1',
      },
    });
    const order = await createYoupiClient(config, fetchImpl).createOrder({
      orderId: 'BS-1-12-1',
      amountPaise: 123450,
      invoiceNo: 'INV-0012',
    });
    expect(order).toEqual({
      paymentId: 'pay-1',
      orderId: 'BS-1-12-1',
      amountPaise: 123450,
      rawStatus: 'INITIATED',
      checkoutUrl: 'http://localhost:7000/checkout/pay-1',
      reused: false,
    });
    expect(calls[0].url).toBe('http://localhost:6100/api/v1/payments');
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(calls[0])).toMatchObject({
      'X-Merchant-Id': 'merchant-1',
      'X-Merchant-Key': 'key-1',
      'Idempotency-Key': 'BS-1-12-1',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      orderId: 'BS-1-12-1',
      amount: '1234.50',
      currency: 'INR',
      metadata: { source: 'billsathi', invoice: 'INV-0012' },
    });
  });
  it('treats HTTP 200 as an existing (idempotent) order', async () => {
    const { fetchImpl } = gateway({
      status: 200,
      body: {
        paymentId: 'pay-1',
        orderId: 'o',
        amountPaise: '100',
        status: 'ACTIVE',
        checkoutUrl: 'u',
      },
    });
    const order = await createYoupiClient(config, fetchImpl).createOrder({
      orderId: 'o',
      amountPaise: 100,
    });
    expect(order.reused).toBe(true);
  });
  it('maps ORDER_AMOUNT_MISMATCH (409) to a mismatch error', async () => {
    const { fetchImpl } = gateway({
      status: 409,
      body: {
        error: 'ORDER_AMOUNT_MISMATCH',
        code: 'ORDER_AMOUNT_MISMATCH',
        message: 'different amount',
      },
    });
    await expect(
      createYoupiClient(config, fetchImpl).createOrder({ orderId: 'o', amountPaise: 100 }),
    ).rejects.toMatchObject({ code: 'mismatch', status: 409 });
  });
  it('maps other failures to friendly codes', async () => {
    const cases: [Reply, string][] = [
      [{ status: 401, body: { error: 'x', code: 'INVALID_MERCHANT_KEY' } }, 'auth'],
      [{ status: 409, body: { error: 'DUPLICATE_SESSION_DETECTED' } }, 'busy'],
      [{ status: 403, body: { error: 'blocked' } }, 'blocked'],
      [{ status: 503, body: { error: 'x', code: 'OBSERVERS_UNHEALTHY' } }, 'observers'],
      [{ status: 400, body: { error: 'Missing required fields' } }, 'rejected'],
      [{ status: 500, body: {} }, 'server'],
      [{ throws: new TypeError('fetch failed') }, 'unreachable'],
      [{ throws: Object.assign(new Error('t'), { name: 'TimeoutError' }) }, 'timeout'],
      [{ status: 201, body: { orderId: 'o' } }, 'badResponse'],
    ];
    for (const [reply, code] of cases) {
      const { fetchImpl } = gateway(reply);
      await expect(
        createYoupiClient(config, fetchImpl).createOrder({ orderId: 'o', amountPaise: 100 }),
      ).rejects.toMatchObject({ name: 'YoupiError', code });
    }
  });
  it('needs a merchant id and key', async () => {
    const { calls, fetchImpl } = gateway();
    await expect(
      createYoupiClient({ ...config, apiKey: '' }, fetchImpl).createOrder({
        orderId: 'o',
        amountPaise: 100,
      }),
    ).rejects.toMatchObject({ code: 'config' });
    expect(calls).toHaveLength(0);
  });
});

describe('YouPI client: status and the observed to reconciled transition', () => {
  const status = (over: Record<string, unknown>) => ({
    status: 200,
    body: {
      paymentId: 'pay-1',
      orderId: 'BS-1-12-1',
      amount: '500.00',
      amountPaise: '50000',
      currency: 'INR',
      method: 'UPI',
      ...over,
    },
  });
  it('reads waiting, then OBSERVED_SUCCESS (seen), then RECONCILED (confirmed)', async () => {
    const { calls, fetchImpl } = gateway(
      status({ status: 'ACTIVE', settlementState: 'NOT_APPLICABLE' }),
      status({
        status: 'OBSERVED_SUCCESS',
        settlementState: 'NOT_RECONCILED',
        utr: '401537805904',
      }),
      status({ status: 'RECONCILED', settlementState: 'RECONCILED' }),
    );
    const client = createYoupiClient(config, fetchImpl);
    expect(await client.getStatus('pay-1')).toMatchObject({ state: 'waiting', utr: null });
    expect(await client.getStatus('pay-1')).toMatchObject({
      state: 'seen',
      rawStatus: 'OBSERVED_SUCCESS',
      settlementState: 'NOT_RECONCILED',
      utr: '401537805904',
      amountPaise: 50000,
    });
    expect(await client.getStatus('pay-1')).toMatchObject({ state: 'confirmed' });
    expect(calls[0].url).toBe('http://localhost:6100/api/v1/payments/pay-1');
    expect(headersOf(calls[0])['X-Merchant-Key']).toBe('key-1');
  });
  it('finds the UTR in metadata and ignores values that are not 12 digits', async () => {
    const { fetchImpl } = gateway(
      status({ status: 'OBSERVED_SUCCESS', metadata: { utr: '123456789012' } }),
      status({ status: 'OBSERVED_SUCCESS', utr: '12345' }),
    );
    const client = createYoupiClient(config, fetchImpl);
    expect((await client.getStatus('p')).utr).toBe('123456789012');
    expect((await client.getStatus('p')).utr).toBeNull();
  });
  it('maps every public outcome', () => {
    const table: [string, string, string?][] = [
      ['INITIATED', 'waiting'],
      ['QUEUED', 'waiting'],
      ['PROCESSING', 'waiting'],
      ['OBSERVED_SUCCESS', 'seen'],
      ['RECONCILED', 'confirmed'],
      ['MANUAL_REVIEW', 'review'],
      ['FAILED', 'failed'],
      ['EXPIRED', 'expired'],
      ['CANCELLED', 'cancelled'],
      ['SUCCESS', 'seen', 'UPI'],
      ['SUCCESS', 'unknown', 'COD'],
      ['SOMETHING_NEW', 'unknown'],
    ];
    for (const [raw, state, method] of table) expect(mapStatus(raw, '', method)).toBe(state);
    expect(mapStatus('OBSERVED_SUCCESS', 'RECONCILED')).toBe('confirmed');
  });
  it('reports a missing payment as notFound', async () => {
    const { fetchImpl } = gateway({ status: 404, body: { error: 'Payment session not found' } });
    await expect(createYoupiClient(config, fetchImpl).getStatus('nope')).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});

describe('YouPI client: checkout info, cancel, health and connection test', () => {
  it('reads the payee VPA and only trusts upi:// links', async () => {
    const { calls, fetchImpl } = gateway(
      { body: { payeeVpa: 'shop@okhdfc', payeeName: 'Shop', upiUri: 'upi://pay?pa=shop@okhdfc' } },
      { body: { payeeVpa: null, upiUri: 'https://evil.example' } },
    );
    const client = createYoupiClient(config, fetchImpl);
    expect(await client.getCheckoutInfo('pay-1')).toEqual({
      payeeVpa: 'shop@okhdfc',
      payeeName: 'Shop',
      upiUri: 'upi://pay?pa=shop@okhdfc',
    });
    expect(await client.getCheckoutInfo('pay-1')).toEqual({
      payeeVpa: null,
      payeeName: null,
      upiUri: null,
    });
    expect(calls[0].url).toBe('http://localhost:6100/api/v1/checkout/pay-1/state');
  });
  it('cancels an order', async () => {
    const { calls, fetchImpl } = gateway({ body: { success: true, status: 'CANCELLED' } });
    await createYoupiClient(config, fetchImpl).cancel('pay-1');
    expect(calls[0].url).toBe('http://localhost:6100/api/v1/checkout/pay-1/cancel');
    expect(calls[0].init.method).toBe('POST');
  });
  it('tests the connection: health first, then credentials via an empty create (400 = accepted)', async () => {
    const { calls, fetchImpl } = gateway(
      { body: { tier: 'YELLOW', smsHealthy: true, gmailHealthy: false } },
      { status: 400, body: { error: 'Missing required fields: orderId and amount.' } },
    );
    expect(await createYoupiClient(config, fetchImpl).test()).toEqual({
      health: { tier: 'yellow', smsHealthy: true, gmailHealthy: false },
      credentials: 'ok',
    });
    expect(calls[0].url).toContain('/api/v1/checkout/server-health');
    expect(calls[1].init.body).toBe('{}');
  });
  it('reports wrong keys, unknown merchants and unreachable servers', async () => {
    const health = { body: { tier: 'GREEN', smsHealthy: true, gmailHealthy: true } };
    await expect(
      createYoupiClient(
        config,
        gateway(health, { status: 401, body: { code: 'INVALID_MERCHANT_KEY' } }).fetchImpl,
      ).test(),
    ).rejects.toMatchObject({ code: 'auth' });
    await expect(
      createYoupiClient(
        config,
        gateway(health, { status: 400, body: { error: 'Merchant not found or not configured.' } })
          .fetchImpl,
      ).test(),
    ).rejects.toMatchObject({ code: 'auth' });
    await expect(
      createYoupiClient(
        config,
        gateway({ throws: new TypeError('fetch failed') }).fetchImpl,
      ).test(),
    ).rejects.toMatchObject({ code: 'unreachable' });
  });
  it('skips the credential probe when no keys are entered yet', async () => {
    const { calls, fetchImpl } = gateway({ body: { tier: 'RED' } });
    const result = await createYoupiClient({ ...config, apiKey: '' }, fetchImpl).test();
    expect(result).toMatchObject({ credentials: 'missing', health: { tier: 'red' } });
    expect(calls).toHaveLength(1);
  });
});

describe('YouPI client: statement import', () => {
  it('finds the receiving account with the admin token, then posts the CSV', async () => {
    const { calls, fetchImpl } = gateway(
      {
        body: {
          accounts: [
            { id: 'acc-0', isActive: false },
            { id: 'acc-1', isActive: true },
          ],
        },
      },
      { body: { reconciled: 2, conflicts: 1, unmatched: 3, lines: [] } },
    );
    const result = await createYoupiClient(config, fetchImpl).importStatement('Date,Narration\n');
    expect(result).toEqual({ reconciled: 2, conflicts: 1, unmatched: 3 });
    expect(calls[0].url).toBe('http://localhost:6100/api/v1/admin/upi-accounts');
    expect(headersOf(calls[0]).Authorization).toBe('Bearer admin-1');
    expect(calls[1].url).toBe('http://localhost:6100/api/v1/admin/statements/import');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      receivingAccountId: 'acc-1',
      csv: 'Date,Narration\n',
    });
  });
  it('needs the admin token', async () => {
    const fetchImpl = vi.fn();
    await expect(
      createYoupiClient({ ...config, adminToken: '' }, fetchImpl).importStatement('x'),
    ).rejects.toMatchObject({ code: 'config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('gateway address', () => {
  it('keeps http(s) origins and drops trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:6100/')).toBe('http://localhost:6100');
    expect(normalizeBaseUrl(' https://pay.example.com/gw// ')).toBe('https://pay.example.com/gw');
  });
  it('rejects other schemes, credentials and junk', () => {
    for (const bad of ['', 'localhost:6100', 'ftp://x', 'file:///c:/x', 'http://u:p@host']) {
      expect(() => normalizeBaseUrl(bad)).toThrow(YoupiError);
    }
  });
});
