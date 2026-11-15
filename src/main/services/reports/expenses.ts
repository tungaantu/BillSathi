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
  paymentTypeSql,
  query,
  roundQty,
  str,
  type ReportCtx,
} from './engine';
import { categoryLabel } from './profit';

/** Every expense bill of the period. */
export function expenseReport(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where()
    .when(f.expenseCategoryId, 't.expense_category_id = ?', f.expenseCategoryId ?? null)
    .when(f.paymentType, paymentTypeSql('t'), f.paymentType ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, ${numberSql()} number, ${partyNameSql()} party, c.name category, t.total,
        t.cgst + t.sgst + t.igst + t.cess tax, COALESCE(t.description, '') note
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id LEFT JOIN expense_categories c ON c.id = t.expense_category_id
     WHERE ${live()} AND t.type = 'expense' AND t.date BETWEEN ? AND ?${w.text} ORDER BY t.date, t.id`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const rows: ReportRow[] = data.map((r) => ({
    date: str(r.date),
    number: str(r.number),
    category: categoryLabel(r.category),
    party: str(r.party) || str(r.note),
    tax: num(r.tax),
    total: num(r.total),
    _link: txnLink('expense', num(r.id)) ?? '',
  }));
  const total = rows.reduce((n, r) => n + num(r.total), 0);
  return build(
    'expenseReport',
    [
      col('date', 'date'),
      col('number'),
      col('category', 'text', { translate: true }),
      col('party'),
      col('tax', 'money', { total: true }),
      col('total', 'money', { total: true }),
    ],
    rows,
    { summary: [money('totalExpenses', total, 'danger'), count('documents', rows.length)] },
  );
}

export function expenseCategory(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const data = query(
    ctx,
    `SELECT c.id, c.name, COUNT(*) documents, SUM(t.total) total FROM txns t
     LEFT JOIN expense_categories c ON c.id = t.expense_category_id
     WHERE ${live()} AND t.type = 'expense' AND t.date BETWEEN ? AND ?
     GROUP BY c.id, c.name ORDER BY total DESC`,
    ctx.firm,
    from,
    to,
  );
  const grand = data.reduce((n, r) => n + num(r.total), 0);
  const rows: ReportRow[] = data.map((r) => ({
    category: categoryLabel(r.name),
    documents: num(r.documents),
    total: num(r.total),
    share: grand ? Math.round((num(r.total) * 10000) / grand) : 0,
  }));
  return build(
    'expenseCategory',
    [
      col('category', 'text', { translate: true }),
      col('documents', 'int', { total: true }),
      col('total', 'money', { total: true }),
      col('share', 'percent'),
    ],
    rows,
    { summary: [money('totalExpenses', grand, 'danger')] },
  );
}

/** Expenses by what was bought (the item or description on each expense bill). */
export function expenseItem(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const data = query(
    ctx,
    `SELECT l.name item, SUM(l.qty) qty, SUM(l.total) total, COUNT(DISTINCT t.id) documents
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id
     WHERE ${live()} AND t.type = 'expense' AND t.date BETWEEN ? AND ?
     GROUP BY l.name ORDER BY total DESC`,
    ctx.firm,
    from,
    to,
  );
  const rows: ReportRow[] = data.map((r) => ({
    item: str(r.item),
    documents: num(r.documents),
    qty: roundQty(num(r.qty)),
    total: num(r.total),
  }));
  return build(
    'expenseItem',
    [
      col('item'),
      col('documents', 'int', { total: true }),
      col('qty', 'qty', { total: true }),
      col('total', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money(
          'totalExpenses',
          rows.reduce((n, r) => n + num(r.total), 0),
          'danger',
        ),
      ],
    },
  );
}

/** Sale orders or purchase orders and whether they are still open. */
export function orders(ctx: ReportCtx, type: 'sale_order' | 'purchase_order'): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.partyId, 't.party_id = ?', f.partyId ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.due_date, t.status, ${numberSql()} number, ${partyNameSql()} party, t.total
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE t.firm_id = ? AND t.deleted_at IS NULL AND t.type = ? AND t.status <> 'draft'
       AND t.date BETWEEN ? AND ?${w.text} ORDER BY t.date, t.id`,
    ctx.firm,
    type,
    f.from,
    f.to,
    ...w.params,
  );
  const rows: ReportRow[] = data.map((r) => ({
    date: str(r.date),
    number: str(r.number),
    party: str(r.party),
    dueDate: str(r.due_date) || null,
    total: num(r.total),
    status: `reports.status.${str(r.status)}`,
    _link: txnLink(type, num(r.id)) ?? '',
  }));
  const open = data.filter((r) => str(r.status) === 'open');
  return build(
    type === 'sale_order' ? 'saleOrders' : 'purchaseOrders',
    [
      col('date', 'date'),
      col('number'),
      col('party'),
      col('dueDate', 'date'),
      col('total', 'money', { total: true }),
      col('status', 'text', { translate: true }),
    ],
    rows,
    {
      summary: [
        count('documents', rows.length),
        count('openOrders', open.length),
        money(
          'openValue',
          open.reduce((n, r) => n + num(r.total), 0),
        ),
      ],
    },
  );
}
