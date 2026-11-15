import { z } from 'zod';
import type { DatabaseContext } from './db';
import { salesRepository } from './db/sales';
import { invoicePrint } from './services/invoice-print';
import { documentType, type Receipt, type SaleDocument } from '../shared/sales';
import { THEMES } from '../shared/print-settings';
export function registerSalesIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const repo = salesRepository(context),
    print = invoicePrint(context);
  const id = (v: unknown) => z.number().int().positive().parse(v),
    text = (v: unknown) => z.string().max(30).parse(v);
  const theme = (v: unknown) => (v === undefined ? undefined : z.enum(THEMES).parse(v));
  handle('sales:list', (f, type, deleted) =>
    repo.list(
      id(f),
      type === undefined ? undefined : text(type),
      z.boolean().parse(deleted ?? false),
    ),
  );
  handle('sales:get', (f, i) => repo.get(id(f), id(i)));
  handle('sales:next', (f, type, prefix) => repo.next(id(f), text(type), text(prefix)));
  handle('sales:available', (f, type, prefix, number, except) =>
    repo.available(
      id(f),
      text(type),
      text(prefix),
      id(number),
      except === null ? null : id(except),
    ),
  );
  handle('sales:save', (f, i, doc) =>
    repo.save(id(f), i === null ? null : id(i), doc as SaleDocument),
  );
  handle('sales:receipt', (f, doc, i) =>
    repo.receipt(id(f), doc as Receipt, i === undefined ? undefined : id(i)),
  );
  handle('sales:getReceipt', (f, i) => repo.getReceipt(id(f), id(i)));
  handle('sales:action', (f, i, a) =>
    repo.action(id(f), id(i), z.enum(['delete', 'restore', 'cancel', 'reopen', 'close']).parse(a)),
  );
  handle('sales:convert', (f, i, type, quantities) =>
    repo.convert(
      id(f),
      id(i),
      documentType.parse(type),
      quantities === undefined
        ? undefined
        : z.array(z.number().min(0).max(1e9)).max(500).parse(quantities),
    ),
  );
  handle('sales:categories', (f, kind) =>
    repo.categories(id(f), z.enum(['expense', 'other_income']).parse(kind)),
  );
  handle('sales:category', (f, kind, name) =>
    repo.category(
      id(f),
      z.enum(['expense', 'other_income']).parse(kind),
      z.string().max(120).parse(name),
    ),
  );
  handle('sales:accounts', (f) => repo.accounts(id(f)));
  handle('sales:attach', (f) => print.attach(id(f)));
  handle('sales:attachment', (f, i) => print.attachment(id(f), id(i)));
  handle('sales:preview', (f, i, th) => print.preview(id(f), id(i), theme(th)));
  handle('sales:output', (f, i, a, th) =>
    print.output(
      id(f),
      id(i),
      z.enum(['pdf', 'print', 'thermal', 'whatsapp', 'email']).parse(a),
      theme(th),
    ),
  );
}
