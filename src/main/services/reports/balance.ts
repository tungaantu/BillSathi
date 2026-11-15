import { stockItems } from './stock';
import type { ReportResult, ReportRow } from '../../../shared/reports';
import { build, col, live, money, num, query, type ReportCtx } from './engine';
import { partyBalances } from './parties';
import { profitFigures } from './profit';

const GST = 't.cgst + t.sgst + t.igst + t.cess';
export interface Position {
  asOn: string;
  cash: number;
  bank: number;
  pendingCheques: number;
  receivables: number;
  stock: number;
  gstCredit: number;
  payables: number;
  loans: number;
  gstPayable: number;
  assets: number;
  liabilities: number;
  /** Owner's capital: assets minus liabilities. It is the balancing figure. */
  capital: number;
  profitToDate: number;
  /** Capital at the start, i.e. capital less all profit earned so far. */
  openingCapital: number;
  sales: number;
  salesReturns: number;
  cogs: number;
  otherIncome: number;
  expenses: number;
}
const scalar = (ctx: ReportCtx, sql: string, ...params: (string | number)[]) =>
  num(query(ctx, sql, ...params)[0]?.v);

/** Everything the balance sheet and trial balance are built from, on one date. */
export function position(ctx: ReportCtx): Position {
  const asOn = ctx.filters.asOn || ctx.today;
  const dateSql = 'COALESCE(py.posting_date, t.date)';
  const account = (types: string) =>
    scalar(
      ctx,
      `SELECT COALESCE(SUM(pa.opening_balance), 0) v FROM payment_accounts pa
       WHERE pa.firm_id = ? AND pa.deleted_at IS NULL AND pa.type IN (${types}) AND COALESCE(pa.opening_date, '0000-01-01') <= ?`,
      ctx.firm,
      asOn,
    ) +
    scalar(
      ctx,
      `SELECT COALESCE(SUM(py.amount * py.direction), 0) v FROM txn_payments py
       JOIN txns t ON t.id = py.txn_id JOIN payment_accounts pa ON pa.id = py.account_id
       WHERE ${live()} AND py.reversed = 0 AND pa.deleted_at IS NULL AND pa.type IN (${types}) AND ${dateSql} <= ?`,
      ctx.firm,
      asOn,
    );
  const cash = account("'cash'"),
    bank = account("'bank', 'upi', 'card'"),
    pendingCheques = account("'cheque'");
  const balances = partyBalances(ctx, asOn);
  const receivables = balances.reduce((n, p) => n + Math.max(0, p.balance), 0),
    payables = balances.reduce((n, p) => n + Math.max(0, -p.balance), 0);
  const stock = stockItems(ctx, asOn).reduce((n, i) => n + i.value, 0);
  const loans =
    scalar(
      ctx,
      'SELECT COALESCE(SUM(principal), 0) v FROM loans WHERE firm_id = ? AND deleted_at IS NULL AND COALESCE(start_date, ?) <= ?',
      ctx.firm,
      asOn,
      asOn,
    ) -
    scalar(
      ctx,
      `SELECT COALESCE(SUM(t.total), 0) v FROM txns t WHERE ${live()} AND t.type = 'loan_payment' AND t.date <= ?`,
      ctx.firm,
      asOn,
    );
  const output = scalar(
    ctx,
    `SELECT COALESCE(SUM(CASE t.type WHEN 'sale' THEN ${GST} ELSE -(${GST}) END), 0) v FROM txns t
     WHERE ${live()} AND t.type IN ('sale', 'sale_return') AND t.date <= ?`,
    ctx.firm,
    asOn,
  );
  const input = scalar(
    ctx,
    `SELECT COALESCE(SUM(CASE WHEN t.type = 'purchase_return' THEN -(${GST}) ELSE ${GST} END), 0) v FROM txns t
     WHERE ${live()} AND t.type IN ('purchase', 'purchase_return', 'expense') AND t.itc_eligible = 1 AND t.date <= ?`,
    ctx.firm,
    asOn,
  );
  const gstNet = output - input;
  const profit = profitFigures(ctx, '0000-01-01', asOn);
  const assets = cash + bank + pendingCheques + receivables + stock + Math.max(0, -gstNet);
  const liabilities = payables + loans + Math.max(0, gstNet);
  const capital = assets - liabilities;
  return {
    asOn,
    cash,
    bank,
    pendingCheques,
    receivables,
    stock,
    gstCredit: Math.max(0, -gstNet),
    payables,
    loans,
    gstPayable: Math.max(0, gstNet),
    assets,
    liabilities,
    capital,
    profitToDate: profit.netProfit,
    openingCapital: capital - profit.netProfit,
    sales: profit.sales,
    salesReturns: profit.salesReturns,
    cogs: profit.cogs,
    otherIncome: profit.otherIncome,
    expenses: profit.expenseTotal + profit.purchaseCharges,
  };
}

/** Every account balance in a debit or credit column; the two columns always agree. */
export function trialBalance(ctx: ReportCtx): ReportResult {
  const p = position(ctx);
  const side = (label: string, amount: number, normal: 'debit' | 'credit'): ReportRow => {
    const debit = normal === 'debit' ? amount >= 0 : amount < 0;
    return {
      account: label,
      debit: debit ? Math.abs(amount) : null,
      credit: debit ? null : Math.abs(amount),
    };
  };
  const entries: [string, number, 'debit' | 'credit'][] = [
    ['reports.acc.cash', p.cash, 'debit'],
    ['reports.acc.bank', p.bank, 'debit'],
    ['reports.acc.cheques', p.pendingCheques, 'debit'],
    ['reports.acc.receivables', p.receivables, 'debit'],
    ['reports.acc.stock', p.stock, 'debit'],
    ['reports.acc.gstCredit', p.gstCredit, 'debit'],
    ['reports.acc.salesReturns', p.salesReturns, 'debit'],
    ['reports.acc.cogs', p.cogs, 'debit'],
    ['reports.acc.expenses', p.expenses, 'debit'],
    ['reports.acc.payables', p.payables, 'credit'],
    ['reports.acc.loans', p.loans, 'credit'],
    ['reports.acc.gstPayable', p.gstPayable, 'credit'],
    ['reports.acc.sales', p.sales, 'credit'],
    ['reports.acc.otherIncome', p.otherIncome, 'credit'],
    ['reports.acc.openingCapital', p.openingCapital, 'credit'],
  ];
  const rows = entries.filter(([, amount]) => amount !== 0).map(([l, a, n]) => side(l, a, n));
  const debit = rows.reduce((n, r) => n + num(r.debit), 0),
    credit = rows.reduce((n, r) => n + num(r.credit), 0);
  return build(
    'trialBalance',
    [
      col('account', 'text', { translate: true }),
      col('debit', 'money', { total: true }),
      col('credit', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money('debit', debit),
        money('credit', credit),
        money('difference', debit - credit),
      ],
      notes: ['reports.note.trialBalance'],
    },
  );
}

/** Simple balance sheet: what the business owns and owes, with capital as the balancing figure. */
export function balanceSheet(ctx: ReportCtx): ReportResult {
  const p = position(ctx);
  const line = (label: string, amount: number, extra: ReportRow = {}): ReportRow => ({
    label,
    amount,
    ...extra,
  });
  const assets = [
    line('reports.acc.cash', p.cash, { _indent: 1 }),
    line('reports.acc.bank', p.bank, { _indent: 1 }),
    line('reports.acc.cheques', p.pendingCheques, { _indent: 1 }),
    line('reports.acc.receivables', p.receivables, { _indent: 1 }),
    line('reports.acc.stock', p.stock, { _indent: 1 }),
    ...(p.gstCredit ? [line('reports.acc.gstCredit', p.gstCredit, { _indent: 1 })] : []),
  ];
  const liabilities = [
    line('reports.acc.payables', p.payables, { _indent: 1 }),
    line('reports.acc.loans', p.loans, { _indent: 1 }),
    line('reports.acc.gstPayable', p.gstPayable, { _indent: 1 }),
  ];
  const rows: ReportRow[] = [
    line('reports.bs.assets', p.assets, { _bold: 1 }),
    ...assets,
    line('reports.bs.liabilities', p.liabilities, { _bold: 1 }),
    ...liabilities,
    line('reports.bs.capital', p.capital, { _bold: 1 }),
    line('reports.acc.openingCapital', p.openingCapital, { _indent: 1 }),
    line('reports.bs.profitToDate', p.profitToDate, { _indent: 1 }),
    line('reports.bs.liabilitiesCapital', p.liabilities + p.capital, { _bold: 1 }),
  ];
  return build(
    'balanceSheet',
    [col('label', 'text', { translate: true }), col('amount', 'money')],
    rows,
    {
      noTotals: true,
      summary: [
        money('totalAssets', p.assets),
        money('totalLiabilities', p.liabilities),
        money('capital', p.capital, p.capital >= 0 ? 'success' : 'danger'),
      ],
      notes: ['reports.note.balanceSheet'],
    },
  );
}
