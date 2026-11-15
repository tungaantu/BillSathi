import { z } from 'zod';
import { date, today } from './masters';
import { assertPaise, sumPaise } from './money';
import type { Result } from './types';
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const id = z.number().int().positive();
export const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bankName: z.string().max(120),
  accountNumber: z.string().regex(/^\d{6,24}$|^$/),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$|^$/),
  upiId: z.string().max(120),
  openingBalance: z.number().int().safe(),
  openingDate: date,
  printOnInvoice: z.boolean(),
  isDefault: z.boolean(),
});
export type BankInput = z.infer<typeof accountSchema>;
export interface BankAccount extends BankInput {
  id: number;
  type: string;
  balance: number;
}
export const blankBank = (): BankInput => ({
  name: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  openingBalance: 0,
  openingDate: today(),
  printOnInvoice: false,
  isDefault: false,
});
export const transferSchema = z
  .object({
    fromId: id,
    toId: id,
    amount: money.positive(),
    date,
    description: z.string().max(4000),
  })
  .refine((v) => v.fromId !== v.toId);
export type Transfer = z.infer<typeof transferSchema>;
export const adjustmentSchema = z.object({
  amount: money.positive(),
  date,
  direction: z.union([z.literal(1), z.literal(-1)]),
  description: z.string().trim().min(1).max(4000),
});
export type CashAdjustment = z.infer<typeof adjustmentSchema>;
export interface StatementRow {
  id: number;
  date: string;
  description: string;
  incoming: number;
  outgoing: number;
  balance: number;
  interest?: number;
}
export function runningStatement(
  opening: number,
  rows: Omit<StatementRow, 'balance'>[],
): StatementRow[] {
  let balance = assertPaise(opening);
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((r) => ({ ...r, balance: (balance = sumPaise([balance, r.incoming, -r.outgoing])) }));
}
export function transferEntries(fromId: number, toId: number, amount: number) {
  if (fromId === toId || assertPaise(amount) <= 0) throw new Error('validation');
  return [
    { accountId: fromId, amount, direction: -1 },
    { accountId: toId, amount, direction: 1 },
  ];
}
export const chequeAction = z.enum(['deposited', 'withdrawn', 'cleared', 'bounced']);
export type ChequeAction = z.infer<typeof chequeAction>;
export interface Cheque {
  id: number;
  txnId: number;
  number: string;
  date: string;
  amount: number;
  direction: string;
  status: string;
  bank: string;
  actionDate: string | null;
  settledAccountId: number | null;
}
export function validateChequeAction(
  status: string,
  action: ChequeAction,
  direction: string,
  bankType?: string,
) {
  if (
    ['bounced', 'cleared'].includes(status) ||
    !['open', 'deposited', 'withdrawn'].includes(status)
  )
    throw new Error('validation');
  if (action === 'deposited' && (status !== 'open' || direction !== 'in'))
    throw new Error('validation');
  if (action === 'withdrawn' && (status !== 'open' || direction !== 'out'))
    throw new Error('validation');
  if (action !== 'bounced' && bankType !== 'bank') throw new Error('validation');
}
export const loanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  partyId: id.nullable(),
  amount: money.positive(),
  interestBps: z.number().int().min(0).max(10000),
  accountId: id,
  date,
});
export type LoanInput = z.infer<typeof loanSchema>;
export const emiSchema = z
  .object({
    loanId: id,
    principal: money,
    interest: money,
    accountId: id,
    date,
    description: z.string().max(4000),
  })
  .refine((v) => sumPaise([v.principal, v.interest]) > 0);
export type EmiInput = z.infer<typeof emiSchema>;
export function emiSplit(balance: number, principal: number, interest: number) {
  if (assertPaise(principal) < 0 || assertPaise(interest) < 0 || principal > balance)
    throw new Error('overpayment');
  return {
    principal,
    interest,
    payment: sumPaise([principal, interest]),
    remaining: sumPaise([balance, -principal]),
  };
}
export interface Loan {
  id: number;
  name: string;
  principal: number;
  balance: number;
  interestBps: number;
  startDate: string;
}
export interface FinanceApi {
  accounts(firm: number): Promise<Result<BankAccount[]>>;
  saveAccount(firm: number, id: number | null, input: BankInput): Promise<Result<number>>;
  statement(firm: number, id: number): Promise<Result<StatementRow[]>>;
  transfer(firm: number, input: Transfer): Promise<Result<number>>;
  adjust(firm: number, input: CashAdjustment): Promise<Result<number>>;
  cheques(firm: number): Promise<Result<Cheque[]>>;
  cheque(
    firm: number,
    id: number,
    action: ChequeAction,
    date: string,
    bankId: number | null,
  ): Promise<Result<void>>;
  loans(firm: number): Promise<Result<Loan[]>>;
  loan(firm: number, input: LoanInput): Promise<Result<number>>;
  emi(firm: number, input: EmiInput): Promise<Result<number>>;
  loanStatement(firm: number, id: number): Promise<Result<StatementRow[]>>;
}
