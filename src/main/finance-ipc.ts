import { z } from 'zod';
import type { DatabaseContext } from './db';
import { financeRepository } from './db/finance';
import {
  chequeAction,
  type BankInput,
  type Transfer,
  type CashAdjustment,
  type LoanInput,
  type EmiInput,
} from '../shared/finance';
import { date } from '../shared/masters';
export function registerFinanceIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const repo = financeRepository(context),
    id = (v: unknown) => z.number().int().positive().parse(v);
  handle('finance:accounts', (f) => repo.accounts(id(f)));
  handle('finance:saveAccount', (f, i, v) =>
    repo.saveAccount(id(f), i === null ? null : id(i), v as BankInput),
  );
  handle('finance:statement', (f, i) => repo.statement(id(f), id(i)));
  handle('finance:transfer', (f, v) => repo.transfer(id(f), v as Transfer));
  handle('finance:adjust', (f, v) => repo.adjust(id(f), v as CashAdjustment));
  handle('finance:cheques', (f) => repo.cheques(id(f)));
  handle('finance:cheque', (f, i, a, d, b) =>
    repo.cheque(id(f), id(i), chequeAction.parse(a), date.parse(d), b === null ? null : id(b)),
  );
  handle('finance:loans', (f) => repo.loans(id(f)));
  handle('finance:loan', (f, v) => repo.loan(id(f), v as LoanInput));
  handle('finance:emi', (f, v) => repo.emi(id(f), v as EmiInput));
  handle('finance:loanStatement', (f, i) => repo.loanStatement(id(f), id(i)));
}
