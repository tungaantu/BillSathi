import type { ReportResult, ReportRow } from '../../../shared/reports';
import {
  build,
  col,
  live,
  money,
  num,
  query,
  ratioBps,
  roundQty,
  str,
  type ReportCtx,
} from './engine';

/** Sales or purchases by item category, net of returns, without GST. */
export function categorySales(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const side = f.side === 'purchase' ? 'purchase' : 'sale';
  const data = query(
    ctx,
    `SELECT COALESCE(c.name, '') category,
        SUM(CASE WHEN t.type = ? THEN l.qty ELSE -l.qty END) qty,
        SUM(CASE WHEN t.type = ? THEN l.taxable ELSE -l.taxable END) amount
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id LEFT JOIN items i ON i.id = l.item_id
     LEFT JOIN item_categories c ON c.id = i.category_id
     WHERE ${live()} AND t.type IN (?, ?) AND t.date BETWEEN ? AND ?
     GROUP BY c.name ORDER BY c.name`,
    side,
    side,
    ctx.firm,
    side,
    `${side}_return`,
    f.from,
    f.to,
  );
  const rows: ReportRow[] = data.map((r) => ({
    category: str(r.category) || 'reports.noCategory',
    qty: roundQty(num(r.qty)),
    amount: num(r.amount),
  }));
  return build(
    'categorySales',
    [
      col('category', 'text', { translate: true }),
      col('qty', 'qty', { total: true }),
      col('amount', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money(
          'net',
          rows.reduce((n, r) => n + num(r.amount), 0),
        ),
      ],
    },
  );
}

/** Discount given on sales (or received on purchases), item by item. */
export function itemDiscount(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const side = f.side === 'purchase' ? 'purchase' : 'sale';
  const data = query(
    ctx,
    `SELECT l.item_id, l.name item, SUM(l.qty) qty, SUM(l.discount) discount, SUM(l.taxable) taxable
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id
     WHERE ${live()} AND t.type = ? AND t.date BETWEEN ? AND ?
     GROUP BY l.item_id, l.name HAVING SUM(l.discount) > 0 ORDER BY SUM(l.discount) DESC`,
    ctx.firm,
    side,
    f.from,
    f.to,
  );
  const rows: ReportRow[] = data.map((r) => ({
    item: str(r.item),
    qty: roundQty(num(r.qty)),
    gross: num(r.taxable) + num(r.discount),
    discount: num(r.discount),
    percent: ratioBps(num(r.discount), num(r.taxable) + num(r.discount)),
    _link: r.item_id ? `items/${num(r.item_id)}` : '',
  }));
  return build(
    'itemDiscount',
    [
      col('item'),
      col('qty', 'qty', { total: true }),
      col('gross', 'money', { total: true }),
      col('discount', 'money', { total: true }),
      col('percent', 'percent'),
    ],
    rows,
    {
      totals: (_r, base) => ({
        ...base,
        percent: ratioBps(num(base.discount), num(base.gross)),
      }),
      summary: [
        money(
          'discount',
          rows.reduce((n, r) => n + num(r.discount), 0),
        ),
      ],
      notes: ['reports.note.itemDiscount'],
    },
  );
}
