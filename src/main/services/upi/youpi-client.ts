/**
 * Adapter for the self-hosted YouPI-PG payment gateway (https://github.com/youpi-pg/YouPI-PG).
 *
 * Everything that depends on YouPI's wire format lives in THIS file. It was written against the
 * repository's source (apps/payment-api/src/routes/*.js), because openapi.yaml in that repo is
 * older than the code (it still documents SUCCESS instead of OBSERVED_SUCCESS / RECONCILED).
 *
 * Endpoints used (Payment API, default http://localhost:6100):
 *   POST /api/v1/payments                 create order. Headers X-Merchant-Id + X-Merchant-Key,
 *                                         optional Idempotency-Key. Body {orderId, amount:"499.00", ...}
 *   GET  /api/v1/payments/:id             status. X-Merchant-Key unlocks settlementState + metadata.
 *   GET  /api/v1/checkout/:id/state       public; gives payeeVpa / payeeName / upiUri (upiUri only
 *                                         once the session is ACTIVE).
 *   POST /api/v1/checkout/:id/cancel      cancel an open order.
 *   GET  /api/v1/checkout/server-health   public; observer (phone / Gmail) health tier.
 *   GET  /api/v1/admin/upi-accounts       admin bearer token; finds the receivingAccountId.
 *   POST /api/v1/admin/statements/import  admin bearer token; {receivingAccountId, csv}.
 *
 * Assumptions (spec is silent or ambiguous):
 *  - The status endpoint does NOT return the UTR. We read it opportunistically from
 *    `utr` / `bankReferenceNumber` / `metadata.utr`; otherwise it must come from a signed webhook
 *    or be typed by the owner.
 *  - A UPI order stays INITIATED until a customer opens the checkout page and signs in. An order
 *    that is still INITIATED may therefore never be observed. The UI offers "Open YouPI checkout".
 *  - Real-time SSE (GET /api/v1/checkout/:id/stream) exists, but status polling every 3 s is used
 *    instead: simpler, and the stream carries no UTR either.
 */
import { paiseToDecimal } from '../../../shared/money';

export type YoupiState =
  'waiting' | 'seen' | 'confirmed' | 'review' | 'failed' | 'expired' | 'cancelled' | 'unknown';

export type YoupiErrorCode =
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'mismatch'
  | 'busy'
  | 'blocked'
  | 'observers'
  | 'rejected'
  | 'notFound'
  | 'badResponse'
  | 'server'
  | 'config';

export class YoupiError extends Error {
  constructor(
    readonly code: YoupiErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'YoupiError';
  }
}

export interface YoupiConfig {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  /** Only needed to push a bank statement CSV. */
  adminToken?: string;
}

export interface YoupiOrder {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  rawStatus: string;
  checkoutUrl: string;
  /** True when the gateway already knew about this order (idempotent reuse). */
  reused: boolean;
}

export interface YoupiStatus {
  paymentId: string;
  orderId: string;
  state: YoupiState;
  rawStatus: string;
  settlementState: string;
  amountPaise: number;
  utr: string | null;
  completedAt: string | null;
}

export interface YoupiCheckoutInfo {
  payeeVpa: string | null;
  payeeName: string | null;
  upiUri: string | null;
}

export interface YoupiHealth {
  tier: 'green' | 'yellow' | 'red' | 'unknown';
  smsHealthy: boolean;
  gmailHealthy: boolean;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 8000;

/** Accepts only plain http(s) URLs without credentials; returns the origin + path without trailing slash. */
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new YoupiError('config', 'The gateway address is not a valid web address.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new YoupiError('config', 'The gateway address must start with http:// or https://');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Maps YouPI's public outcome + settlementState onto what the owner needs to know. */
export function mapStatus(status: unknown, settlementState: unknown, method?: unknown): YoupiState {
  const s = String(status ?? '').toUpperCase();
  const settlement = String(settlementState ?? '').toUpperCase();
  if (s === 'RECONCILED' || settlement === 'RECONCILED') return 'confirmed';
  if (s === 'OBSERVED_SUCCESS') return 'seen';
  // Older gateways reported an observed UPI payment as SUCCESS. COD / counter SUCCESS is not UPI money.
  if (s === 'SUCCESS')
    return !method || String(method).toUpperCase().includes('UPI') ? 'seen' : 'unknown';
  if (s === 'MANUAL_REVIEW') return 'review';
  if (s === 'FAILED') return 'failed';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'CANCELLED' || s === 'BLOCKED') return 'cancelled';
  if (['INITIATED', 'ACTIVE', 'QUEUED', 'PROCESSING'].includes(s)) return 'waiting';
  return 'unknown';
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function paise(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new YoupiError('badResponse', 'Unexpected amount from gateway.');
  return n;
}

function readUtr(body: Record<string, unknown>): string | null {
  const meta = record(body.metadata);
  for (const candidate of [
    body.utr,
    body.bankReferenceNumber,
    meta.utr,
    meta.bankReferenceNumber,
  ]) {
    const value = text(candidate).trim();
    if (/^\d{12}$/.test(value)) return value;
  }
  return null;
}

export function createYoupiClient(config: YoupiConfig, fetchImpl: FetchLike = fetch) {
  const base = normalizeBaseUrl(config.baseUrl);
  const merchantHeaders = (): Record<string, string> => ({
    ...(config.merchantId ? { 'X-Merchant-Id': config.merchantId } : {}),
    ...(config.apiKey ? { 'X-Merchant-Key': config.apiKey } : {}),
  });

  async function call(
    method: 'GET' | 'POST',
    path: string,
    options: { headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      throw new YoupiError(
        name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable',
        'Could not reach the gateway.',
      );
    }
    let body: Record<string, unknown> = {};
    try {
      body = record(await response.json());
    } catch {
      /* Empty or non-JSON body; the status code still tells us what happened. */
    }
    if (response.ok) return { status: response.status, body };
    const code = text(body.code) || text(body.error);
    const message = text(body.message) || text(body.error) || `HTTP ${response.status}`;
    if (response.status === 401) throw new YoupiError('auth', message, 401);
    if (response.status === 404) throw new YoupiError('notFound', message, 404);
    if (response.status === 409)
      throw new YoupiError(code.includes('AMOUNT_MISMATCH') ? 'mismatch' : 'busy', message, 409);
    if (response.status === 403) throw new YoupiError('blocked', message, 403);
    if (response.status === 503 && code === 'OBSERVERS_UNHEALTHY')
      throw new YoupiError('observers', message, 503);
    if (response.status >= 500) throw new YoupiError('server', message, response.status);
    throw new YoupiError('rejected', message, response.status);
  }

  async function createOrder(input: {
    orderId: string;
    amountPaise: number;
    description?: string;
    invoiceNo?: string;
  }): Promise<YoupiOrder> {
    if (!config.merchantId || !config.apiKey)
      throw new YoupiError('config', 'Merchant ID and API key are required.');
    const { status, body } = await call('POST', '/api/v1/payments', {
      headers: { ...merchantHeaders(), 'Idempotency-Key': input.orderId },
      body: {
        orderId: input.orderId,
        amount: paiseToDecimal(input.amountPaise),
        currency: 'INR',
        description: input.description,
        metadata: { source: 'billsathi', invoice: input.invoiceNo ?? '' },
      },
    });
    const paymentId = text(body.paymentId);
    if (!paymentId) throw new YoupiError('badResponse', 'The gateway did not return a payment id.');
    return {
      paymentId,
      orderId: text(body.orderId) || input.orderId,
      amountPaise: paise(body.amountPaise),
      rawStatus: text(body.status),
      checkoutUrl: text(body.checkoutUrl),
      reused: status === 200,
    };
  }

  async function getStatus(paymentId: string): Promise<YoupiStatus> {
    const { body } = await call('GET', `/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: merchantHeaders(),
    });
    const rawStatus = text(body.status);
    return {
      paymentId: text(body.paymentId) || paymentId,
      orderId: text(body.orderId),
      state: mapStatus(rawStatus, body.settlementState, body.method),
      rawStatus,
      settlementState: text(body.settlementState),
      amountPaise: paise(body.amountPaise),
      utr: readUtr(body),
      completedAt: text(body.completedAt) || null,
    };
  }

  async function getCheckoutInfo(paymentId: string): Promise<YoupiCheckoutInfo> {
    const { body } = await call('GET', `/api/v1/checkout/${encodeURIComponent(paymentId)}/state`);
    return {
      payeeVpa: text(body.payeeVpa) || null,
      payeeName: text(body.payeeName) || null,
      upiUri: text(body.upiUri).startsWith('upi://pay?') ? text(body.upiUri) : null,
    };
  }

  async function cancel(paymentId: string): Promise<void> {
    await call('POST', `/api/v1/checkout/${encodeURIComponent(paymentId)}/cancel`, { body: {} });
  }

  async function health(): Promise<YoupiHealth> {
    const { body } = await call('GET', '/api/v1/checkout/server-health');
    const tier = text(body.tier).toLowerCase();
    return {
      tier: tier === 'green' || tier === 'yellow' || tier === 'red' ? tier : 'unknown',
      smsHealthy: body.smsHealthy === true,
      gmailHealthy: body.gmailHealthy === true,
    };
  }

  /**
   * Checks address, observers and credentials without creating an order. A create call with an
   * empty body passes the key check first and then fails field validation with 400, so a 400
   * means "credentials accepted" and a 401 means "wrong key".
   */
  async function test(): Promise<{ health: YoupiHealth; credentials: 'ok' | 'missing' }> {
    const result = await health();
    if (!config.merchantId || !config.apiKey) return { health: result, credentials: 'missing' };
    try {
      await call('POST', '/api/v1/payments', { headers: merchantHeaders(), body: {} });
    } catch (error) {
      if (error instanceof YoupiError && error.code === 'rejected' && error.status === 400) {
        if (/merchant/i.test(error.message) && /(not found|required)/i.test(error.message))
          throw new YoupiError('auth', error.message, 400);
        return { health: result, credentials: 'ok' };
      }
      throw error;
    }
    return { health: result, credentials: 'ok' };
  }

  async function receivingAccountId(): Promise<string> {
    if (!config.adminToken) throw new YoupiError('config', 'The admin token is required.');
    const { body } = await call('GET', '/api/v1/admin/upi-accounts', {
      headers: { Authorization: `Bearer ${config.adminToken}`, 'X-Merchant-Id': config.merchantId },
    });
    const accounts = Array.isArray(body.accounts) ? body.accounts.map(record) : [];
    const active = accounts.find((a) => a.isActive === true) ?? accounts[0];
    const id = text(active?.id);
    if (!id) throw new YoupiError('notFound', 'The gateway has no receiving UPI account.');
    return id;
  }

  /** Sends a bank statement CSV; YouPI reconciles matching observed payments. */
  async function importStatement(csv: string) {
    const accountId = await receivingAccountId();
    const { body } = await call('POST', '/api/v1/admin/statements/import', {
      headers: { Authorization: `Bearer ${config.adminToken}` },
      body: { receivingAccountId: accountId, csv },
    });
    return {
      reconciled: Number(body.reconciled) || 0,
      conflicts: Number(body.conflicts) || 0,
      unmatched: Number(body.unmatched) || 0,
    };
  }

  return { createOrder, getStatus, getCheckoutInfo, cancel, health, test, importStatement };
}

export type YoupiClient = ReturnType<typeof createYoupiClient>;
