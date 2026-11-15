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
  paymentTypeSql,
  partyNameSql,
  query,
  settledSql,
  str,
  type ReportCtx,
} from './engine';

const status = (total: number, settled: number) =>
  settled <= 0
    ? 'reports.pay.unpaid'
    : settled >= total
      ? 'reports.pay.paid'
      : 'reports.pay.partial';
const typed = (type: string, id: number) => txnLink(type, id) ?? '';

/** Sale or purchase register for the period. */
export function register(ctx: ReportCtx, type: 'sale' | 'purchase'): ReportResult {
  const f = ctx.filters;
  const w = new Where()
    .when(f.partyId, 't.party_id = ?', f.partyId ?? null)
    .when(f.paymentType, paymentTypeSql('t'), f.paymentType ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.due_date, ${numberSql()} number, ${partyNameSql()} party, t.total,
        t.cgst + t.sgst + t.igst + t.cess tax, ${settledSql()} settled
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type = ? AND t.date BETWEEN ? AND ?${w.text}
     ORDER BY t.date, t.id`,
    ctx.firm,
    type,
    f.from,
    f.to,
    ...w.params,
  );
  const rows: ReportRow[] = data
    .filter((r) => {
      if (!f.due) return true;
      const open = num(r.total) - Math.min(num(r.settled), num(r.total)) > 0;
      return open && (f.due === 'due' || (Boolean(r.due_date) && str(r.due_date) < ctx.today));
    })
    .map((r) => {
      const settled = Math.min(num(r.settled), num(r.total));
      return {
        date: str(r.date),
        number: str(r.number),
        party: str(r.party) || 'reports.cashParty',
        total: num(r.total),
        tax: num(r.tax),
        received: settled,
        balance: num(r.total) - settled,
        status: status(num(r.total), settled),
        _link: typed(type, num(r.id)),
      };
    });
  const sum = (key: string) => rows.reduce((n, r) => n + num(r[key]), 0);
  return build(
    type,
    [
      col('date', 'date'),
      col('number'),
      col('party', 'text', { translate: true }),
      col('total', 'money', { total: true }),
      col('tax', 'money', { total: true }),
      col('received', 'money', {
        total: true,
        label: type === 'sale' ? 'reports.col.received' : 'reports.col.paid',
      }),
      col('balance', 'money', { total: true }),
      col('status', 'text', { translate: true }),
    ],
    rows,
    {
      summary: [
        money(type === 'sale' ? 'totalSales' : 'totalPurchases', sum('total')),
        money('gst', sum('tax')),
        money(type === 'sale' ? 'received' : 'paid', sum('received'), 'success'),
        money('balanceDue', sum('balance'), 'danger'),
        count('documents', rows.length),
      ],
      notes: ['reports.note.registerReturns'],
    },
  );
}

/** Every posted transaction of the period with the money that actually moved. */
export function dayBook(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.type, ${numberSql()} number, ${partyNameSql()} party, t.total,
        COALESCE((SELECT SUM(py.amount) FROM txn_payments py WHERE py.txn_id = t.id AND py.reversed = 0 AND py.direction = 1), 0) money_in,
        COALESCE((SELECT SUM(py.amount) FROM txn_payments py WHERE py.txn_id = t.id AND py.reversed = 0 AND py.direction = -1), 0) money_out
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.date BETWEEN ? AND ?
     ORDER BY t.date, t.id`,
    ctx.firm,
    f.from,
    f.to,
  );
  const rows: ReportRow[] = data.map((r) => ({
    date: str(r.date),
    type: `reports.type.${str(r.type)}`,
    number: str(r.number),
    party: str(r.party),
    total: num(r.total),
    moneyIn: num(r.money_in),
    moneyOut: num(r.money_out),
    _link: typed(str(r.type), num(r.id)),
  }));
  const sum = (key: string) => rows.reduce((n, r) => n + num(r[key]), 0);
  return build(
    'dayBook',
    [
      col('date', 'date'),
      col('type', 'text', { translate: true }),
      col('number'),
      col('party'),
      col('total', 'money'),
      col('moneyIn', 'money', { total: true }),
      col('moneyOut', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        money('moneyIn', sum('moneyIn'), 'success'),
        money('moneyOut', sum('moneyOut'), 'danger'),
        money('netMoney', sum('moneyIn') - sum('moneyOut')),
        count('documents', rows.length),
      ],
    },
  );
}

/** Every document of the period, any type, with its payment status. */
export function allTransactions(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where()
    .when(f.partyId, 't.party_id = ?', f.partyId ?? null)
    .when(f.docType, 't.type = ?', f.docType ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.type, t.status, ${numberSql()} number, ${partyNameSql()} party, t.total,
        ${settledSql()} settled
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE t.firm_id = ? AND t.deleted_at IS NULL AND t.status <> 'draft' AND t.date BETWEEN ? AND ?${w.text}
     ORDER BY t.date, t.id`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const credit = ['sale', 'purchase'];
  const rows: ReportRow[] = data.map((r) => {
    const posted = str(r.status) === 'posted';
    const settled = credit.includes(str(r.type)) ? Math.min(num(r.settled), num(r.total)) : 0;
    return {
      date: str(r.date),
      type: `reports.type.${str(r.type)}`,
      number: str(r.number),
      party: str(r.party),
      total: num(r.total),
      balance: posted && credit.includes(str(r.type)) ? num(r.total) - settled : 0,
      status: `reports.status.${str(r.status)}`,
      _link: typed(str(r.type), num(r.id)),
    };
  });
  return build(
    'allTransactions',
    [
      col('date', 'date'),
      col('type', 'text', { translate: true }),
      col('number'),
      col('party'),
      col('total', 'money'),
      col('balance', 'money', { total: true }),
      col('status', 'text', { translate: true }),
    ],
    rows,
    { summary: [count('documents', rows.length)] },
  );
}
