import { unlinkSync } from 'node:fs';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { DatabaseContext } from '../db';
import * as s from '../db/schema';
import { repositories } from '../db/repositories';
import { salesRepository } from '../db/sales';
import { daysLeft, purgeCutoff, restoreClash } from '../../shared/recycle';
import type { RecycleRow } from '../../shared/safety-api';

export function recycleService(context: DatabaseContext) {
  const repo = repositories(context);
  const sales = salesRepository(context);
  const db = () => context.db;
  const deletedTxn = (firm: number, id: number) => {
    repo.get(firm);
    const row = db()
      .select()
      .from(s.txns)
      .where(and(eq(s.txns.firmId, firm), eq(s.txns.id, id), isNotNull(s.txns.deletedAt)))
      .get();
    if (!row) throw new Error('notFound');
    return row;
  };

  function list(firm: number, now = new Date()): RecycleRow[] {
    return sales
      .list(firm, undefined, true)
      .map((r) => ({ ...r, daysLeft: daysLeft(r.deletedAt ?? now.toISOString(), now) }))
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  }
  /** Brings a document back after re-checking its number, stock and payment rules. */
  function restore(firm: number, id: number) {
    const target = deletedTxn(firm, id);
    const series = db()
      .select()
      .from(s.txns)
      .where(and(eq(s.txns.firmId, firm), eq(s.txns.type, target.type)))
      .all();
    if (restoreClash(target, series)) throw new Error('duplicate');
    sales.action(firm, id, 'restore');
  }

  /** Removes one soft-deleted document and everything hanging off it. Returns files to delete. */
  function purgeRows(firm: number, id: number): string[] {
    const row = deletedTxn(firm, id);
    const d = db();
    const files = d
      .select()
      .from(s.attachments)
      .where(eq(s.attachments.txnId, id))
      .all()
      .map((a) => a.path);
    const lineIds = d
      .select({ id: s.txnLines.id })
      .from(s.txnLines)
      .where(eq(s.txnLines.txnId, id))
      .all()
      .map((l) => l.id);
    d.delete(s.paymentLinks).where(eq(s.paymentLinks.paymentTxnId, id)).run();
    d.delete(s.paymentLinks).where(eq(s.paymentLinks.invoiceTxnId, id)).run();
    d.delete(s.txnPayments).where(eq(s.txnPayments.txnId, id)).run();
    d.delete(s.additionalCharges).where(eq(s.additionalCharges.txnId, id)).run();
    d.delete(s.stockLedger).where(eq(s.stockLedger.txnId, id)).run();
    if (lineIds.length) {
      d.update(s.serials)
        .set({ txnLineId: null })
        .where(inArray(s.serials.txnLineId, lineIds))
        .run();
      d.update(s.stockLedger)
        .set({ txnLineId: null })
        .where(inArray(s.stockLedger.txnLineId, lineIds))
        .run();
    }
    d.delete(s.txnLines).where(eq(s.txnLines.txnId, id)).run();
    d.delete(s.attachments).where(eq(s.attachments.txnId, id)).run();
    d.update(s.cheques).set({ txnId: null }).where(eq(s.cheques.txnId, id)).run();
    d.delete(s.txns).where(eq(s.txns.id, id)).run();
    repo.audit(firm, 'txns', id, 'purge', row, null);
    return files;
  }
  const dropFiles = (files: string[]) => {
    for (const f of files)
      try {
        unlinkSync(f);
      } catch {
        /* already gone */
      }
  };
  function purge(firm: number, id: number) {
    dropFiles(context.sqlite.transaction(() => purgeRows(firm, id))());
  }
  function empty(firm: number): number {
    const ids = list(firm).map((r) => r.id);
    dropFiles(context.sqlite.transaction(() => ids.flatMap((id) => purgeRows(firm, id)))());
    return ids.length;
  }
  /** Startup housekeeping: documents deleted more than 30 days ago go for good. */
  function purgeExpired(now = new Date()): number {
    const old = db()
      .select({ id: s.txns.id, firmId: s.txns.firmId })
      .from(s.txns)
      .where(and(isNotNull(s.txns.deletedAt), lt(s.txns.deletedAt, purgeCutoff(now))))
      .all();
    if (!old.length) return 0;
    dropFiles(context.sqlite.transaction(() => old.flatMap((r) => purgeRows(r.firmId, r.id)))());
    return old.length;
  }
  return { list, restore, purge, empty, purgeExpired };
}
