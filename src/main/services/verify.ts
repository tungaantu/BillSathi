import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from '../db';
import * as s from '../db/schema';
import { repositories } from '../db/repositories';
import { totals, type SaleDocument } from '../../shared/sales';
import { displayDocumentNumber } from '../../shared/numbering';
import { formatINR } from '../../shared/money';
import type { VerifyCheck, VerifyId, VerifyReport } from '../../shared/safety-api';

const SAMPLE = 20;
type Row = Record<string, unknown>;
const ref = (r: Row) =>
  displayDocumentNumber({
    firmId: 0,
    type: '',
    prefix: String(r.prefix ?? ''),
    number: Number(r.number),
  });
function check(
  id: VerifyId,
  problems: string[],
  fixable = false,
  level: 'warn' | 'error' = 'error',
): VerifyCheck {
  return {
    id,
    status: problems.length ? level : 'ok',
    count: problems.length,
    details: problems.slice(0, SAMPLE),
    fixable: fixable && problems.length > 0,
  };
}

/** SQLite's own page-level check plus foreign-key consistency. */
function integrity(context: DatabaseContext): VerifyCheck {
  const problems = context.sqlite
    .prepare('PRAGMA integrity_check')
    .all()
    .map((r) => String(Object.values(r)[0]))
    .filter((v) => v !== 'ok');
  for (const r of context.sqlite.prepare('PRAGMA foreign_key_check').all())
    problems.push(`${r.table} #${r.rowid} -> ${r.parent}`);
  return check('integrity', problems);
}
function orphanLines(context: DatabaseContext): VerifyCheck {
  const rows = context.sqlite
    .prepare(
      'SELECT l.id, l.name FROM txn_lines l LEFT JOIN txns t ON t.id = l.txn_id WHERE t.id IS NULL',
    )
    .all();
  return check(
    'orphanLines',
    rows.map((r) => `#${r.id} ${r.name}`),
  );
}

interface Recalculated {
  row: Row;
  document: SaleDocument;
  calc: ReturnType<typeof totals>;
}
function recalculated(context: DatabaseContext, firm: number): Recalculated[] {
  const out: Recalculated[] = [];
  const rows = context.sqlite
    .prepare("SELECT * FROM txns WHERE firm_id = ? AND deleted_at IS NULL AND status <> 'draft'")
    .all(firm);
  for (const row of rows) {
    try {
      const meta = JSON.parse(String(row.metadata));
      if (!meta.document || !meta.firmState) continue;
      const document = meta.document as SaleDocument;
      out.push({ row, document, calc: totals(document, String(meta.firmState)) });
    } catch {
      /* documents without an editor model (receipts, future types) are skipped */
    }
  }
  return out;
}
const HEADER: [string, keyof Recalculated['calc']][] = [
  ['total', 'total'],
  ['taxable', 'taxable'],
  ['cgst', 'cgst'],
  ['sgst', 'sgst'],
  ['igst', 'igst'],
  ['cess', 'cess'],
  ['round_off', 'roundOff'],
];
const sameHeader = ({ row, calc }: Recalculated) =>
  HEADER.every(([column, key]) => Number(row[column]) === Number(calc[key]));
function lineSums(context: DatabaseContext, id: number) {
  const r = context.sqlite
    .prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM txn_lines WHERE txn_id = ?')
    .get(id);
  return { count: Number(r?.n ?? 0), total: Number(r?.total ?? 0) };
}
function lineProblem(context: DatabaseContext, r: Recalculated) {
  const sums = lineSums(context, Number(r.row.id));
  const expected = r.calc.lines.reduce((n, l) => n + l.total, 0);
  return sums.count !== r.document.lines.length || sums.total !== expected;
}
function totalsProblems(context: DatabaseContext, firm: number) {
  return recalculated(context, firm).filter((r) => !sameHeader(r) || lineProblem(context, r));
}
function totalsCheck(context: DatabaseContext, firm: number): VerifyCheck {
  const bad = totalsProblems(context, firm);
  const fixable = bad.some(
    (r) => lineSums(context, Number(r.row.id)).count === r.document.lines.length,
  );
  return check(
    'totals',
    bad.map(
      (r) => `${ref(r.row)} (${formatINR(Number(r.row.total))} → ${formatINR(r.calc.total)})`,
    ),
    fixable,
  );
}
/** Safe fix: rewrite stored totals from the saved document using the GST engine. */
function fixTotals(context: DatabaseContext, firm: number) {
  const { db } = context;
  const audit = repositories(context).audit;
  context.sqlite.transaction(() => {
    for (const r of totalsProblems(context, firm)) {
      const id = Number(r.row.id);
      const lines = db.select().from(s.txnLines).where(eq(s.txnLines.txnId, id)).all();
      if (lines.length !== r.document.lines.length) continue;
      const before = db.select().from(s.txns).where(eq(s.txns.id, id)).get()!;
      const header = {
        total: r.calc.total,
        taxable: r.calc.taxable,
        cgst: r.calc.cgst,
        sgst: r.calc.sgst,
        igst: r.calc.igst,
        cess: r.calc.cess,
        roundOff: r.calc.roundOff,
        updatedAt: new Date().toISOString(),
      };
      db.update(s.txns).set(header).where(eq(s.txns.id, id)).run();
      [...lines]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .forEach((line, index) => {
          const c = r.calc.lines[index];
          db.update(s.txnLines)
            .set({
              discount: c.discount,
              taxable: c.taxable,
              cgst: c.cgst,
              sgst: c.sgst,
              igst: c.igst,
              cess: c.cess,
              total: c.total,
            })
            .where(and(eq(s.txnLines.id, line.id), eq(s.txnLines.txnId, id)))
            .run();
        });
      audit(
        firm,
        'txns',
        id,
        'update',
        { fix: 'verifyData', ...before },
        { fix: 'verifyData', ...header },
      );
    }
  })();
}

/** Payments that settle more than the invoice or the payment itself. */
function allocations(context: DatabaseContext, firm: number): VerifyCheck {
  const problems: string[] = [];
  const invoices = context.sqlite
    .prepare(
      `SELECT t.id, t.prefix, t.number, t.total,
        COALESCE((SELECT SUM(p.amount) FROM txn_payments p WHERE p.txn_id = t.id AND p.reversed = 0), 0)
        + COALESCE((SELECT SUM(l.amount) FROM payment_links l JOIN txns pt ON pt.id = l.payment_txn_id
            WHERE l.invoice_txn_id = t.id AND pt.deleted_at IS NULL AND pt.status = 'posted'), 0)
        + COALESCE((SELECT SUM(r.total) FROM txns r WHERE r.ref_txn_id = t.id AND r.type = 'sale_return'
            AND r.deleted_at IS NULL AND r.status = 'posted'), 0) AS received
       FROM txns t WHERE t.firm_id = ? AND t.type = 'sale' AND t.status = 'posted' AND t.deleted_at IS NULL`,
    )
    .all(firm);
  for (const r of invoices)
    if (Number(r.received) > Number(r.total))
      problems.push(`${ref(r)} (${formatINR(Number(r.received))} > ${formatINR(Number(r.total))})`);
  const receipts = context.sqlite
    .prepare(
      `SELECT t.id, t.prefix, t.number, t.total, COALESCE(SUM(l.amount), 0) AS linked
       FROM txns t JOIN payment_links l ON l.payment_txn_id = t.id
       WHERE t.firm_id = ? AND t.deleted_at IS NULL GROUP BY t.id`,
    )
    .all(firm);
  for (const r of receipts)
    if (Number(r.linked) > Number(r.total))
      problems.push(`${ref(r)} (${formatINR(Number(r.linked))} > ${formatINR(Number(r.total))})`);
  return check('allocations', problems);
}

/** Duplicate numbers are errors; holes in a series are only warnings. */
function numbering(context: DatabaseContext, firm: number): VerifyCheck {
  const rows = context.sqlite
    .prepare(
      'SELECT id, type, prefix, number FROM txns WHERE firm_id = ? ORDER BY type, prefix, number',
    )
    .all(firm);
  const series = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.type}\u0000${r.prefix}`;
    series.set(key, [...(series.get(key) ?? []), Number(r.number)]);
  }
  const duplicates: string[] = [],
    missing: string[] = [];
  for (const [key, numbers] of series) {
    const [, prefix] = key.split('\u0000');
    const seen = new Set<number>();
    for (const n of numbers) {
      if (seen.has(n))
        duplicates.push(
          `${displayDocumentNumber({ firmId: 0, type: '', prefix, number: n })} (duplicate)`,
        );
      seen.add(n);
    }
    for (let n = Math.min(...numbers); n <= Math.max(...numbers); n++)
      if (!seen.has(n) && missing.length < 200)
        missing.push(
          `${displayDocumentNumber({ firmId: 0, type: '', prefix, number: n })} (missing)`,
        );
  }
  const problems = [...duplicates, ...missing];
  return {
    ...check('numbering', problems, false, duplicates.length ? 'error' : 'warn'),
    count: problems.length,
  };
}

function negativeStock(context: DatabaseContext, firm: number): VerifyCheck {
  const rows = context.sqlite
    .prepare(
      `SELECT i.name, SUM(b.qty) AS qty FROM stock_balances b JOIN items i ON i.id = b.item_id
       WHERE b.firm_id = ? GROUP BY b.item_id HAVING SUM(b.qty) < -0.0005`,
    )
    .all(firm);
  return check(
    'negativeStock',
    rows.map((r) => `${r.name} (${Number(r.qty)})`),
    false,
    'warn',
  );
}

/** Recomputes every balance straight from the ledger rows and compares with the SQL views. */
function balances(context: DatabaseContext, firm: number): VerifyCheck {
  const problems: string[] = [];
  const live = `t.firm_id = ? AND t.status = 'posted' AND t.deleted_at IS NULL`;
  const sign: Record<string, number> = {
    other_income: 1,
    expense: -1,
    sale: 1,
    purchase_return: 1,
    payment_out: 1,
    purchase: -1,
    sale_return: -1,
    payment_in: -1,
  };
  const paySign: Record<string, number> = {
    other_income: 1,
    expense: -1,
    sale: 1,
    purchase_return: 1,
    purchase: -1,
    sale_return: -1,
  };
  const txns = context.sqlite
    .prepare(`SELECT t.id, t.party_id, t.type, t.total FROM txns t WHERE ${live}`)
    .all(firm);
  const payments = context.sqlite
    .prepare(
      `SELECT t.party_id, t.type, p.account_id, p.amount, p.direction FROM txn_payments p JOIN txns t ON t.id = p.txn_id WHERE p.reversed = 0 AND ${live}`,
    )
    .all(firm);
  const parties = context.sqlite
    .prepare(
      'SELECT id, name, opening_balance FROM parties WHERE firm_id = ? AND deleted_at IS NULL',
    )
    .all(firm);
  const cachedParties = new Map(
    context.sqlite
      .prepare('SELECT id, balance FROM party_balances WHERE firm_id = ?')
      .all(firm)
      .map((r) => [Number(r.id), Number(r.balance)]),
  );
  for (const p of parties) {
    const id = Number(p.id);
    const expected =
      Number(p.opening_balance) +
      txns
        .filter((t) => t.party_id === id)
        .reduce((n, t) => n + (sign[String(t.type)] ?? 0) * Number(t.total), 0) -
      payments
        .filter((t) => t.party_id === id)
        .reduce((n, t) => n + (paySign[String(t.type)] ?? 0) * Number(t.amount), 0);
    const cached = cachedParties.get(id);
    if (cached !== expected)
      problems.push(`${p.name} (${formatINR(cached ?? 0)} → ${formatINR(expected)})`);
  }
  const accounts = context.sqlite
    .prepare(
      'SELECT id, name, opening_balance FROM payment_accounts WHERE firm_id = ? AND deleted_at IS NULL',
    )
    .all(firm);
  const cachedAccounts = new Map(
    context.sqlite
      .prepare('SELECT id, balance FROM account_balances WHERE firm_id = ?')
      .all(firm)
      .map((r) => [Number(r.id), Number(r.balance)]),
  );
  for (const a of accounts) {
    const id = Number(a.id);
    const expected =
      Number(a.opening_balance) +
      payments
        .filter((p) => p.account_id === id)
        .reduce((n, p) => n + Number(p.amount) * Number(p.direction), 0);
    const cached = cachedAccounts.get(id);
    if (cached !== expected)
      problems.push(`${a.name} (${formatINR(cached ?? 0)} → ${formatINR(expected)})`);
  }
  return check('balances', problems);
}

export function runVerify(context: DatabaseContext, firm: number, now = new Date()): VerifyReport {
  repositories(context).get(firm);
  return {
    ranAt: now.toISOString(),
    checks: [
      integrity(context),
      orphanLines(context),
      totalsCheck(context, firm),
      allocations(context, firm),
      numbering(context, firm),
      negativeStock(context, firm),
      balances(context, firm),
    ],
  };
}
/** Only checks that are provably safe to repair offer a fix. */
export function applyVerifyFix(context: DatabaseContext, firm: number, id: VerifyId): VerifyReport {
  if (id !== 'totals') throw new Error('validation');
  fixTotals(context, firm);
  return runVerify(context, firm);
}
