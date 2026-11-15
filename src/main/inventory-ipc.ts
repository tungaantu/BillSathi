import { z } from 'zod';
import type { DatabaseContext } from './db';
import { inventoryRepository } from './db/inventory';
import { masterRepository } from './db/masters';
import { repositories } from './db/repositories';
import { labelsHtml, transferHtml } from './services/inventory-print';
import { outputHtml } from './html-output';
import { fontCss } from './reports-output';
import { translator } from './services/reports/labels';
import { formatDate } from '../shared/dates';
import { transferSchema } from '../shared/inventory';
import type { LabelRequest } from '../shared/inventory-api';

const id = (v: unknown) => z.number().int().positive().parse(v);
const optionalId = (v: unknown) => z.number().int().positive().nullable().optional().parse(v);
const labelRequest = z.object({
  items: z
    .array(
      z.object({ itemId: z.number().int().positive(), copies: z.number().int().min(1).max(1000) }),
    )
    .min(1)
    .max(500),
  layout: z.enum(['a4-65', 'a4-48', 'a4-40', 'a4-24', 'roll-50x25', 'roll-38x25']),
  fields: z.object({
    name: z.boolean(),
    price: z.boolean(),
    mrp: z.boolean(),
    code: z.boolean(),
    firm: z.boolean(),
  }),
});
const mode = (v: unknown) => z.enum(['pdf', 'print']).parse(v);

export function registerInventoryIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const inventory = inventoryRepository(context),
    masters = masterRepository(context),
    repo = repositories(context);
  const own = (f: unknown) => {
    const firm = id(f);
    repo.get(firm);
    return firm;
  };
  handle('inventory:godowns', (f) => inventory.godowns(own(f)));
  handle('inventory:saveGodown', (f, i, input) =>
    inventory.saveGodown(
      own(f),
      optionalId(i) ?? null,
      z.object({ name: z.string(), address: z.string() }).parse(input),
    ),
  );
  handle('inventory:deleteGodown', (f, i) => inventory.deleteGodown(own(f), id(i)));
  handle('inventory:godownStock', (f, g) => inventory.godownStock(own(f), optionalId(g) ?? null));
  handle('inventory:batches', (f, i, g) => inventory.batchStock(own(f), id(i), optionalId(g)));
  handle('inventory:expiry', (f) => inventory.expiry(own(f)));
  handle('inventory:serials', (f, i, inStock) =>
    inventory.serials(own(f), id(i), inStock !== false),
  );
  handle('inventory:serialHistory', (f, q) =>
    inventory.serialHistory(own(f), z.string().max(60).parse(q)),
  );
  handle('inventory:posDay', (f) => inventory.posDay(own(f)));
  handle('inventory:transfers', (f) => inventory.transfers(own(f)));
  handle('inventory:saveTransfer', (f, input) => {
    const firm = own(f);
    return inventory.saveTransfer(firm, transferSchema.parse(input), masters.items(firm));
  });
  handle('inventory:deleteTransfer', (f, i) => inventory.deleteTransfer(own(f), id(i)));
  handle('inventory:labels', async (f, request, m) => {
    const firm = own(f),
      settings = repo.getSettings(firm);
    const html = labelsHtml(
      labelRequest.parse(request) as LabelRequest,
      masters.items(firm),
      repo.get(firm).name,
      (
        (tr) => (k: string) =>
          tr(k) ?? k
      )(translator(settings.language)),
      fontCss(),
    );
    return outputHtml(html, 'BillSathi-labels', mode(m));
  });
  handle('inventory:printTransfer', async (f, i, m) => {
    const firm = own(f),
      settings = repo.getSettings(firm);
    const transfer = inventory.transfers(firm).find((t) => t.id === id(i));
    if (!transfer) throw new Error('notFound');
    const html = transferHtml(
      transfer,
      masters.items(firm),
      repo.get(firm).name,
      (
        (tr) => (k: string) =>
          tr(k) ?? k
      )(translator(settings.language)),
      (d) => formatDate(d, settings),
      fontCss(),
    );
    return outputHtml(html, `Stock-transfer-${transfer.number}`, mode(m));
  });
}
