import { describe, expect, it } from 'vitest';
import { DeliveryLog, sign, verifyWebhook, WEBHOOK_TOLERANCE_MS } from './webhook';

const secret = 'whsec_test_secret';
const NOW = 1_800_000_000_000;
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    settlementState: 'NOT_RECONCILED',
    orderId: 'BS-1-12-1',
    amount: '500.00',
    amountPaise: 50000,
    utr: '401537805904',
    paymentId: 'pay_1',
    deliveryId: 'del_1',
    timestamp: NOW,
    verificationTag: 'SMS_VERIFIED',
    verificationLevel: 1,
    ...over,
  });
const v2Headers = (body: string, ts = NOW, id = 'del_1') => ({
  'X-Gateway-Signature': sign(secret, body),
  'X-Gateway-Signature-V2': sign(secret, `${ts}.${body}`),
  'X-Gateway-Timestamp': String(ts),
  'X-Gateway-Delivery-Id': id,
  'X-Gateway-Event': 'OBSERVED_SUCCESS',
});

describe('YouPI webhook verification', () => {
  it('accepts a V2 signature and returns the payload fields', () => {
    const body = payload();
    const result = verifyWebhook({ rawBody: body, headers: v2Headers(body), secret, now: NOW });
    expect(result).toMatchObject({ ok: true, version: 'v2', deliveryId: 'del_1' });
    if (result.ok)
      expect(result.payload).toMatchObject({
        event: 'OBSERVED_SUCCESS',
        settlementState: 'NOT_RECONCILED',
        orderId: 'BS-1-12-1',
        amountPaise: 50000,
        utr: '401537805904',
        verificationLevel: 1,
      });
  });
  it('accepts a V1-only signature using the signed timestamp in the body', () => {
    const body = payload();
    const headers = { 'x-gateway-signature': sign(secret, body), 'x-gateway-delivery-id': 'd9' };
    expect(verifyWebhook({ rawBody: body, headers, secret, now: NOW })).toMatchObject({
      ok: true,
      version: 'v1',
    });
  });
  it('rejects a tampered body for both versions', () => {
    const body = payload();
    const tampered = body.replace('50000', '90000');
    expect(
      verifyWebhook({ rawBody: tampered, headers: v2Headers(body), secret, now: NOW }),
    ).toEqual({ ok: false, reason: 'badSignature' });
    expect(
      verifyWebhook({
        rawBody: tampered,
        headers: { 'X-Gateway-Signature': sign(secret, body) },
        secret,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'badSignature' });
  });
  it('rejects a wrong secret and a malformed signature without throwing', () => {
    const body = payload();
    expect(
      verifyWebhook({ rawBody: body, headers: v2Headers(body), secret: 'other', now: NOW }),
    ).toEqual({ ok: false, reason: 'badSignature' });
    expect(
      verifyWebhook({
        rawBody: body,
        headers: { 'X-Gateway-Signature': 'sha256=zz' },
        secret,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'badSignature' });
    expect(verifyWebhook({ rawBody: body, headers: {}, secret, now: NOW })).toEqual({
      ok: false,
      reason: 'missingSignature',
    });
    expect(
      verifyWebhook({ rawBody: body, headers: v2Headers(body), secret: '', now: NOW }),
    ).toEqual({
      ok: false,
      reason: 'missingSecret',
    });
  });
  it('rejects a V2 signature that was made with a different timestamp header', () => {
    const body = payload();
    const headers = { ...v2Headers(body), 'X-Gateway-Timestamp': String(NOW + 1) };
    delete (headers as Record<string, string>)['X-Gateway-Signature'];
    expect(verifyWebhook({ rawBody: body, headers, secret, now: NOW })).toEqual({
      ok: false,
      reason: 'badSignature',
    });
  });
  it('rejects a correctly signed delivery older than five minutes, and one from the future', () => {
    const old = NOW - WEBHOOK_TOLERANCE_MS - 1000;
    const body = payload({ timestamp: old });
    expect(
      verifyWebhook({ rawBody: body, headers: v2Headers(body, old), secret, now: NOW }),
    ).toEqual({ ok: false, reason: 'staleTimestamp' });
    expect(
      verifyWebhook({
        rawBody: body,
        headers: { 'X-Gateway-Signature': sign(secret, body) },
        secret,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'staleTimestamp' });
    const future = NOW + WEBHOOK_TOLERANCE_MS + 1000;
    const fb = payload({ timestamp: future });
    expect(
      verifyWebhook({ rawBody: fb, headers: v2Headers(fb, future), secret, now: NOW }),
    ).toEqual({ ok: false, reason: 'staleTimestamp' });
  });
  it('accepts a delivery just inside the tolerance and honours a custom tolerance', () => {
    const edge = NOW - WEBHOOK_TOLERANCE_MS + 1000;
    const body = payload({ timestamp: edge });
    expect(
      verifyWebhook({ rawBody: body, headers: v2Headers(body, edge), secret, now: NOW }).ok,
    ).toBe(true);
    expect(
      verifyWebhook({
        rawBody: body,
        headers: v2Headers(body, edge),
        secret,
        now: NOW,
        toleranceMs: 500,
      }),
    ).toEqual({ ok: false, reason: 'staleTimestamp' });
  });
  it('needs a timestamp for V1 deliveries', () => {
    const body = JSON.stringify({ event: 'OBSERVED_SUCCESS', orderId: 'x' });
    expect(
      verifyWebhook({
        rawBody: body,
        headers: { 'X-Gateway-Signature': sign(secret, body) },
        secret,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'missingTimestamp' });
  });
  it('rejects a signed body that is not a JSON object', () => {
    const body = '[1,2]';
    expect(
      verifyWebhook({
        rawBody: body,
        headers: { 'X-Gateway-Signature': sign(secret, body) },
        secret,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'badJson' });
  });
  it('accepts a delivery id only once, and again after the log forgets it', () => {
    const log = new DeliveryLog(1000);
    const body = payload();
    const call = (now: number) =>
      verifyWebhook({ rawBody: body, headers: v2Headers(body), secret, now, log });
    expect(call(NOW).ok).toBe(true);
    expect(call(NOW + 10)).toEqual({ ok: false, reason: 'duplicate' });
    expect(call(NOW + 5000).ok).toBe(true);
  });
  it('does not remember deliveries that fail verification', () => {
    const log = new DeliveryLog();
    const body = payload();
    verifyWebhook({ rawBody: body + ' ', headers: v2Headers(body), secret, now: NOW, log });
    expect(log.has('del_1', NOW)).toBe(false);
  });
});
