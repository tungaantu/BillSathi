import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { yearLock } from './fy-lock';
import { salesRead } from './sales-read';
import type { SaleDocument } from '../../shared/sales';
export function financePosting(context: DatabaseContext) {
  const { db, repo, next } = salesRead(context);
  function account(firm: number, id: number) {
    repo.get(firm);
    const row = db
      .select()
      .from(s.paymentAccounts)
      .where(
        and(
          eq(s.paymentAccounts.firmId, firm),
          eq(s.paymentAccounts.id, id),
          isNull(s.paymentAccounts.deletedAt),
        ),
      )
      .get();
    if (!row) throw new Error('validation');
    return row;
  }
  function post(
    firm: number,
    type: string,
    date: string,
    description: string,
    payments: { accountId: number; amount: number; direction: number }[],
    metadata: unknown = {},
    total = 0,
    categoryId: number | null = null,
  ) {
    const at = new Date().toISOString();
    repo.get(firm);
    yearLock(context)(firm, date);
    payments.forEach((p) => {
      if (account(firm, p.accountId).type === 'cheque') throw new Error('validation');
    });
    const row = db
      .insert(s.txns)
      .values({
        firmId: firm,
        type,
        number: next(firm, type, ''),
        date,
        description,
        status: 'posted',
        total,
        expenseCategoryId: categoryId,
        metadata: JSON.stringify(metadata),
        createdAt: at,
        updatedAt: at,
      })
      .returning()
      .get();
    payments.forEach((p) =>
      db
        .insert(s.txnPayments)
        .values({ ...p, txnId: row.id })
        .run(),
    );
    repo.audit(firm, 'txns', row.id, 'create', null, row);
    return row.id;
  }
  function cheque(
    firm: number,
    txnId: number,
    paymentId: number,
    payment: SaleDocument['payments'][number],
    date: string,
    direction: number,
  ) {
    if (account(firm, payment.accountId).type !== 'cheque') return;
    if (!payment.reference.trim()) throw new Error('validation');
    const row = db
      .insert(s.cheques)
      .values({
        firmId: firm,
        txnId,
        paymentId,
        accountId: payment.accountId,
        number: payment.reference,
        date: payment.chequeDate || date,
        amount: payment.amount,
        direction: direction === 1 ? 'in' : 'out',
        status: 'open',
      })
      .returning()
      .get();
    repo.audit(firm, 'cheques', row.id, 'create', null, row);
  }
  return { db, repo, account, post, cheque };
}
