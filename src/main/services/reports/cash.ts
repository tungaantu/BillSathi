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
  str,
  type ReportCtx,
} from './engine';

/** Running statement of one or more cash/bank accounts. */
function accountStatement(
  ctx: ReportCtx,
  id: string,
  accountIds: number[],
  extraNotes: string[] = [],
): ReportResult {
  const { from, to } = ctx.filters;
  const columns = [
    col('date', 'date'),
    col('description', 'text', { translate: true }),
    col('number'),
    col('party'),
    col('moneyIn', 'money', { total: true }),
    col('moneyOut', 'money', { total: true }),
    col('balance', 'money'),
  ];
  if (!accountIds.length) return build(id, columns, [], { notes: ['reports.note.pickAccount'] });
  const marks = accountIds.map(() => '?').join(', ');
  const opening = num(
    query(
      ctx,
      `SELECT COALESCE(SUM(opening_balance), 0) v FROM payment_accounts WHERE firm_id = ? AND id IN (${marks})`,
      ctx.firm,
      ...accountIds,
    )[0]?.v,
  );
  const data = query(
    ctx,
    `SELECT t.id txn_id, t.type, COALESCE(py.posting_date, t.date) date, ${numberSql()} number,
        ${partyNameSql()} party, py.amount, py.direction, COALESCE(t.description, '') note
     FROM txn_payments py JOIN txns t ON t.id = py.txn_id LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND py.reversed = 0 AND py.account_id IN (${marks}) AND COALESCE(py.posting_date, t.date) <= ?
     ORDER BY COALESCE(py.posting_date, t.date), py.id`,
    ctx.firm,
    ...accountIds,
    to,
  );
  let balance = opening;
  const rows: ReportRow[] = [];
  const carried = data
    .filter((r) => str(r.date) < from)
    .reduce((n, r) => n + num(r.direction) * num(r.amount), 0);
  balance += carried;
  rows.push({
    date: from,
    description: 'reports.statement.carried',
    number: '',
    party: '',
    moneyIn: null,
    moneyOut: null,
    balance,
    _bold: 1,
  });
  for (const r of data) {
    if (str(r.date) < from) continue;
    balance += num(r.direction) * num(r.amount);
    rows.push({
      date: str(r.date),
      description: `reports.type.${str(r.type)}`,
      number: str(r.number),
      party: str(r.party) || str(r.note),
      moneyIn: num(r.direction) === 1 ? num(r.amount) : null,
      moneyOut: num(r.direction) === -1 ? num(r.amount) : null,
      balance,
      _link: txnLink(str(r.type), num(r.txn_id)) ?? '',
    });
  }
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build(id, columns, rows, {
    totals: (_r, base) => ({ ...base, balance }),
    summary: [
      money('carriedForward', num(rows[0].balance)),
      money('moneyIn', sum('moneyIn'), 'success'),
      money('moneyOut', sum('moneyOut'), 'danger'),
      money('closing', balance),
    ],
    notes: extraNotes,
  });
}
const accounts = (ctx: ReportCtx, where: string, ...params: (string | number)[]) =>
  query(
    ctx,
    `SELECT id FROM payment_accounts WHERE firm_id = ? AND deleted_at IS NULL AND ${where} ORDER BY is_default DESC, id`,
    ctx.firm,
    ...params,
  ).map((r) => num(r.id));

/** Statement of one bank account (the default bank when none is chosen). */
export function bankStatement(ctx: ReportCtx): ReportResult {
  const chosen = ctx.filters.accountId;
  const ids = chosen
    ? accounts(ctx, 'id = ?', chosen)
    : accounts(ctx, "type IN ('bank', 'upi', 'card')").slice(0, 1);
  return accountStatement(ctx, 'bankStatement', ids);
}
/** Every rupee that went in or out of the cash drawer. */
export function cashBook(ctx: ReportCtx): ReportResult {
  return accountStatement(ctx, 'cashBook', accounts(ctx, "type = 'cash'"));
}

/** Discount given or received on bills and payments. */
export function discountReport(ctx: ReportCtx): ReportResult {
  const f = ctx.filters;
  const w = new Where().when(f.partyId, 't.party_id = ?', f.partyId ?? null);
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.type, ${numberSql()} number, ${partyNameSql()} party, t.discount, t.total
     FROM txns t LEFT JOIN parties p ON p.id = t.party_id
     WHERE ${live()} AND t.type IN ('sale', 'purchase', 'payment_in', 'payment_out') AND t.discount > 0
       AND t.date BETWEEN ? AND ?${w.text} ORDER BY t.date, t.id`,
    ctx.firm,
    f.from,
    f.to,
    ...w.params,
  );
  const given = (r: (typeof data)[number]) => ['sale', 'payment_in'].includes(str(r.type));
  const rows: ReportRow[] = data.map((r) => ({
    date: str(r.date),
    type: `reports.type.${str(r.type)}`,
    number: str(r.number),
    party: str(r.party) || 'reports.cashParty',
    discount: num(r.discount),
    direction: given(r) ? 'reports.dir.given' : 'reports.dir.received',
    _link: txnLink(str(r.type), num(r.id)) ?? '',
  }));
  const total = (given_: boolean) =>
    data.filter((r) => given(r) === given_).reduce((n, r) => n + num(r.discount), 0);
  return build(
    'discountReport',
    [
      col('date', 'date'),
      col('type', 'text', { translate: true }),
      col('number'),
      col('party', 'text', { translate: true }),
      col('discount', 'money', { total: true }),
      col('direction', 'text', { translate: true }),
    ],
    rows,
    {
      summary: [
        money('discountGiven', total(true)),
        money('discountReceived', total(false)),
        count('documents', rows.length),
      ],
    },
  );
}

/** Loan taken: money received, EMIs paid (principal and interest) and what is still owed. */
export function loanStatement(ctx: ReportCtx): ReportResult {
  const columns = [
    col('date', 'date'),
    col('description', 'text', { translate: true }),
    col('received', 'money', { total: true }),
    col('principalPaid', 'money', { total: true }),
    col('interest', 'money', { total: true }),
    col('balance', 'money'),
  ];
  const loan = query(
    ctx,
    `SELECT id, name FROM loans WHERE firm_id = ? AND deleted_at IS NULL AND (? IS NULL OR id = ?) ORDER BY id LIMIT 1`,
    ctx.firm,
    ctx.filters.loanId ?? null,
    ctx.filters.loanId ?? null,
  )[0];
  if (!loan) return build('loanStatement', columns, [], { notes: ['reports.note.noLoans'] });
  const data = query(
    ctx,
    `SELECT t.id, t.date, t.type, t.total FROM txns t
     WHERE ${live()} AND t.type IN ('loan_received', 'loan_payment', 'expense')
       AND json_extract(t.metadata, '$.loanId') = ? ORDER BY t.date, t.id`,
    ctx.firm,
    num(loan.id),
  );
  let balance = 0;
  const rows: ReportRow[] = data.map((r) => {
    const type = str(r.type);
    if (type === 'loan_received') balance += num(r.total);
    if (type === 'loan_payment') balance -= num(r.total);
    return {
      date: str(r.date),
      description: type === 'expense' ? 'reports.loan.interest' : `reports.type.${type}`,
      received: type === 'loan_received' ? num(r.total) : null,
      principalPaid: type === 'loan_payment' ? num(r.total) : null,
      interest: type === 'expense' ? num(r.total) : null,
      balance,
    };
  });
  const sum = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return build('loanStatement', columns, rows, {
    totals: (_r, base) => ({ ...base, balance }),
    summary: [
      money('loanTaken', sum('received')),
      money('principalPaid', sum('principalPaid')),
      money('interestPaid', sum('interest'), 'danger'),
      money('stillOwed', balance),
    ],
    notes: [str(loan.name) ? '' : 'reports.note.noLoans'].filter(Boolean),
  });
}
