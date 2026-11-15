import type { DatabaseContext } from '../../db';
import type {
  Cell,
  ReportColumn,
  ReportFilters,
  ReportResult,
  ReportRow,
  SummaryCard,
} from '../../../shared/reports';

/** Everything a report needs: the database, the business and the filters. */
export interface ReportCtx {
  context: DatabaseContext;
  firm: number;
  filters: ReportFilters;
  /** Today as `YYYY-MM-DD`; injected so tests are deterministic. */
  today: string;
}
export type Row = Record<string, unknown>;
/** Runs a read-only query. `?` placeholders are bound in order. */
export function query(ctx: ReportCtx, sql: string, ...params: (string | number | null)[]): Row[] {
  // A null filter value never reaches SQL: callers only bind values they have checked.
  return ctx.context.sqlite.prepare(sql).all(...(params as (string | number)[])) as Row[];
}
export const num = (value: unknown): number => Number(value ?? 0);
export const str = (value: unknown): string => String(value ?? '');
/** Posted, not deleted, for the business bound as the first `?`. */
export const live = (alias = 't') =>
  `${alias}.firm_id = ? AND ${alias}.status = 'posted' AND ${alias}.deleted_at IS NULL`;
export const docNumber = (prefix: unknown, number: unknown) =>
  `${str(prefix)}${String(num(number)).padStart(4, '0')}`;
/** SQL for the number a party sees on an invoice, e.g. `INV-0001`. */
export const numberSql = (alias = 't') =>
  `${alias}.prefix || substr('0000' || ${alias}.number, -max(4, length(${alias}.number)))`;
export const partyNameSql = (alias = 't', party = 'p') =>
  `COALESCE(NULLIF(${party}.name, ''), NULLIF(json_extract(${alias}.metadata, '$.document.partyName'), ''), '')`;
/** Amount already settled against a sale or purchase: direct payments, linked receipts and returns. */
export const settledSql = (alias = 't', asOn?: string) => {
  // asOn is validated by the service; also guard direct fixture/service callers.
  if (asOn && !/^\d{4}-\d{2}-\d{2}$/.test(asOn)) throw new Error('validation');
  const until = asOn ? `'${asOn}'` : "'9999-12-31'";
  return `(
  COALESCE((SELECT SUM(py.amount) FROM txn_payments py WHERE py.txn_id = ${alias}.id AND py.reversed = 0 AND COALESCE(py.posting_date, ${alias}.date) <= ${until}), 0)
  + COALESCE((SELECT SUM(l.amount) FROM payment_links l JOIN txns pt ON pt.id = l.payment_txn_id
      WHERE l.invoice_txn_id = ${alias}.id AND pt.status = 'posted' AND pt.deleted_at IS NULL AND pt.date <= ${until}), 0)
  + COALESCE((SELECT SUM(r.total) FROM txns r WHERE r.ref_txn_id = ${alias}.id
      AND r.type IN ('sale_return', 'purchase_return') AND r.status = 'posted' AND r.deleted_at IS NULL AND r.date <= ${until}), 0))`;
};
/** Filters a transaction alias by the chosen payment type (account type). */
export const paymentTypeSql = (alias = 't') =>
  `EXISTS (SELECT 1 FROM txn_payments py JOIN payment_accounts pa ON pa.id = py.account_id
      WHERE py.txn_id = ${alias}.id AND py.reversed = 0 AND pa.type = ?)`;
/** Cost recorded when stock left or came back for a posted transaction. */
export const stockCostSql = (alias = 't') =>
  `COALESCE((SELECT -SUM(sl.value) FROM stock_ledger sl WHERE sl.txn_id = ${alias}.id AND sl.deleted_at IS NULL), 0)`;

export interface BuildOptions {
  summary?: SummaryCard[];
  notes?: string[];
  /** Replaces or adds cells in the generated totals row. */
  totals?: (rows: ReportRow[], base: ReportRow) => ReportRow;
  noTotals?: boolean;
  extra?: Partial<ReportResult>;
}
export const roundQty = (value: number) => Math.round(value * 1000) / 1000;
/** Shapes rows into a report: totals row from `total` columns, plain-language notes, summary cards. */
export function build(
  id: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  options: BuildOptions = {},
): ReportResult {
  let totals: ReportRow | null = null;
  if (!options.noTotals && columns.some((c) => c.total)) {
    const base: ReportRow = {};
    const first = columns.find((c) => !c.total)?.key;
    for (const column of columns) {
      if (!column.total) continue;
      const sum = rows
        .filter((r) => !r._bold || r._sum)
        .reduce((n, r) => n + (typeof r[column.key] === 'number' ? Number(r[column.key]) : 0), 0);
      base[column.key] = column.type === 'qty' ? roundQty(sum) : sum;
    }
    if (first) base[first] = 'reports.total';
    totals = options.totals ? options.totals(rows, base) : base;
  }
  return {
    id,
    columns,
    rows,
    totals,
    summary: options.summary ?? [],
    notes: options.notes ?? [],
    ...options.extra,
  };
}
export const col = (
  key: string,
  type: ReportColumn['type'] = 'text',
  extra: Partial<ReportColumn> = {},
): ReportColumn => ({ key, label: `reports.col.${key}`, type, ...extra });
export const money = (key: string, value: number, tone?: 'success' | 'danger'): SummaryCard => ({
  key,
  label: `reports.sum.${key}`,
  value,
  type: 'money',
  tone,
});
export const count = (key: string, value: number): SummaryCard => ({
  key,
  label: `reports.sum.${key}`,
  value,
  type: 'int',
});
/** Basis points of `part` in `whole`, rounded; 0 when `whole` is 0. */
export const ratioBps = (part: number, whole: number) =>
  whole ? Math.round((part * 10000) / whole) : 0;
export const cell = (value: Cell) => value;
/** Optional filter clause helper: appends SQL and a parameter only when the value is set. */
export class Where {
  sql: string[] = [];
  params: (string | number | null)[] = [];
  add(clause: string, ...params: (string | number | null)[]) {
    this.sql.push(clause);
    this.params.push(...params);
    return this;
  }
  when(value: unknown, clause: string, ...params: (string | number | null)[]) {
    if (value !== null && value !== undefined && value !== '' && value !== 0)
      this.add(clause, ...params);
    return this;
  }
  get text() {
    return this.sql.length ? ` AND ${this.sql.join(' AND ')}` : '';
  }
}
export const DOCUMENT_TYPES = [
  'sale',
  'sale_return',
  'estimate',
  'sale_order',
  'purchase',
  'purchase_return',
  'purchase_order',
  'expense',
  'other_income',
  'payment_in',
  'payment_out',
] as const;
