import type { ReportResult, ReportRow } from '../../../shared/reports';
import { inventoryRepository } from '../../db/inventory';
import { build, col, count, type ReportCtx } from './engine';

/** Batches in stock with their expiry, soonest first; expired and 30/60/90-day buckets. */
export function batchExpiry(ctx: ReportCtx): ReportResult {
  const on = ctx.filters.asOn || ctx.today;
  const rows: ReportRow[] = inventoryRepository(ctx.context)
    .expiry(ctx.firm, on)
    .filter((r) => !ctx.filters.itemId || r.itemId === ctx.filters.itemId)
    .map((r) => ({
      item: r.item,
      batch: r.number,
      mfgDate: r.mfgDate ?? '',
      expDate: r.expDate ?? '',
      qty: r.qty,
      status: `inventory.expiry.${r.status}`,
      _link: `items/${r.itemId}`,
    }));
  const n = (s: string) => rows.filter((r) => r.status === `inventory.expiry.${s}`).length;
  return build(
    'batchExpiry',
    [
      col('item'),
      col('batch'),
      col('mfgDate', 'date'),
      col('expDate', 'date'),
      col('qty', 'qty', { total: true }),
      col('status', 'text', { translate: true }),
    ],
    rows,
    {
      summary: [
        count('expired', n('expired')),
        count('expiring30', n('expiring30')),
        count('batches', rows.length),
      ],
      notes: ['reports.note.batchExpiry'],
    },
  );
}
