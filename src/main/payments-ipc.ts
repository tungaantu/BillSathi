import { app, safeStorage, shell } from 'electron';
import { z } from 'zod';
import type { DatabaseContext } from './db';
import { paymentsRepository } from './db/payments';
import { repositories } from './db/repositories';
import { paymentConfigStore } from './services/upi/config';
import { collectService } from './services/upi/collect';
import { statementService } from './services/upi/statement';
import { secretBox } from './services/upi/secrets';
import { YoupiError } from './services/upi/youpi-client';
import { startWebhookListener, type ListenerHandle } from './services/upi/webhook-listener';
import {
  closeCustomerDisplay,
  openCustomerDisplay,
  updateCustomerDisplay,
} from './services/upi/customer-display';
import type {
  PaymentConfigInput,
  RecordInput,
  StatementMapping,
  StatementPick,
  TestOutcome,
} from '../shared/payments-api';

const column = z.number().int().min(-1).max(200);
const mappingSchema = z.object({
  date: column,
  narration: column,
  credit: column,
  debit: column,
  utr: column,
});

/** IPC for UPI collection, YouPI-PG confirmation and bank statement matching. */
export function registerPaymentsIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const store = paymentConfigStore(context, secretBox(safeStorage)),
    collect = collectService(context, store),
    statements = statementService(context, store, collect),
    repo = paymentsRepository(context),
    firms = repositories(context);
  const id = (v: unknown) => z.number().int().positive().parse(v);
  const language = (firm: number) => String(firms.getSettings(firm).language ?? 'en');

  /* Optional local webhook receiver, one per firm, loopback only. */
  const listeners = new Map<number, ListenerHandle>();
  async function refreshListener(firm: number) {
    await listeners.get(firm)?.close();
    listeners.delete(firm);
    const config = store.get(firm);
    if (!config.webhookEnabled || !store.webhookSecret(firm)) return;
    try {
      listeners.set(
        firm,
        await startWebhookListener({
          port: config.webhookPort,
          secret: () => store.webhookSecret(firm),
          onEvent: (payload) => void collect.applyWebhook(firm, payload),
        }),
      );
    } catch {
      /* Port busy: the owner can pick another port; polling still works. */
    }
  }
  for (const firm of firms.list()) void refreshListener(firm.id);
  app.on('will-quit', () => {
    for (const listener of listeners.values()) void listener.close();
  });

  handle('payments:config', (f) => store.get(id(f)));
  handle('payments:saveConfig', async (f, input) => {
    const firm = id(f),
      saved = store.save(firm, input as PaymentConfigInput);
    await refreshListener(firm);
    return saved;
  });
  handle('payments:testYoupi', async (f, draft): Promise<TestOutcome> => {
    const firm = id(f);
    try {
      const client = store.draftClient(firm, draft as PaymentConfigInput);
      const result = await client.test();
      return {
        ok: true,
        tier: result.health.tier,
        smsHealthy: result.health.smsHealthy,
        gmailHealthy: result.health.gmailHealthy,
        credentials: result.credentials,
      };
    } catch (error) {
      if (error instanceof z.ZodError) return { ok: false, problem: 'config' };
      return { ok: false, problem: error instanceof YoupiError ? error.code : 'unreachable' };
    }
  });
  handle('payments:start', (f, invoice, amount) =>
    collect.start(id(f), id(invoice), z.number().int().positive().parse(amount)),
  );
  handle('payments:poll', async (f, i) => {
    const result = await collect.poll(id(f), id(i));
    if (result.collection.status === 'recorded' || result.collection.status === 'seen')
      updateCustomerDisplay(result.collection.id, true, language(id(f)));
    return result;
  });
  handle('payments:cancel', async (f, i) => {
    await collect.cancel(id(f), id(i));
    closeCustomerDisplay(id(i));
  });
  handle('payments:record', (f, i, input) => {
    const firm = id(f),
      parsed = z
        .object({ utr: z.string().max(20), last4: z.string().max(4) })
        .parse(input) as RecordInput;
    const outcome = collect.record(firm, id(i), parsed);
    if (outcome.ok) updateCustomerDisplay(id(i), true, language(firm));
    return outcome;
  });
  handle('payments:openCheckout', async (f, i) => {
    const firm = id(f),
      row = repo.collection(firm, id(i));
    try {
      const target = new URL(row.checkoutUrl ?? ''),
        gateway = new URL(store.get(firm).baseUrl);
      if (!['http:', 'https:'].includes(target.protocol) || target.hostname !== gateway.hostname)
        return false;
      await shell.openExternal(target.toString());
      return true;
    } catch {
      return false;
    }
  });
  handle('payments:display', async (f, i, show) => {
    const firm = id(f);
    if (!z.boolean().parse(show)) {
      closeCustomerDisplay(id(i));
      return false;
    }
    const polled = await collect.poll(firm, id(i));
    return openCustomerDisplay(polled.collection, language(firm));
  });
  handle('payments:badges', (f) => repo.badges(id(f)));
  handle('payments:alert', (f) => repo.alert(id(f)));
  handle('payments:sync', (f) => collect.sync(id(f)));
  handle('payments:statementOpen', (f) => statements.open(id(f)));
  handle('payments:statementMatch', (f, token, mapping) =>
    statements.match(id(f), z.string().max(80).parse(token), mappingSchema.parse(mapping)),
  );
  handle('payments:statementConfirm', (f, token, mapping, picks) =>
    statements.confirm(
      id(f),
      z.string().max(80).parse(token),
      mappingSchema.parse(mapping) as StatementMapping,
      z
        .array(z.object({ txnId: z.number().int().positive(), lineIndex: z.number().int().min(0) }))
        .max(5000)
        .parse(picks) as StatementPick[],
    ),
  );
  handle('payments:statementPush', (f, token, mapping) =>
    statements.push(id(f), z.string().max(80).parse(token), mappingSchema.parse(mapping)),
  );
}
