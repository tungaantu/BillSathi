import { afterEach, expect, it } from 'vitest';
import { startWebhookListener, WEBHOOK_PATH, type ListenerHandle } from './webhook-listener';
import { sign, type WebhookPayload } from './webhook';

const secret = 'listener-secret';
let handle: ListenerHandle | undefined;
afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function post(path: string, body: string, headers: Record<string, string>) {
  const response = await fetch(`http://127.0.0.1:${handle!.port}${path}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return { status: response.status, body: await response.json() };
}

it('accepts only signed, fresh, first-time deliveries on its one path, on loopback', async () => {
  const events: WebhookPayload[] = [];
  handle = await startWebhookListener({
    port: 0,
    secret: () => secret,
    onEvent: (event) => events.push(event),
  });
  const now = Date.now();
  const body = JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    orderId: 'BS-1-1-1',
    amountPaise: 100,
    timestamp: now,
  });
  const good = {
    'X-Gateway-Signature-V2': sign(secret, `${now}.${body}`),
    'X-Gateway-Timestamp': String(now),
    'X-Gateway-Delivery-Id': 'd-1',
  };
  expect((await post(WEBHOOK_PATH, body, good)).status).toBe(200);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ event: 'OBSERVED_SUCCESS', orderId: 'BS-1-1-1' });
  // A replay of the same delivery is acknowledged but not applied twice.
  expect((await post(WEBHOOK_PATH, body, good)).status).toBe(200);
  expect(events).toHaveLength(1);
  // Wrong signature, wrong path and wrong method are refused.
  expect(
    (
      await post(WEBHOOK_PATH, body, {
        ...good,
        'X-Gateway-Delivery-Id': 'd-2',
        'X-Gateway-Signature-V2': 'sha256=00',
      })
    ).status,
  ).toBe(401);
  expect((await post('/other', body, good)).status).toBe(404);
  const get = await fetch(`http://127.0.0.1:${handle.port}${WEBHOOK_PATH}`);
  expect(get.status).toBe(404);
  expect(events).toHaveLength(1);
});
