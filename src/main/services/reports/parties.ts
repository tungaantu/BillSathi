import { valuation } from './valuation';
import { partyLedger } from '../../../shared/masters';
import { daysBetween } from '../../../shared/report-dates';
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
  query,
  ratioBps,
  settledSql,
  str,
  type ReportCtx,
} from './engine';

/** Signed party balance contribution of a document: positive means the party owes the business. */
const SIGN = `CASE t.type WHEN 'other_income' THEN t.total WHEN 'expense' THEN -t.total WHEN 'sale' THEN t.total
  WHEN 'purchase_return' THEN t.total WHEN 'payment_out' THEN t.total WHEN 'purchase' THEN -t.total
  WHEN 'sale_return' THEN -t.total WHEN 'payment_in' THEN -t.total ELSE 0 END`;
const PAID = `CASE t.type WHEN 'other_income' THEN pay.amount WHEN 'expense' THEN -pay.amount WHEN 'sale' THEN pay.amount
  WHEN 'purchase' THEN -pay.amount WHEN 'sale_return' THEN -pay.amount WHEN 'purchase_return' THEN pay.amount ELSE 0 END`;
export interface PartyBalance {
  id: number;
  name: string;
  groupId: number | null;
  balance: number;
}
/** Balance of every party on a date, the same rules as the `party_balances` view. Positive = to receive. */
export function partyBalances(ctx: ReportCtx, asOn: string): PartyBalance[] {
  // Two grouped sums joined in memory: one pass over documents and one over payments,
  // instead of two correlated sub-queries per party (slow with thousands of parties).
  const billed = new Map(
    query(
      ctx,
      `SELECT t.party_id id, SUM(${SIGN}) amount FROM txns t
       WHERE t.firm_id = ? AND t.party_id IS NOT NULL AND t.status = 'posted'
         AND t.deleted_at IS NULL AND t.date <= ? GROUP BY t.party_id`,
      ctx.firm,
      asOn,
    ).map((r) => [num(r.id), num(r.amount)]),
  );
  const paid = new Map(
    query(
      ctx,
      `SELECT t.party_id id, SUM(${PAID}) amount FROM txn_payments pay JOIN txns t ON t.id = pay.txn_id
       WHERE pay.reversed = 0 AND t.firm_id = ? AND t.party_id IS NOT NULL AND t.status = 'posted'
         AND t.deleted_at IS NULL AND t.date <= ? GROUP BY t.party_id`,
      ctx.firm,
      asOn,
    ).map((r) => [num(r.id), num(r.amount)]),
  );
  return query(
    ctx,
    `SELECT p.id, p.name, p.group_id,
        CASE WHEN COALESCE(p.opening_date, '0000-01-01') <= ? THEN p.opening_balance ELSE 0 END opening
     FROM parties p WHERE p.firm_id = ? AND p.deleted_at IS NULL ORDER BY p.name`,
    asOn,
    ctx.firm,
  ).map((r) => ({
    id: num(r.id),
    name: str(r.name),
    groupId: r.group_id === null ? null : num(r.group_id),
    balance: num(r.opening) + (billed.get(num(r.id)) ?? 0) - (paid.get(num(r.id)) ?? 0),
  }));
}

/** Ledger of one party with a running balance; opens with the balance carried forward. */
export function partyStatement(ctx: ReportCtx): ReportResult {
  const { from, to, partyId } = ctx.filters;
  const columns = [
    col('date', 'date'),
    col('type', 'text', { translate: true }),
    col('number'),
    col('debit', 'money', { total: true }),
    col('credit', 'money', { total: true }),
    col('balance', 'money'),
  ];
  if (!partyId) return build('partyStatement', columns, [], { notes: ['reports.note.pickParty'] });
  const party = query(
    ctx,
    'SELECT opening_balance, opening_date FROM parties WHERE id = ? AND firm_id = ? AND deleted_at IS NULL',
    partyId,
    ctx.firm,
  )[0];
  if (!party) return build('partyStatement', columns, [], { notes: ['reports.note.pickParty'] });
  const txns = query(
    ctx,
    `SELECT t.id, t.date, t.type, ${numberSql()} number, t.total,
       ${SIGN} - COALESCE((SELECT SUM(${PAID.replace(/pay\./g, 'py.')}) FROM txn_payments py
          WHERE py.txn_id = t.id AND py.reversed = 0), 0) AS change
     FROM txns t WHERE ${live()} AND t.party_id = ? ORDER BY t.date, t.id`,
    ctx.firm,
    partyId,
  );
  const all = partyLedger(
    num(party.opening_balance),
    str(party.opening_date) || '0000-01-01',
    txns.map((r) => ({
      id: num(r.id),
      date: str(r.date),
      type: str(r.type),
      number: str(r.number),
      total: num(r.total),
      change: num(r.change),
    })),
  );
  const before = all.filter((r) => r.date < from);
  const carried = before.length ? before[before.length - 1].balance : 0;
  const inRange = all.filter((r) => r.date >= from && r.date <= to);
  const rows: ReportRow[] = [
    {
      date: from,
      type: 'reports.statement.carried',
      number: '',
      debit: null,
      credit: null,
      balance: carried,
      _bold: 1,
    },
    ...inRange.map((r) => ({
      date: r.date,
      type: r.type === 'opening' ? 'reports.statement.opening' : `reports.type.${r.type}`,
      number: r.number,
      debit: r.change > 0 ? r.change : null,
      credit: r.change < 0 ? -r.change : null,
      balance: r.balance,
      _link: r.id ? (txnLink(r.type, r.id) ?? '') : '',
    })),
  ];
  const closing = inRange.length ? inRange[inRange.length - 1].balance : carried;
  const debit = rows.reduce((n, r) => n + num(r.debit), 0),
    credit = rows.reduce((n, r) => n + num(r.credit), 0);
  return build('partyStatement', columns, rows, {
    totals: (_r, base) => ({ ...base, balance: closing }),
    summary: [
      money('carriedForward', carried),
      money('debit', debit),
      money('credit', credit),
      money('closing', closing, closing >= 0 ? 'success' : 'danger'),
    ],
    notes: ['reports.note.statement'],
  });
}

/** Sale profit per party, after subtracting returns and the cost of goods. */
export function partyProfit(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const data = query(
    ctx,
    `SELECT t.party_id id, COALESCE(NULLIF(p.name, ''), '') name,
        SUM(CASE t.type WHEN 'sale' THEN t.taxable ELSE -t.taxable END) sale,
        0 cost
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type IN ('sale', 'sale_return') AND t.date BETWEEN ? AND ?
     GROUP BY t.party_id, p.name ORDER BY p.name`,
    ctx.firm,
    from,
    to,
  );
  const byTxn = new Map(
    query(ctx, `SELECT id, party_id FROM txns WHERE firm_id = ?`, ctx.firm).map((r) => [
      num(r.id),
      num(r.party_id),
    ]),
  );
  const costByParty = new Map<number, number>();
  for (const c of valuation(ctx, to).costs.filter((c) => c.date >= from)) {
    const party = byTxn.get(c.txnId) ?? 0;
    costByParty.set(party, (costByParty.get(party) ?? 0) + c.cost);
  }
  for (const r of data) r.cost = costByParty.get(num(r.id)) ?? 0;
  const rows: ReportRow[] = data.map((r) => ({
    party: str(r.name) || 'reports.cashParty',
    sale: num(r.sale),
    cost: num(r.cost),
    profit: num(r.sale) - num(r.cost),
    margin: ratioBps(num(r.sale) - num(r.cost), num(r.sale)),
    _link: r.id ? `parties/${num(r.id)}` : '',
  }));
  const sum = (key: string) => rows.reduce((n, r) => n + num(r[key]), 0);
  return build(
    'partyProfit',
    [
      col('party', 'text', { translate: true }),
      col('sale', 'money', { total: true }),
      col('cost', 'money', { total: true }),
      col('profit', 'money', { total: true }),
      col('margin', 'percent'),
    ],
    rows,
    {
      totals: (_r, base) => ({ ...base, margin: ratioBps(sum('profit'), sum('sale')) }),
      summary: [money('netSales', sum('sale')), money('grossProfit', sum('profit'), 'success')],
      notes: ['reports.note.billProfit'],
    },
  );
}

const BUCKETS = ['current', 'd31', 'd61', 'd90'] as const;
const bucketOf = (days: number) => (days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3);
/** Everyone you will receive from or pay to, with how old the unpaid invoices are. */
export function allParties(ctx: ReportCtx): ReportResult {
  const asOn = ctx.filters.asOn || ctx.today;
  const balances = partyBalances(ctx, asOn).filter(
    (p) => !ctx.filters.groupId || p.groupId === ctx.filters.groupId,
  );
  const invoices = query(
    ctx,
    `SELECT t.party_id, t.type, t.date, t.total, ${settledSql('t', asOn)} settled FROM txns t
     WHERE ${live()} AND t.type IN ('sale', 'purchase') AND t.party_id IS NOT NULL AND t.date <= ?`,
    ctx.firm,
    asOn,
  );
  const aged = new Map<number, number[]>();
  for (const inv of invoices) {
    const open = Math.max(0, num(inv.total) - num(inv.settled));
    if (!open) continue;
    const slots = aged.get(num(inv.party_id)) ?? [0, 0, 0, 0];
    slots[bucketOf(daysBetween(str(inv.date), asOn))] += str(inv.type) === 'sale' ? open : -open;
    aged.set(num(inv.party_id), slots);
  }
  const rows: ReportRow[] = balances
    .filter((p) => p.balance !== 0 || aged.has(p.id))
    .map((p) => {
      const slots = aged.get(p.id) ?? [0, 0, 0, 0];
      return {
        party: p.name,
        direction: p.balance >= 0 ? 'reports.dir.receive' : 'reports.dir.pay',
        balance: p.balance,
        current: slots[0],
        d31: slots[1],
        d61: slots[2],
        d90: slots[3],
        other: p.balance - slots.reduce((n, v) => n + v, 0),
        _link: `parties/${p.id}`,
      };
    });
  const receivable = rows.reduce((n, r) => n + Math.max(0, num(r.balance)), 0),
    payable = rows.reduce((n, r) => n + Math.max(0, -num(r.balance)), 0);
  return build(
    'allParties',
    [
      col('party'),
      col('direction', 'text', { translate: true }),
      col('balance', 'money', { total: true }),
      ...BUCKETS.map((b) => col(b, 'money', { total: true })),
      col('other', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money('toReceive', receivable, 'success'),
        money('toPay', payable, 'danger'),
        money(
          'over90',
          rows.reduce((n, r) => n + num(r.d90), 0),
        ),
      ],
      notes: ['reports.note.ageing'],
    },
  );
}

/** What each party bought from you or sold to you, item by item. */
export function partyItems(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.partyId, 't.party_id = ?', f.partyId ?? null);
  const data = query(
    ctx,
    `SELECT COALESCE(p.name, '') party, l.item_id, l.name item,
        SUM(CASE t.type WHEN 'sale' THEN l.qty WHEN 'sale_return' THEN -l.qty ELSE 0 END) sale_qty,
        SUM(CASE t.type WHEN 'sale' THEN l.total WHEN 'sale_return' THEN -l.total ELSE 0 END) sale_amount,
        SUM(CASE t.type WHEN 'purchase' THEN l.qty WHEN 'purchase_return' THEN -l.qty ELSE 0 END) purchase_qty,
        SUM(CASE t.type WHEN 'purchase' THEN l.total WHEN 'purchase_return' THEN -l.total ELSE 0 END) purchase_amount
     FROM txn_lines l JOIN txns t ON t.id = l.txn_id LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type IN ('sale', 'sale_return', 'purchase', 'purchase_return')
       AND t.date BETWEEN ? AND ?${w.text}
     GROUP BY t.party_id, p.name, l.item_id, l.name ORDER BY p.name, l.name`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const rows: ReportRow[] = data.map((r) => ({
    party: str(r.party) || 'reports.cashParty',
    item: str(r.item),
    saleQty: num(r.sale_qty),
    saleAmount: num(r.sale_amount),
    purchaseQty: num(r.purchase_qty),
    purchaseAmount: num(r.purchase_amount),
    _link: r.item_id ? `items/${num(r.item_id)}` : '',
  }));
  return build(
    'partyItems',
    [
      col('party', 'text', { translate: true }),
      col('item'),
      col('saleQty', 'qty', { total: true }),
      col('saleAmount', 'money', { total: true }),
      col('purchaseQty', 'qty', { total: true }),
      col('purchaseAmount', 'money', { total: true }),
    ],
    rows,
    { notes: ['reports.note.withGst'] },
  );
}

/** Sales or purchases per party (or per party group), net of returns. */
export function bySalesParty(ctx: ReportCtx, grouped: boolean): ReportResult {
  const f = ctx.filters;
  const side = f.side === 'purchase' ? 'purchase' : 'sale';
  const back = side === 'sale' ? 'sale_return' : 'purchase_return';
  const key = grouped ? 'p.group_id' : 't.party_id';
  const data = query(
    ctx,
    `SELECT ${key} id, ${grouped ? "COALESCE(g.name, '')" : "COALESCE(p.name, '')"} name,
        SUM(CASE WHEN t.type = ? THEN 1 ELSE 0 END) documents,
        SUM(CASE WHEN t.type = ? THEN t.total ELSE 0 END) total,
        SUM(CASE WHEN t.type = ? THEN t.total ELSE 0 END) returns
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id LEFT JOIN party_groups g ON g.id = p.group_id
     WHERE ${live()} AND t.type IN (?, ?) AND t.date BETWEEN ? AND ?
     GROUP BY ${key}, ${grouped ? 'g.name' : 'p.name'} ORDER BY total DESC`,
    side,
    side,
    back,
    ctx.firm,
    side,
    back,
    f.from,
    f.to,
  );
  const rows: ReportRow[] = data.map((r) => ({
    name: str(r.name) || (grouped ? 'reports.noGroup' : 'reports.cashParty'),
    documents: num(r.documents),
    total: num(r.total),
    returns: num(r.returns),
    net: num(r.total) - num(r.returns),
    _link: !grouped && r.id ? `parties/${num(r.id)}` : '',
  }));
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build(
    grouped ? 'groupSales' : 'partySales',
    [
      col('name', 'text', {
        translate: true,
        label: grouped ? 'reports.col.group' : 'reports.col.party',
      }),
      col('documents', 'int', { total: true }),
      col('total', 'money', { total: true }),
      col('returns', 'money', { total: true }),
      col('net', 'money', { total: true }),
    ],
    rows,
    {
      summary: [money('net', sum('net')), count('documents', sum('documents'))],
      notes: ['reports.note.withGst'],
    },
  );
}
