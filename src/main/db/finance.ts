import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { financePosting } from './finance-posting';
import { salesRead } from './sales-read';
import { financeCheques } from './finance-cheques';
import { financeLoans } from './finance-loans';
import {
  accountSchema,
  adjustmentSchema,
  runningStatement,
  transferEntries,
  transferSchema,
  type BankAccount,
  type BankInput,
  type CashAdjustment,
  type Transfer,
} from '../../shared/finance';
export function financeRepository(context: DatabaseContext) {
  const { db, repo, account, post } = financePosting(context);
  function accounts(firm: number): BankAccount[] {
    salesRead(context).accounts(firm);
    return db
      .select()
      .from(s.paymentAccounts)
      .where(and(eq(s.paymentAccounts.firmId, firm), isNull(s.paymentAccounts.deletedAt)))
      .all()
      .map((a) => ({
        ...a,
        bankName: a.bankName ?? '',
        accountNumber: a.accountNumber ?? '',
        ifsc: a.ifsc ?? '',
        upiId: a.upiId ?? '',
        openingDate: a.openingDate ?? '2000-01-01',
        printOnInvoice: Boolean(a.printOnInvoice),
        balance: Number(
          context.sqlite
            .prepare('SELECT balance FROM account_balances WHERE id=? AND firm_id=?')
            .get(a.id, firm)?.balance ?? 0,
        ),
      }));
  }
  function saveAccount(firm: number, id: number | null, input: BankInput) {
    return context.sqlite.transaction(() => {
      repo.get(firm);
      const value = accountSchema.parse(input),
        before = id ? account(firm, id) : null;
      if (before && before.type !== 'bank') throw new Error('validation');
      if (value.isDefault)
        db.update(s.paymentAccounts)
          .set({ isDefault: false })
          .where(eq(s.paymentAccounts.firmId, firm))
          .run();
      const row = id
        ? db
            .update(s.paymentAccounts)
            .set(value)
            .where(eq(s.paymentAccounts.id, id))
            .returning()
            .get()
        : db
            .insert(s.paymentAccounts)
            .values({ ...value, firmId: firm, type: 'bank' })
            .returning()
            .get();
      repo.audit(firm, 'payment_accounts', row.id, before ? 'update' : 'create', before, row);
      return row.id;
    })();
  }
  function statement(firm: number, id: number) {
    const a = account(firm, id);
    const rows = context.sqlite
      .prepare(
        "SELECT p.id,COALESCE(p.posting_date,t.date) date,COALESCE(t.description,'') description,p.amount,p.direction FROM txn_payments p JOIN txns t ON t.id=p.txn_id WHERE t.firm_id=? AND p.account_id=? AND p.reversed=0 AND t.status='posted' AND t.deleted_at IS NULL",
      )
      .all(firm, id);
    return runningStatement(0, [
      {
        id: 0,
        date: a.openingDate ?? '2000-01-01',
        description: 'opening',
        incoming: Math.max(0, a.openingBalance),
        outgoing: Math.max(0, -a.openingBalance),
      },
      ...rows.map((r) => ({
        id: Number(r.id),
        date: String(r.date),
        description: String(r.description),
        incoming: r.direction === 1 ? Number(r.amount) : 0,
        outgoing: r.direction === -1 ? Number(r.amount) : 0,
      })),
    ]);
  }
  function transfer(firm: number, input: Transfer) {
    return context.sqlite.transaction(() => {
      const v = transferSchema.parse(input);
      if (
        ![account(firm, v.fromId), account(firm, v.toId)].every((a) =>
          ['bank', 'cash'].includes(a.type),
        )
      )
        throw new Error('validation');
      return post(
        firm,
        'transfer',
        v.date,
        v.description,
        transferEntries(v.fromId, v.toId, v.amount),
        v,
      );
    })();
  }
  function adjust(firm: number, input: CashAdjustment) {
    return context.sqlite.transaction(() => {
      const v = adjustmentSchema.parse(input),
        cash = accounts(firm).find((a) => a.type === 'cash')!;
      return post(
        firm,
        'cash_adjustment',
        v.date,
        v.description,
        [{ accountId: cash.id, amount: v.amount, direction: v.direction }],
        v,
      );
    })();
  }
  return {
    accounts,
    saveAccount,
    statement,
    transfer,
    adjust,
    ...financeCheques(context),
    ...financeLoans(context),
  };
}
