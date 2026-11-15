import { valuation } from './valuation';
import { txnLink, type ReportResult, type ReportRow } from '../../../shared/reports';
import {
  build,
  col,
  live,
  money,
  num,
  numberSql,
  partyNameSql,
  query,
  ratioBps,
  str,
  Where,
  type ReportCtx,
} from './engine';

const GST = 't.cgst + t.sgst + t.igst + t.cess';
/** Name of an expense or income category, translated when it is one of the built-in keys. */
export const categoryLabel = (name: unknown) =>
  name ? `category.${str(name)}|${str(name)}` : 'reports.uncategorised';
export interface ProfitFigures {
  sales: number;
  salesReturns: number;
  cogs: number;
  purchaseCharges: number;
  otherIncome: number;
  expenses: { categoryId: number | null; name: string; amount: number }[];
  expenseTotal: number;
  netSales: number;
  grossProfit: number;
  netProfit: number;
}
const one = (ctx: ReportCtx, sql: string, ...params: (string | number)[]) =>
  num(query(ctx, sql, ctx.firm, ...params)[0]?.v);
/**
 * Profit and loss for a period, all in paise and without GST.
 * Cost of goods sold is the cost recorded in the stock ledger when stock left (or returned),
 * which is the item's purchase price at that moment.
 */
export function profitFigures(ctx: ReportCtx, from: string, to: string): ProfitFigures {
  const taxable = (type: string) =>
    one(
      ctx,
      `SELECT COALESCE(SUM(t.taxable), 0) v FROM txns t WHERE ${live()} AND t.type = ? AND t.date BETWEEN ? AND ?`,
      type,
      from,
      to,
    );
  const sales = taxable('sale'),
    salesReturns = taxable('sale_return');
  const cogs = valuation(ctx, to)
    .costs.filter((c) => c.date >= from)
    .reduce((n, c) => n + c.cost, 0);
  const purchaseCharges = one(
    ctx,
    `SELECT COALESCE(SUM((ac.taxable + CASE WHEN t.itc_eligible = 1 THEN 0 ELSE ac.cgst + ac.sgst + ac.igst + ac.cess END)
        * CASE WHEN t.type = 'purchase_return' THEN -1 ELSE 1 END), 0) v
     FROM additional_charges ac JOIN txns t ON t.id = ac.txn_id
     WHERE ${live()} AND t.type IN ('purchase', 'purchase_return') AND t.date BETWEEN ? AND ?`,
    from,
    to,
  );
  const otherIncome = one(
    ctx,
    `SELECT COALESCE(SUM(CASE WHEN ${GST} > 0 THEN t.taxable ELSE t.total END), 0) v
     FROM txns t WHERE ${live()} AND t.type = 'other_income' AND t.date BETWEEN ? AND ?`,
    from,
    to,
  );
  const expenses = query(
    ctx,
    `SELECT t.expense_category_id id, c.name,
        SUM(CASE WHEN ${GST} > 0 AND t.itc_eligible = 1 THEN t.taxable ELSE t.total END) amount
     FROM txns t LEFT JOIN expense_categories c ON c.id = t.expense_category_id
     WHERE ${live()} AND t.type = 'expense' AND t.date BETWEEN ? AND ?
     GROUP BY t.expense_category_id, c.name ORDER BY c.name`,
    ctx.firm,
    from,
    to,
  ).map((r) => ({
    categoryId: r.id === null ? null : num(r.id),
    name: str(r.name),
    amount: num(r.amount),
  }));
  const expenseTotal = expenses.reduce((n, e) => n + e.amount, 0);
  const netSales = sales - salesReturns;
  const grossProfit = netSales - cogs;
  return {
    sales,
    salesReturns,
    cogs,
    purchaseCharges,
    otherIncome,
    expenses,
    expenseTotal,
    netSales,
    grossProfit,
    netProfit: grossProfit - purchaseCharges - expenseTotal + otherIncome,
  };
}

export function profitLoss(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const p = profitFigures(ctx, from, to);
  const line = (label: string, amount: number, extra: ReportRow = {}): ReportRow => ({
    label,
    amount,
    ...extra,
  });
  const rows: ReportRow[] = [
    line('reports.pl.sales', p.sales),
    line('reports.pl.salesReturns', -p.salesReturns),
    line('reports.pl.netSales', p.netSales, { _bold: 1 }),
    line('reports.pl.cogs', -p.cogs),
    line('reports.pl.grossProfit', p.grossProfit, { _bold: 1 }),
    line('reports.pl.otherIncome', p.otherIncome),
    ...(p.purchaseCharges ? [line('reports.pl.purchaseCharges', -p.purchaseCharges)] : []),
    line('reports.pl.expenses', -p.expenseTotal, { _bold: 1 }),
    ...p.expenses.map((e) => line(categoryLabel(e.name), -e.amount, { _indent: 1 })),
    line('reports.pl.netProfit', p.netProfit, { _bold: 1 }),
  ];
  return build(
    'profitLoss',
    [col('label', 'text', { translate: true }), col('amount', 'money')],
    rows,
    {
      noTotals: true,
      summary: [
        money('netSales', p.netSales),
        money('grossProfit', p.grossProfit),
        money('expenses', p.expenseTotal + p.purchaseCharges, 'danger'),
        money('netProfit', p.netProfit, p.netProfit >= 0 ? 'success' : 'danger'),
      ],
      notes: ['reports.note.plNoGst', 'reports.note.plCogs'],
    },
  );
}

/** Profit on each sale invoice: sale value without GST less the cost of what was sold. */
export function billProfit(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.partyId, 't.party_id = ?', f.partyId ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, ${numberSql()} number, ${partyNameSql()} party, t.taxable, 0 cost
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type = 'sale' AND t.date BETWEEN ? AND ?${w.text}
     ORDER BY t.date, t.id`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const costs = valuation(ctx, f.to).costs;
  const byTxn = new Map<number, number>();
  for (const c of costs) byTxn.set(c.txnId, (byTxn.get(c.txnId) ?? 0) + c.cost);
  const rows: ReportRow[] = data.map((r) => {
    r.cost = byTxn.get(num(r.id)) ?? 0;
    const profit = num(r.taxable) - num(r.cost);
    return {
      date: str(r.date),
      number: str(r.number),
      party: str(r.party) || 'reports.cashParty',
      sale: num(r.taxable),
      cost: num(r.cost),
      profit,
      margin: ratioBps(profit, num(r.taxable)),
      _link: txnLink('sale', num(r.id)) ?? '',
    };
  });
  const sum = (key: string) => rows.reduce((n, r) => n + num(r[key]), 0);
  return build(
    'billProfit',
    [
      col('date', 'date'),
      col('number'),
      col('party', 'text', { translate: true }),
      col('sale', 'money', { total: true }),
      col('cost', 'money', { total: true }),
      col('profit', 'money', { total: true }),
      col('margin', 'percent'),
    ],
    rows,
    {
      totals: (_rows, base) => ({ ...base, margin: ratioBps(sum('profit'), sum('sale')) }),
      summary: [
        money('netSales', sum('sale')),
        money('cost', sum('cost')),
        money('grossProfit', sum('profit'), sum('profit') >= 0 ? 'success' : 'danger'),
      ],
      notes: ['reports.note.billProfit'],
    },
  );
}

const MONEY_TYPES = "('cash', 'bank', 'upi', 'card')";
/** Money in and out of cash and bank accounts, grouped by what caused it. */
export function cashFlow(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const dateSql = 'COALESCE(py.posting_date, t.date)';
  const opening =
    num(
      query(
        ctx,
        `SELECT COALESCE(SUM(opening_balance), 0) v FROM payment_accounts WHERE firm_id = ? AND deleted_at IS NULL AND type IN ${MONEY_TYPES}`,
        ctx.firm,
      )[0]?.v,
    ) +
    num(
      query(
        ctx,
        `SELECT COALESCE(SUM(py.amount * py.direction), 0) v FROM txn_payments py
         JOIN txns t ON t.id = py.txn_id JOIN payment_accounts pa ON pa.id = py.account_id
         WHERE ${live()} AND py.reversed = 0 AND pa.type IN ${MONEY_TYPES} AND ${dateSql} < ?`,
        ctx.firm,
        from,
      )[0]?.v,
    );
  const moves = query(
    ctx,
    `SELECT t.type, py.direction, SUM(py.amount) amount FROM txn_payments py
     JOIN txns t ON t.id = py.txn_id JOIN payment_accounts pa ON pa.id = py.account_id
     WHERE ${live()} AND py.reversed = 0 AND pa.type IN ${MONEY_TYPES} AND ${dateSql} BETWEEN ? AND ?
     GROUP BY t.type, py.direction ORDER BY t.type`,
    ctx.firm,
    from,
    to,
  );
  const side = (direction: number) =>
    moves
      .filter((m) => num(m.direction) === direction)
      .map((m) => ({ type: str(m.type), amount: num(m.amount) }));
  const moneyIn = side(1),
    moneyOut = side(-1);
  const totalIn = moneyIn.reduce((n, m) => n + m.amount, 0),
    totalOut = moneyOut.reduce((n, m) => n + m.amount, 0);
  const rows: ReportRow[] = [
    { label: 'reports.cf.opening', amount: opening, _bold: 1 },
    { label: 'reports.cf.in', amount: totalIn, _bold: 1 },
    ...moneyIn.map((m) => ({ label: `reports.type.${m.type}`, amount: m.amount, _indent: 1 })),
    { label: 'reports.cf.out', amount: -totalOut, _bold: 1 },
    ...moneyOut.map((m) => ({ label: `reports.type.${m.type}`, amount: -m.amount, _indent: 1 })),
    { label: 'reports.cf.net', amount: totalIn - totalOut, _bold: 1 },
    { label: 'reports.cf.closing', amount: opening + totalIn - totalOut, _bold: 1 },
  ];
  return build(
    'cashFlow',
    [col('label', 'text', { translate: true }), col('amount', 'money')],
    rows,
    {
      noTotals: true,
      summary: [
        money('openingCash', opening),
        money('moneyIn', totalIn, 'success'),
        money('moneyOut', totalOut, 'danger'),
        money('closingCash', opening + totalIn - totalOut),
      ],
      notes: ['reports.note.cashFlow'],
    },
  );
}
