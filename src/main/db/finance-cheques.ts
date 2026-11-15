import { reconcileLoyalty } from './customer-loyalty';
import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { yearLock } from './fy-lock';
import { financePosting } from './finance-posting';
import { date as dateSchema } from '../../shared/masters';
import { validateChequeAction, type Cheque, type ChequeAction } from '../../shared/finance';
export function financeCheques(context: DatabaseContext) {
  const { db, repo, account } = financePosting(context);
  function cheques(firm: number): Cheque[] {
    repo.get(firm);
    const live = new Set(
      db
        .select()
        .from(s.txns)
        .where(eq(s.txns.firmId, firm))
        .all()
        .filter((t) => t.status === 'posted' && !t.deletedAt)
        .map((t) => t.id),
    );
    return db
      .select()
      .from(s.cheques)
      .where(eq(s.cheques.firmId, firm))
      .all()
      .filter((c) => !c.deletedAt && c.txnId && live.has(c.txnId))
      .map((c) => ({ ...c, txnId: c.txnId!, bank: c.bank ?? '', status: c.status ?? 'open' }));
  }
  function cheque(
    firm: number,
    id: number,
    action: ChequeAction,
    date: string,
    bankId: number | null,
  ) {
    context.sqlite.transaction(() => {
      const before = cheques(firm).find((c) => c.id === id);
      if (!before) throw new Error('notFound');
      const bank = bankId ?? before.settledAccountId;
      validateChequeAction(
        before.status,
        action,
        before.direction,
        bank ? account(firm, bank).type : undefined,
      );
      dateSchema.parse(date);
      yearLock(context)(firm, date);
      const row = db.select().from(s.cheques).where(eq(s.cheques.id, id)).get()!;
      if (!row.paymentId) throw new Error('validation');
      if (action === 'bounced') {
        db.update(s.txnPayments)
          .set({ reversed: true })
          .where(eq(s.txnPayments.id, row.paymentId))
          .run();
        const txn = db.select().from(s.txns).where(eq(s.txns.id, before.txnId)).get()!;
        if (['payment_in', 'payment_out'].includes(txn.type)) {
          db.update(s.txns)
            .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
            .where(eq(s.txns.id, txn.id))
            .run();
          repo.audit(firm, 'txns', txn.id, 'cheque_bounce', txn, { status: 'cancelled' });
        }
      }
      if (action === 'cleared')
        db.update(s.txnPayments)
          .set({ accountId: bank!, postingDate: date })
          .where(eq(s.txnPayments.id, row.paymentId))
          .run();
      db.update(s.cheques)
        .set({ status: action, actionDate: date, settledAccountId: bank })
        .where(and(eq(s.cheques.id, id), eq(s.cheques.firmId, firm)))
        .run();
      reconcileLoyalty(context, firm);
      repo.audit(firm, 'cheques', id, action, before, {
        ...before,
        status: action,
        actionDate: date,
        settledAccountId: bank,
      });
    })();
  }
  return { cheques, cheque };
}
