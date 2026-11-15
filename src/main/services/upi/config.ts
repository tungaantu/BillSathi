import { z } from 'zod';
import type { DatabaseContext } from '../../db';
import { paymentsRepository } from '../../db/payments';
import { repositories } from '../../db/repositories';
import type { PaymentConfig, PaymentConfigInput } from '../../../shared/payments-api';
import {
  createYoupiClient,
  normalizeBaseUrl,
  type FetchLike,
  type YoupiClient,
} from './youpi-client';
import type { SecretBox } from './secrets';

export const DEFAULT_BASE_URL = 'http://localhost:6100';
export const DEFAULT_WEBHOOK_PORT = 6390;
const inputSchema = z.object({
  payeeName: z.string().trim().max(50),
  youpiEnabled: z.boolean(),
  baseUrl: z.string().trim().max(200),
  merchantId: z.string().trim().max(100),
  apiKey: z.string().max(500).optional(),
  adminToken: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
  webhookEnabled: z.boolean(),
  webhookPort: z.number().int().min(1024).max(65535),
});
const SECRETS = {
  apiKey: 'youpi.apiKey',
  adminToken: 'youpi.adminToken',
  webhookSecret: 'youpi.webhookSecret',
} as const;

/** Reads and saves Settings → Payments. Secrets stay in the main process, encrypted. */
export function paymentConfigStore(
  context: DatabaseContext,
  box: SecretBox,
  fetchImpl?: FetchLike,
) {
  const repo = paymentsRepository(context),
    firms = repositories(context);

  function get(firm: number): PaymentConfig {
    const company = firms.get(firm),
      v = repo.readSettings(firm);
    return {
      upiId: company.upiId,
      payeeName: v.payeeName ?? '',
      youpiEnabled: v['youpi.enabled'] === '1',
      baseUrl: v['youpi.baseUrl'] || DEFAULT_BASE_URL,
      merchantId: v['youpi.merchantId'] ?? '',
      hasApiKey: Boolean(v[SECRETS.apiKey]),
      hasAdminToken: Boolean(v[SECRETS.adminToken]),
      hasWebhookSecret: Boolean(v[SECRETS.webhookSecret]),
      webhookEnabled: v['webhook.enabled'] === '1',
      webhookPort: Number(v['webhook.port']) || DEFAULT_WEBHOOK_PORT,
      secureStorage: box.available(),
    };
  }

  const secret = (firm: number, key: string): string => {
    const stored = repo.readSettings(firm)[key];
    if (!stored || !box.available()) return '';
    try {
      return box.decrypt(stored);
    } catch {
      return '';
    }
  };

  function save(firm: number, raw: PaymentConfigInput): PaymentConfig {
    const input = inputSchema.parse(raw);
    firms.get(firm);
    if (input.youpiEnabled || input.baseUrl) {
      try {
        normalizeBaseUrl(input.baseUrl || DEFAULT_BASE_URL);
      } catch {
        throw new Error('validation');
      }
    }
    const touchesSecrets = [input.apiKey, input.adminToken, input.webhookSecret].some(Boolean);
    if (touchesSecrets && !box.available()) throw new Error('validation');
    context.sqlite.transaction(() => {
      const set = (key: string, value: string | null) => repo.writeSetting(firm, key, value);
      set('payeeName', input.payeeName || null);
      set('youpi.enabled', input.youpiEnabled ? '1' : '0');
      set('youpi.baseUrl', input.baseUrl ? normalizeBaseUrl(input.baseUrl) : null);
      set('youpi.merchantId', input.merchantId || null);
      set('webhook.enabled', input.webhookEnabled ? '1' : '0');
      set('webhook.port', String(input.webhookPort));
      for (const field of ['apiKey', 'adminToken', 'webhookSecret'] as const) {
        const value = input[field];
        if (value === undefined) continue;
        set(SECRETS[field], value ? box.encrypt(value) : null);
      }
      firms.audit(firm, 'payment_settings', firm, 'update', null, {
        // Never log secrets, only which ones are present.
        youpiEnabled: input.youpiEnabled,
        baseUrl: input.baseUrl,
        merchantId: input.merchantId,
        webhookEnabled: input.webhookEnabled,
      });
    })();
    return get(firm);
  }

  /** A client for the saved settings, or null when YouPI is off or incomplete. */
  function client(firm: number): YoupiClient | null {
    const c = get(firm);
    const apiKey = secret(firm, SECRETS.apiKey);
    if (!c.youpiEnabled || !c.merchantId || !apiKey) return null;
    try {
      return createYoupiClient(
        {
          baseUrl: c.baseUrl,
          merchantId: c.merchantId,
          apiKey,
          adminToken: secret(firm, SECRETS.adminToken) || undefined,
        },
        fetchImpl,
      );
    } catch {
      return null;
    }
  }

  /** A client for what is typed in the form, falling back to saved secrets that were left blank. */
  function draftClient(firm: number, draft: PaymentConfigInput) {
    const parsed = inputSchema.parse(draft);
    return createYoupiClient(
      {
        baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
        merchantId: parsed.merchantId,
        apiKey: parsed.apiKey ?? secret(firm, SECRETS.apiKey),
        adminToken: parsed.adminToken ?? secret(firm, SECRETS.adminToken),
      },
      fetchImpl,
    );
  }

  return {
    get,
    save,
    client,
    draftClient,
    webhookSecret: (firm: number) => secret(firm, SECRETS.webhookSecret),
  };
}
export type PaymentConfigStore = ReturnType<typeof paymentConfigStore>;
