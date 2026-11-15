import { addDays } from '../../../shared/report-dates';
import type { InsightData } from '../../../shared/reports';
import { live, num, query, settledSql, str, type ReportCtx } from './engine';
import { profitFigures } from './profit';
import { stockItems } from './stock';

type Range = 'week' | 'month' | 'year';
/** Sales against purchases, best customers and items, this month's profit and the things that need attention. */
export function insights(ctx: ReportCtx, range: Range): InsightData {
  const today = ctx.today;
  const monthly = range === 'year';
  const first = monthly
    ? `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 12 ? 1 : 0)}-${String((Number(today.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01`
    : addDays(today, range === 'week' ? -6 : -29);
  const cut = monthly ? 7 : 10;
  const totals = query(
    ctx,
    `SELECT substr(t.date, 1, ${cut}) label, t.type, SUM(t.total) total FROM txns t
     WHERE ${live()} AND t.type IN ('sale', 'purchase') AND t.date BETWEEN ? AND ?
     GROUP BY label, t.type`,
    ctx.firm,
    first,
    today,
  );
  const labels: string[] = [];
  if (monthly) {
    let y = Number(today.slice(0, 4)),
      m = Number(today.slice(5, 7));
    for (let i = 0; i < 12; i++) {
      labels.unshift(`${y}-${String(m).padStart(2, '0')}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
  } else for (let d = first; d <= today; d = addDays(d, 1)) labels.push(d);
  const series = labels.map((label) => ({
    label,
    sales: num(totals.find((t) => str(t.label) === label && str(t.type) === 'sale')?.total),
    purchase: num(totals.find((t) => str(t.label) === label && str(t.type) === 'purchase')?.total),
  }));
  const topCustomers = query(
    ctx,
    `SELECT p.id, p.name, SUM(CASE t.type WHEN 'sale' THEN t.total ELSE -t.total END) total
     FROM txns t JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type IN ('sale', 'sale_return') AND t.date BETWEEN ? AND ?
     GROUP BY p.id ORDER BY total DESC LIMIT 5`,
    ctx.firm,
    first,
    today,
  ).map((r) => ({ partyId: num(r.id), name: str(r.name), total: num(r.total) }));
  const topItems = query(
    ctx,
    `SELECT l.item_id, l.name, SUM(CASE t.type WHEN 'sale' THEN l.total ELSE -l.total END) total,
        SUM(CASE t.type WHEN 'sale' THEN l.qty ELSE -l.qty END) qty
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id
     WHERE ${live()} AND l.item_id IS NOT NULL AND t.type IN ('sale', 'sale_return') AND t.date BETWEEN ? AND ?
     GROUP BY l.item_id ORDER BY total DESC LIMIT 5`,
    ctx.firm,
    first,
    today,
  ).map((r) => ({
    itemId: num(r.item_id),
    name: str(r.name),
    total: num(r.total),
    qty: num(r.qty),
  }));
  const monthStart = `${today.slice(0, 7)}-01`;
  const overdue = query(
    ctx,
    `SELECT t.total - MIN(t.total, ${settledSql()}) AS due FROM txns t
     WHERE ${live()} AND t.type = 'sale' AND t.due_date IS NOT NULL AND t.due_date < ?`,
    ctx.firm,
    today,
  );
  const open = overdue.map((r) => num(r.due)).filter((v) => v > 0);
  const cheques = num(
    query(
      ctx,
      `SELECT COUNT(*) v FROM cheques c JOIN txns t ON t.id = c.txn_id
       WHERE c.firm_id = ? AND c.deleted_at IS NULL AND c.status = 'open' AND t.status = 'posted' AND t.deleted_at IS NULL
         AND c.date BETWEEN ? AND ?`,
      ctx.firm,
      today,
      addDays(today, 3),
    )[0]?.v,
  );
  return {
    series,
    topCustomers,
    topItems,
    profitMonth: profitFigures(ctx, monthStart, today).netProfit,
    profitFrom: monthStart,
    alerts: {
      overdueCount: open.length,
      overdueTotal: open.reduce((n, v) => n + v, 0),
      lowStock: stockItems(ctx, today).filter((i) => i.minStock > 0 && i.qty <= i.minStock).length,
      chequesDue: cheques,
    },
  };
}
