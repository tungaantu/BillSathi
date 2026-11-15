/**
 * Verification of YouPI-PG signed webhooks. Pure functions, no network.
 *
 * YouPI sends (see packages/core/src/webhook-engine.js):
 *   X-Gateway-Signature:    sha256=hex(HMAC_SHA256(secret, rawBody))
 *   X-Gateway-Signature-V2: sha256=hex(HMAC_SHA256(secret, `${timestampMs}.${rawBody}`))
 *   X-Gateway-Timestamp, X-Gateway-Delivery-Id, X-Gateway-Event
 * The HMAC must be computed over the raw bytes, never over re-serialised JSON.
 *
 * Replay protection: V2 binds the timestamp into the signature. V1 does not, but the body carries
 * a `timestamp` field which V1 does sign, so that is used for freshness instead of the unsigned header.
 * Note: YouPI re-sends a failed delivery with its ORIGINAL timestamp, so a retry later than the
 * tolerance window is rejected; the owner can still use "Check now" to read the status by polling.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export type WebhookRejection =
  | 'missingSecret'
  | 'missingSignature'
  | 'badSignature'
  | 'missingTimestamp'
  | 'staleTimestamp'
  | 'badJson'
  | 'duplicate';

export interface WebhookPayload {
  event: string;
  settlementState: string;
  orderId: string;
  amountPaise: number;
  utr: string;
  paymentId: string;
  deliveryId: string;
  timestamp: number;
  verificationTag: string;
  verificationLevel: number;
  raw: Record<string, unknown>;
}

export type WebhookResult =
  | { ok: true; version: 'v1' | 'v2'; deliveryId: string; payload: WebhookPayload }
  | { ok: false; reason: WebhookRejection };

type HeaderBag = Record<string, string | string[] | undefined>;

const header = (headers: HeaderBag, name: string): string => {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers))
    if (key.toLowerCase() === wanted) return (Array.isArray(value) ? value[0] : value) ?? '';
  return '';
};

export const sign = (secret: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Remembers delivery ids so a replayed delivery is only accepted once. */
export class DeliveryLog {
  private readonly seen = new Map<string, number>();
  constructor(private readonly keepMs = 60 * 60 * 1000) {}
  has(id: string, now = Date.now()): boolean {
    this.prune(now);
    return this.seen.has(id);
  }
  add(id: string, now = Date.now()) {
    this.prune(now);
    this.seen.set(id, now + this.keepMs);
  }
  private prune(now: number) {
    for (const [id, expires] of this.seen) if (expires <= now) this.seen.delete(id);
  }
}

export function verifyWebhook(input: {
  rawBody: string;
  headers: HeaderBag;
  secret: string;
  now?: number;
  toleranceMs?: number;
  log?: DeliveryLog;
}): WebhookResult {
  const { rawBody, headers, secret } = input;
  const now = input.now ?? Date.now(),
    tolerance = input.toleranceMs ?? WEBHOOK_TOLERANCE_MS;
  if (!secret) return { ok: false, reason: 'missingSecret' };
  const v1 = header(headers, 'x-gateway-signature'),
    v2 = header(headers, 'x-gateway-signature-v2'),
    stamp = header(headers, 'x-gateway-timestamp');
  if (!v1 && !v2) return { ok: false, reason: 'missingSignature' };

  let version: 'v1' | 'v2' | null = null;
  // Prefer V2: it authenticates the header timestamp as well as the body.
  if (v2 && stamp && safeEqual(v2, sign(secret, `${stamp}.${rawBody}`))) version = 'v2';
  else if (v1 && safeEqual(v1, sign(secret, rawBody))) version = 'v1';
  if (!version) return { ok: false, reason: 'badSignature' };

  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    parsed = value as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'badJson' };
  }

  const signedStamp = version === 'v2' ? Number(stamp) : Number(parsed.timestamp);
  if (!Number.isFinite(signedStamp) || signedStamp <= 0)
    return { ok: false, reason: 'missingTimestamp' };
  if (Math.abs(now - signedStamp) > tolerance) return { ok: false, reason: 'staleTimestamp' };

  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const deliveryId = header(headers, 'x-gateway-delivery-id') || str(parsed.deliveryId);
  if (deliveryId && input.log?.has(deliveryId, now)) return { ok: false, reason: 'duplicate' };
  if (deliveryId) input.log?.add(deliveryId, now);

  return {
    ok: true,
    version,
    deliveryId,
    payload: {
      event: str(parsed.event) || header(headers, 'x-gateway-event'),
      settlementState: str(parsed.settlementState),
      orderId: str(parsed.orderId),
      amountPaise: Number(parsed.amountPaise) || 0,
      utr: str(parsed.utr),
      paymentId: str(parsed.paymentId),
      deliveryId,
      timestamp: signedStamp,
      verificationTag: str(parsed.verificationTag),
      verificationLevel: Number(parsed.verificationLevel) || 0,
      raw: parsed,
    },
  };
}
