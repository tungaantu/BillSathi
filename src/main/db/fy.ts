import { existsSync } from 'node:fs';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { repositories } from './repositories';
import { yearLock } from './fy-lock';
import { salesRead } from './sales-read';
import { partyBalances } from '../services/reports/parties';
import { stockItems } from '../services/reports/stock';
import type { ReportCtx } from '../services/reports/engine';
import {
  closableYear,
  fyStarting,
  withFyTag,
  type ClosingSnapshot,
  type FinancialYear,
} from '../../shared/fy';
import { today } from '../../shared/masters';
import { displayDocumentNumber } from '../../shared/numbering';
import { sumPaise } from '../../shared/money';

/** Number prefixes the owner can set; they get a new-year tag when "reset numbers" is on. */
const PREFIX_KEYS = [
  'prefix.sale',
  'prefix.sale_return',
  'prefix.estimate',
  'prefix.sale_order',
  'prefix.payment_in',
];

export function fyRepository(context: DatabaseContext, now: () => string = today) {
  const { sqlite } = context;
  const db = new Proxy(context.db, {
    get(_t, p) {
      const v = Reflect.get(context.db, p);
      return typeof v === 'function' ? v.bind(context.db) : v;
    },
  });
  const repo = repositories(context);
  const read = salesRead(context);
  type Param = string | number | null;
  const rows = <T>(sql: string, ...params: Param[]) => sqlite.prepare(sql).all(...params) as T[];

  const closedThrough = (firm: number) => String(repo.getSettings(firm).booksClosedThrough ?? '');
  const assertOpen = yearLock(context);
  function writeLock(firm: number, value: string) {
    db.insert(s.settings)
      .values({ firmId: firm, key: 'booksClosedThrough', value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: [s.settings.firmId, s.settings.key],
        set: { value: JSON.stringify(value) },
      })
      .run();
  }

  /** What the year closes with — the balances the next year starts from. */
  function preview(firm: number, fy: FinancialYear): ClosingSnapshot {
    repo.get(firm);
    const ctx: ReportCtx = {
      context,
      firm,
      filters: { from: fy.start, to: fy.end, asOn: fy.end },
      today: now(),
    };
    const parties = partyBalances(ctx, fy.end)
      .filter((p) => p.balance !== 0)
      .map((p) => ({ id: p.id, name: p.name, balance: p.balance }));
    const accounts = rows<{ id: number; name: string; type: string; balance: number }>(
      `SELECT a.id, a.name, a.type,
         CASE WHEN COALESCE(a.opening_date,'0000-01-01') <= ? THEN a.opening_balance ELSE 0 END
         + COALESCE((SELECT SUM(p.amount*p.direction) FROM txn_payments p JOIN txns t ON t.id=p.txn_id
            WHERE p.reversed=0 AND p.account_id=a.id AND t.firm_id=a.firm_id AND t.deleted_at IS NULL
              AND (t.status='posted' OR (t.type='sale_order' AND t.status IN ('open','closed')))
              AND COALESCE(p.posting_date, t.date) <= ?),0) balance
       FROM payment_accounts a WHERE a.firm_id=? AND a.deleted_at IS NULL AND a.type IN ('cash','bank')
       ORDER BY a.type, a.name`,
      fy.end,
      fy.end,
      firm,
    );
    const stock = stockItems(ctx, fy.end)
      .filter((i) => i.qty !== 0)
      .map((i) => ({ id: i.id, name: i.name, qty: i.qty, value: i.value }));
    const openCheques = rows<ClosingSnapshot['openCheques'][number]>(
      `SELECT c.id, c.number, COALESCE(p.name,'') party, c.amount, c.date FROM cheques c
       LEFT JOIN txns t ON t.id=c.txn_id LEFT JOIN parties p ON p.id=t.party_id
       WHERE c.firm_id=? AND c.deleted_at IS NULL AND COALESCE(c.status,'open')='open' AND c.date <= ?
       ORDER BY c.date`,
      firm,
      fy.end,
    );
    const unpaid = read
      .list(firm)
      .filter(
        (t) =>
          ['sale', 'purchase'].includes(t.type) &&
          t.status === 'posted' &&
          t.balance > 0 &&
          t.date >= fy.start &&
          t.date <= fy.end,
      )
      .map((t) => ({
        id: t.id,
        number: displayDocumentNumber({ ...t, firmId: firm }),
        party: t.partyName,
        balance: t.balance,
        dueDate: t.dueDate ?? '',
      }));
    return {
      fy,
      parties,
      accounts,
      stock,
      openCheques,
      unpaid,
      totals: {
        receivable: sumPaise(parties.filter((p) => p.balance > 0).map((p) => p.balance)),
        payable: sumPaise(parties.filter((p) => p.balance < 0).map((p) => -p.balance)),
        cashBank: sumPaise(accounts.map((a) => a.balance)),
        stockValue: sumPaise(stock.map((i) => i.value)),
      },
    };
  }
  function status(firm: number) {
    const closed = closedThrough(firm);
    return {
      closedThrough: closed,
      next: closableYear(now(), closed),
      history: db
        .select()
        .from(s.fyClosings)
        .where(eq(s.fyClosings.firmId, firm))
        .orderBy(desc(s.fyClosings.fyEnd))
        .all()
        .map((c) => ({
          id: c.id,
          label: fyStarting(Number(c.fyStart.slice(0, 4))).label,
          fyEnd: c.fyEnd,
          closedAt: c.closedAt,
          reopenedAt: c.reopenedAt,
          backupPath: c.backupPath,
        })),
    };
  }
  /** Closes the year that starts in `startYear`. A backup file made just before is required. */
  function close(firm: number, startYear: number, backupPath: string, resetNumbers: boolean) {
    const fy = fyStarting(startYear);
    const next = closableYear(now(), closedThrough(firm));
    if (!next || next.startYear !== startYear) throw new Error('validation');
    if (!backupPath.endsWith('.bsbk') || !existsSync(backupPath)) throw new Error('backupFirst');
    return sqlite.transaction(() => {
      const snapshot = preview(firm, fy);
      const row = db
        .insert(s.fyClosings)
        .values({
          firmId: firm,
          fyStart: fy.start,
          fyEnd: fy.end,
          closedAt: new Date().toISOString(),
          backupPath,
          snapshot: JSON.stringify(snapshot),
        })
        .returning()
        .get();
      writeLock(firm, fy.end);
      if (resetNumbers) {
        const settings = repo.getSettings(firm);
        for (const key of PREFIX_KEYS)
          repo.set(firm, key, withFyTag(String(settings[key] ?? ''), startYear + 1));
      }
      repo.audit(firm, 'fy_closings', row.id, 'create', null, {
        fy: fy.label,
        resetNumbers,
        totals: snapshot.totals,
      });
      return snapshot;
    })();
  }
  /** Re-opens the most recently closed year (the screen asks for the passcode first). */
  function reopen(firm: number) {
    return sqlite.transaction(() => {
      const open = db
        .select()
        .from(s.fyClosings)
        .where(and(eq(s.fyClosings.firmId, firm), isNull(s.fyClosings.reopenedAt)))
        .orderBy(desc(s.fyClosings.fyEnd))
        .all();
      if (!open.length) throw new Error('validation');
      db.update(s.fyClosings)
        .set({ reopenedAt: new Date().toISOString() })
        .where(eq(s.fyClosings.id, open[0].id))
        .run();
      writeLock(firm, open[1]?.fyEnd ?? '');
      repo.audit(
        firm,
        'fy_closings',
        open[0].id,
        'update',
        { closed: open[0].fyEnd },
        { reopened: true },
      );
      return closedThrough(firm);
    })();
  }
  return { assertOpen, closedThrough, preview, status, close, reopen };
}
