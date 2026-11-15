import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DeliveryLog, verifyWebhook, type WebhookPayload } from './webhook';

const MAX_BODY = 64 * 1024;
export const WEBHOOK_PATH = '/youpi/webhook';

export interface ListenerHandle {
  port: number;
  close(): Promise<void>;
}

/**
 * Optional receiver for YouPI-PG webhooks. It only ever binds 127.0.0.1, accepts one path,
 * and answers 2xx only after the HMAC and timestamp checks pass. Off unless the owner enables it.
 * Note: YouPI refuses loopback webhook targets unless YOUPI_ALLOW_PRIVATE_WEBHOOKS=true on its side.
 */
export function startWebhookListener(options: {
  port: number;
  secret: () => string;
  onEvent: (payload: WebhookPayload) => void;
}): Promise<ListenerHandle> {
  const log = new DeliveryLog();
  const server: Server = createServer((req, res) => {
    const reply = (status: number, body: Record<string, unknown>) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== WEBHOOK_PATH)
      return reply(404, { error: 'not found' });
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY && !rejected) {
        rejected = true;
        reply(413, { error: 'too large' });
        req.destroy();
      } else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      const result = verifyWebhook({
        rawBody: Buffer.concat(chunks).toString('utf8'),
        headers: req.headers,
        secret: options.secret(),
        log,
      });
      if (!result.ok)
        return reply(result.reason === 'duplicate' ? 200 : 401, { error: result.reason });
      try {
        options.onEvent(result.payload);
      } catch {
        return reply(500, { error: 'storage' });
      }
      reply(200, { received: true });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      }),
    );
  });
}
