import { valuation } from './valuation';
import { stockAmount } from '../../../shared/masters';
import { txnLink, type ReportResult, type ReportRow } from '../../../shared/reports';
import {
  Where,
  build,
  col,
  count,
  live,
  money,
  num,
  numberSql,
  partyNameSql,
  query,
  roundQty,
  str,
  type ReportCtx,
} from './engine';

export interface StockItem {
  id: number;
  name: string;
  categoryId: number | null;
  category: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  minStock: number;
  qty: number;
  value: number;
}
/** Every stock-keeping item with its quantity and cost value on a date. */
export function stockItems(
  ctx: ReportCtx,
  asOn: string,
  categoryId?: number | null,
  godownId?: number | null,
): StockItem[] {
  const w = new Where().when(categoryId, 'i.category_id = ?', categoryId ?? null);
  const values = valuation(ctx, asOn).items;
  // Rows without a godown belong to the main store (the firm's first godown).
  const main = godownId
    ? num(
        query(
          ctx,
          'SELECT MIN(id) id FROM godowns WHERE firm_id = ? AND deleted_at IS NULL',
          ctx.firm,
        )[0]?.id,
      )
    : 0;
  const inGodown = godownId ? ' AND COALESCE(sl.godown_id, ?) = ?' : '';
  // Quantities are summed once per item in a grouped sub-query (one pass over the ledger).
  return query(
    ctx,
    `SELECT i.id, i.name, i.category_id, COALESCE(c.name, '') category, COALESCE(u.symbol, '') unit,
        i.sale_price, i.purchase_price, COALESCE(i.min_stock, 0) min_stock, COALESCE(b.qty, 0) qty
     FROM items i LEFT JOIN item_categories c ON c.id = i.category_id LEFT JOIN units u ON u.id = i.unit_id
     LEFT JOIN (
       SELECT sl.item_id, SUM(sl.qty) qty FROM stock_ledger sl LEFT JOIN txns t ON t.id = sl.txn_id
       WHERE sl.firm_id = ? AND sl.deleted_at IS NULL AND sl.date <= ?${inGodown}
         AND (sl.txn_id IS NULL OR (t.status = 'posted' AND t.deleted_at IS NULL))
       GROUP BY sl.item_id
     ) b ON b.item_id = i.id
     WHERE i.firm_id = ? AND i.deleted_at IS NULL AND i.type = 'product'${w.text}
     ORDER BY i.name`,
    ctx.firm,
    asOn,
    ...(godownId ? [main, godownId] : []),
    ctx.firm,
    ...w.params,
  ).map((r) => ({
    id: num(r.id),
    name: str(r.name),
    categoryId: r.category_id === null ? null : num(r.category_id),
    category: str(r.category),
    unit: str(r.unit),
    salePrice: num(r.sale_price),
    purchasePrice: num(r.purchase_price),
    minStock: num(r.min_stock),
    qty: roundQty(num(r.qty)),
    // One godown: valued at purchase price (the average cost is kept for the whole firm).
    value: godownId
      ? stockAmount(Math.max(0, roundQty(num(r.qty))), num(r.purchase_price))
      : (values.get(num(r.id))?.value ?? 0),
  }));
}
const saleValue = (i: StockItem) => stockAmount(Math.max(0, i.qty), i.salePrice);

/** Quantity on hand with what it cost and what it would sell for. */
export function stockSummary(ctx: ReportCtx): ReportResult {
  const asOn = ctx.filters.asOn || ctx.today;
  const items = stockItems(ctx, asOn, ctx.filters.categoryId, ctx.filters.godownId);
  const rows: ReportRow[] = items.map((i) => ({
    item: i.name,
    category: i.category,
    unit: i.unit,
    qty: i.qty,
    purchasePrice: i.purchasePrice,
    purchaseValue: i.value,
    salePrice: i.salePrice,
    saleValue: saleValue(i),
    _link: `items/${i.id}`,
  }));
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build(
    'stockSummary',
    [
      col('item'),
      col('category'),
      col('unit'),
      col('qty', 'qty'),
      col('purchasePrice', 'money'),
      col('purchaseValue', 'money', { total: true }),
      col('salePrice', 'money'),
      col('saleValue', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money('stockValue', sum('purchaseValue')),
        money('saleValue', sum('saleValue')),
        count('items', rows.length),
      ],
      notes: ['reports.note.stockValue'],
    },
  );
}

export function stockByCategory(ctx: ReportCtx): ReportResult {
  const asOn = ctx.filters.asOn || ctx.today;
  const map = new Map<string, ReportRow>();
  for (const i of stockItems(ctx, asOn, ctx.filters.categoryId)) {
    const key = i.category || '';
    const row = map.get(key) ?? {
      category: key || 'reports.noCategory',
      items: 0,
      purchaseValue: 0,
      saleValue: 0,
    };
    row.items = num(row.items) + 1;
    row.purchaseValue = num(row.purchaseValue) + i.value;
    row.saleValue = num(row.saleValue) + saleValue(i);
    map.set(key, row);
  }
  const rows = [...map.values()];
  return build(
    'stockByCategory',
    [
      col('category', 'text', { translate: true }),
      col('items', 'int', { total: true }),
      col('purchaseValue', 'money', { total: true }),
      col('saleValue', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money(
          'stockValue',
          rows.reduce((n, r) => n + num(r.purchaseValue), 0),
        ),
      ],
    },
  );
}

/** Items at or below their minimum stock. */
export function lowStock(ctx: ReportCtx): ReportResult {
  const rows: ReportRow[] = stockItems(ctx, ctx.today, ctx.filters.categoryId)
    .filter((i) => i.minStock > 0 && i.qty <= i.minStock)
    .map((i) => ({
      item: i.name,
      category: i.category,
      unit: i.unit,
      qty: i.qty,
      minStock: i.minStock,
      shortBy: roundQty(i.minStock - i.qty),
      _link: `items/${i.id}`,
    }));
  return build(
    'lowStock',
    [
      col('item'),
      col('category'),
      col('unit'),
      col('qty', 'qty'),
      col('minStock', 'qty'),
      col('shortBy', 'qty'),
    ],
    rows,
    { summary: [count('items', rows.length)], notes: ['reports.note.lowStock'] },
  );
}

/** Every stock movement of the period; with one item chosen it carries a running balance. */
export function stockDetail(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.itemId, 'sl.item_id = ?', f.itemId ?? null);
  const data = query(
    ctx,
    `SELECT sl.id, sl.item_id, i.name item, sl.date, sl.reason, sl.qty, sl.txn_id, t.type,
        COALESCE(${numberSql()}, '') number, COALESCE(${partyNameSql()}, '') party
     FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
     LEFT JOIN txns t ON t.id = sl.txn_id LEFT JOIN parties p ON p.id = t.party_id
     WHERE sl.firm_id = ? AND sl.deleted_at IS NULL AND i.deleted_at IS NULL
       AND (sl.txn_id IS NULL OR (t.status = 'posted' AND t.deleted_at IS NULL))
       AND sl.date <= ?${w.text}
     ORDER BY sl.item_id, sl.date, sl.id`,
    ctx.firm,
    f.to,
    ...w.params,
  );
  const running = new Map<number, number>();
  const rows: ReportRow[] = [];
  for (const r of data) {
    const id = num(r.item_id);
    const balance = roundQty((running.get(id) ?? 0) + num(r.qty));
    running.set(id, balance);
    if (str(r.date) < f.from) continue;
    rows.push({
      date: str(r.date),
      item: str(r.item),
      type: r.type
        ? `reports.type.${str(r.type)}`
        : `reports.type.${str(r.reason) === 'opening' ? 'opening' : 'adjustment'}`,
      number: str(r.number),
      party: str(r.party),
      qtyIn: num(r.qty) > 0 ? num(r.qty) : null,
      qtyOut: num(r.qty) < 0 ? -num(r.qty) : null,
      balance: f.itemId ? balance : null,
      _link: r.type ? (txnLink(str(r.type), num(r.txn_id)) ?? '') : '',
    });
  }
  rows.sort((a, b) => str(a.date).localeCompare(str(b.date)));
  return build(
    'stockDetail',
    [
      col('date', 'date'),
      col('item'),
      col('type', 'text', { translate: true }),
      col('number'),
      col('party'),
      col('qtyIn', 'qty', { total: true }),
      col('qtyOut', 'qty', { total: true }),
      col('balance', 'qty'),
    ],
    rows,
    { notes: f.itemId ? [] : ['reports.note.pickItemBalance'] },
  );
}

/** For each item: opening stock, bought, sold, closing, and the money behind them. */
export function itemDetail(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.itemId, 'i.id = ?', f.itemId ?? null);
  const data = query(
    ctx,
    `SELECT i.id, i.name,
        COALESCE(SUM(CASE WHEN sl.date < ? THEN sl.qty END), 0) opening,
        COALESCE(SUM(CASE WHEN sl.date BETWEEN ? AND ? AND t.type IN ('purchase', 'purchase_return') THEN sl.qty END), 0) bought,
        COALESCE(-SUM(CASE WHEN sl.date BETWEEN ? AND ? AND t.type IN ('sale', 'sale_return') THEN sl.qty END), 0) sold,
        COALESCE(SUM(CASE WHEN sl.date <= ? THEN sl.qty END), 0) closing
     FROM items i LEFT JOIN stock_ledger sl ON sl.item_id = i.id AND sl.deleted_at IS NULL
     LEFT JOIN txns t ON t.id = sl.txn_id
     WHERE i.firm_id = ? AND i.deleted_at IS NULL AND i.type = 'product'
       AND (sl.id IS NULL OR sl.txn_id IS NULL OR (t.status = 'posted' AND t.deleted_at IS NULL))${w.text}
     GROUP BY i.id ORDER BY i.name`,
    f.from,
    f.from,
    f.to,
    f.from,
    f.to,
    f.to,
    ctx.firm,
    ...w.params,
  );
  const amounts = query(
    ctx,
    `SELECT l.item_id, SUM(CASE t.type WHEN 'sale' THEN l.taxable WHEN 'sale_return' THEN -l.taxable ELSE 0 END) sale_amount,
        SUM(CASE t.type WHEN 'purchase' THEN l.taxable WHEN 'purchase_return' THEN -l.taxable ELSE 0 END) purchase_amount
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id
     WHERE ${live()} AND l.item_id IS NOT NULL AND t.date BETWEEN ? AND ? GROUP BY l.item_id`,
    ctx.firm,
    f.from,
    f.to,
  );
  const byItem = new Map(amounts.map((a) => [num(a.item_id), a]));
  const rows: ReportRow[] = data.map((r) => ({
    item: str(r.name),
    opening: roundQty(num(r.opening)),
    bought: roundQty(num(r.bought)),
    sold: roundQty(num(r.sold)),
    closing: roundQty(num(r.closing)),
    saleAmount: num(byItem.get(num(r.id))?.sale_amount),
    purchaseAmount: num(byItem.get(num(r.id))?.purchase_amount),
    _link: `items/${num(r.id)}`,
  }));
  return build(
    'itemDetail',
    [
      col('item'),
      col('opening', 'qty'),
      col('bought', 'qty', { total: true }),
      col('sold', 'qty', { total: true }),
      col('closing', 'qty'),
      col('saleAmount', 'money', { total: true }),
      col('purchaseAmount', 'money', { total: true }),
    ],
    rows,
    { notes: ['reports.note.itemDetail'] },
  );
}

/** Which parties bought (or sold) each item. */
export function itemParties(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.itemId, 'l.item_id = ?', f.itemId ?? null);
  const data = query(
    ctx,
    `SELECT l.item_id, l.name item, t.party_id, COALESCE(p.name, '') party,
        SUM(CASE t.type WHEN 'sale' THEN l.qty WHEN 'sale_return' THEN -l.qty ELSE 0 END) sale_qty,
        SUM(CASE t.type WHEN 'sale' THEN l.total WHEN 'sale_return' THEN -l.total ELSE 0 END) sale_amount,
        SUM(CASE t.type WHEN 'purchase' THEN l.qty WHEN 'purchase_return' THEN -l.qty ELSE 0 END) purchase_qty,
        SUM(CASE t.type WHEN 'purchase' THEN l.total WHEN 'purchase_return' THEN -l.total ELSE 0 END) purchase_amount
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND l.item_id IS NOT NULL AND t.type IN ('sale', 'sale_return', 'purchase', 'purchase_return')
       AND t.date BETWEEN ? AND ?${w.text}
     GROUP BY l.item_id, l.name, t.party_id, p.name ORDER BY l.name, p.name`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const rows: ReportRow[] = data.map((r) => ({
    item: str(r.item),
    party: str(r.party) || 'reports.cashParty',
    saleQty: num(r.sale_qty),
    saleAmount: num(r.sale_amount),
    purchaseQty: num(r.purchase_qty),
    purchaseAmount: num(r.purchase_amount),
    _link: r.party_id ? `parties/${num(r.party_id)}` : '',
  }));
  return build(
    'itemParties',
    [
      col('item'),
      col('party', 'text', { translate: true }),
      col('saleQty', 'qty', { total: true }),
      col('saleAmount', 'money', { total: true }),
      col('purchaseQty', 'qty', { total: true }),
      col('purchaseAmount', 'money', { total: true }),
    ],
    rows,
    { notes: ['reports.note.withGst'] },
  );
}
