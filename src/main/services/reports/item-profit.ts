import { valuation } from './valuation';
import type { ReportResult, ReportRow } from '../../../shared/reports';
import {
  Where,
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

interface ProfitLine {
  id: number;
  name: string;
  category: string;
  qty: number;
  sale: number;
  cost: number;
}
function itemProfits(ctx: ReportCtx): ProfitLine[] {
  const f = ctx.filters;
  const w = new Where().when(f.categoryId, 'i.category_id = ?', f.categoryId ?? null);
  const sales = query(
    ctx,
    `SELECT i.id, i.name, COALESCE(c.name, '') category,
        SUM(CASE t.type WHEN 'sale' THEN l.qty ELSE -l.qty END) qty,
        SUM(CASE t.type WHEN 'sale' THEN l.taxable ELSE -l.taxable END) sale
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id JOIN items i ON i.id = l.item_id
     LEFT JOIN item_categories c ON c.id = i.category_id
     WHERE ${live()} AND t.type IN ('sale', 'sale_return') AND t.date BETWEEN ? AND ?${w.text}
     GROUP BY i.id ORDER BY i.name`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const cost = new Map<number, number>();
  for (const c of valuation(ctx, f.to).costs.filter((c) => c.date >= f.from))
    cost.set(c.itemId, (cost.get(c.itemId) ?? 0) + c.cost);
  return sales.map((r) => ({
    id: num(r.id),
    name: str(r.name),
    category: str(r.category),
    qty: roundQty(num(r.qty)),
    sale: num(r.sale),
    cost: cost.get(num(r.id)) ?? 0,
  }));
}
const profitColumns = (first: ReturnType<typeof col>[]) => [
  ...first,
  col('qty', 'qty', { total: true }),
  col('sale', 'money', { total: true }),
  col('cost', 'money', { total: true }),
  col('profit', 'money', { total: true }),
  col('margin', 'percent'),
];
export function itemProfit(ctx: ReportCtx): ReportResult {
  const rows: ReportRow[] = itemProfits(ctx).map((r) => ({
    item: r.name,
    category: r.category,
    qty: r.qty,
    sale: r.sale,
    cost: r.cost,
    profit: r.sale - r.cost,
    margin: ratioBps(r.sale - r.cost, r.sale),
    _link: `items/${r.id}`,
  }));
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build('itemProfit', profitColumns([col('item'), col('category')]), rows, {
    totals: (_r, base) => ({ ...base, margin: ratioBps(sum('profit'), sum('sale')) }),
    summary: [money('netSales', sum('sale')), money('grossProfit', sum('profit'), 'success')],
    notes: ['reports.note.billProfit'],
  });
}
export function categoryProfit(ctx: ReportCtx): ReportResult {
  const map = new Map<string, ReportRow>();
  for (const r of itemProfits({ ...ctx, filters: { ...ctx.filters, categoryId: null } })) {
    const row = map.get(r.category) ?? {
      category: r.category || 'reports.noCategory',
      qty: 0,
      sale: 0,
      cost: 0,
      profit: 0,
      margin: 0,
    };
    row.qty = roundQty(num(row.qty) + r.qty);
    row.sale = num(row.sale) + r.sale;
    row.cost = num(row.cost) + r.cost;
    row.profit = num(row.sale) - num(row.cost);
    row.margin = ratioBps(num(row.profit), num(row.sale));
    map.set(r.category, row);
  }
  const rows = [...map.values()];
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build(
    'categoryProfit',
    profitColumns([col('category', 'text', { translate: true })]),
    rows,
    {
      totals: (_r, base) => ({ ...base, margin: ratioBps(sum('profit'), sum('sale')) }),
      summary: [money('netSales', sum('sale')), money('grossProfit', sum('profit'), 'success')],
      notes: ['reports.note.billProfit'],
    },
  );
}
