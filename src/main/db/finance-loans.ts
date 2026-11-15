import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { financePosting } from './finance-posting';
import {
  emiSchema,
  emiSplit,
  loanSchema,
  runningStatement,
  type EmiInput,
  type Loan,
  type LoanInput,
} from '../../shared/finance';
import { sumPaise } from '../../shared/money';
export function financeLoans(context: DatabaseContext) {
  const { db, repo, post, account } = financePosting(context);
  function loans(firm: number): Loan[] {
    repo.get(firm);
    const payments = db
      .select()
      .from(s.txns)
      .where(
        and(
          eq(s.txns.firmId, firm),
          eq(s.txns.type, 'loan_payment'),
          eq(s.txns.status, 'posted'),
          isNull(s.txns.deletedAt),
        ),
      )
      .all();
    return db
      .select()
      .from(s.loans)
      .where(and(eq(s.loans.firmId, firm), isNull(s.loans.deletedAt)))
      .all()
      .map((l) => ({
        ...l,
        startDate: l.startDate!,
        interestBps: l.interestBps ?? 0,
        balance: sumPaise([
          l.principal,
          ...payments
            .map((p) => JSON.parse(p.metadata))
            .filter((p) => p.loanId === l.id)
            .map((p) => -p.principal),
        ]),
      }));
  }
  function loan(firm: number, input: LoanInput) {
    return context.sqlite.transaction(() => {
      const v = loanSchema.parse(input);
      if (!['bank', 'cash'].includes(account(firm, v.accountId).type))
        throw new Error('validation');
      if (
        v.partyId &&
        !db
          .select()
          .from(s.parties)
          .where(
            and(
              eq(s.parties.id, v.partyId),
              eq(s.parties.firmId, firm),
              isNull(s.parties.deletedAt),
            ),
          )
          .get()
      )
        throw new Error('validation');
      const row = db
        .insert(s.loans)
        .values({
          firmId: firm,
          name: v.name,
          partyId: v.partyId,
          accountId: v.accountId,
          principal: v.amount,
          interestBps: v.interestBps,
          startDate: v.date,
        })
        .returning()
        .get();
      post(
        firm,
        'loan_received',
        v.date,
        v.name,
        [{ accountId: v.accountId, amount: v.amount, direction: 1 }],
        { loanId: row.id, principal: v.amount },
        v.amount,
      );
      repo.audit(firm, 'loans', row.id, 'create', null, row);
      return row.id;
    })();
  }
  function emi(firm: number, input: EmiInput) {
    return context.sqlite.transaction(() => {
      const v = emiSchema.parse(input),
        l = loans(firm).find((l) => l.id === v.loanId);
      if (!l) throw new Error('notFound');
      const split = emiSplit(l.balance, v.principal, v.interest);
      const key = post(
        firm,
        'loan_payment',
        v.date,
        v.description,
        [{ accountId: v.accountId, amount: split.principal, direction: -1 }],
        v,
        split.principal,
      );
      if (split.interest) {
        let category = db
          .select()
          .from(s.expenseCategories)
          .where(
            and(
              eq(s.expenseCategories.firmId, firm),
              eq(s.expenseCategories.name, 'loan_interest'),
            ),
          )
          .get();
        if (!category) {
          category = db
            .insert(s.expenseCategories)
            .values({ firmId: firm, name: 'loan_interest' })
            .returning()
            .get();
          repo.audit(firm, 'expense_categories', category.id, 'create', null, category);
        }
        post(
          firm,
          'expense',
          v.date,
          v.description,
          [{ accountId: v.accountId, amount: split.interest, direction: -1 }],
          { loanId: l.id, interest: split.interest },
          split.interest,
          category.id,
        );
      }
      repo.audit(firm, 'loans', l.id, 'repay', l, { balance: split.remaining });
      return key;
    })();
  }
  function loanStatement(firm: number, id: number) {
    const l = loans(firm).find((l) => l.id === id);
    if (!l) throw new Error('notFound');
    const rows = db
      .select()
      .from(s.txns)
      .where(and(eq(s.txns.firmId, firm), eq(s.txns.status, 'posted'), isNull(s.txns.deletedAt)))
      .all()
      .filter(
        (t) =>
          JSON.parse(t.metadata).loanId === id &&
          ['loan_received', 'loan_payment', 'expense'].includes(t.type),
      );
    return runningStatement(
      0,
      rows.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.type,
        incoming: t.type === 'loan_received' ? t.total : 0,
        outgoing: t.type === 'loan_payment' ? t.total : 0,
        interest: t.type === 'expense' ? t.total : 0,
      })),
    );
  }
  return { loans, loan, emi, loanStatement };
}
