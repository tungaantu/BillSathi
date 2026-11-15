import type { Result } from './types';

/** Indian financial year (1 April – 31 March) helpers. Dates are `YYYY-MM-DD`. */
export interface FinancialYear {
  startYear: number;
  start: string;
  end: string;
  /** e.g. "2026-27" */
  label: string;
}
export function fyOf(date: string): FinancialYear {
  const [y, m] = date.split('-').map(Number);
  return fyStarting(m >= 4 ? y : y - 1);
}
export function fyStarting(startYear: number): FinancialYear {
  return {
    startYear,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}
/** True when a document dated `date` falls in a closed (locked) year. */
export function isLocked(date: string | null | undefined, closedThrough: unknown) {
  return Boolean(
    date && typeof closedThrough === 'string' && closedThrough && date <= closedThrough,
  );
}
/**
 * Adds (or replaces) a financial-year tag at the end of a number prefix so invoice numbers
 * restart from 1 in the new year without clashing with last year's: INV- → INV-2627-.
 */
export function withFyTag(prefix: string, startYear: number) {
  const tag = `${String(startYear % 100).padStart(2, '0')}${String((startYear + 1) % 100).padStart(2, '0')}`;
  const base = prefix.replace(/\d{4}-$/, '');
  const sep = base === '' || /[-/]$/.test(base) ? '' : '-';
  return `${base}${sep}${tag}-`;
}
/** The year that can be closed next: the latest FY that has fully ended and is still open. */
export function closableYear(today: string, closedThrough: unknown): FinancialYear | null {
  const current = fyOf(today);
  const last = fyStarting(current.startYear - 1);
  if (typeof closedThrough === 'string' && closedThrough >= last.end) return null;
  return last;
}
export interface ClosingSnapshot {
  fy: FinancialYear;
  parties: { id: number; name: string; balance: number }[];
  accounts: { id: number; name: string; type: string; balance: number }[];
  stock: { id: number; name: string; qty: number; value: number }[];
  openCheques: { id: number; number: string; party: string; amount: number; date: string }[];
  unpaid: { id: number; number: string; party: string; balance: number; dueDate: string }[];
  totals: { receivable: number; payable: number; cashBank: number; stockValue: number };
}
export interface FyStatus {
  closedThrough: string;
  next: FinancialYear | null;
  history: {
    id: number;
    label: string;
    fyEnd: string;
    closedAt: string;
    reopenedAt: string | null;
    backupPath: string;
  }[];
}
export interface FyApi {
  status(firm: number): Promise<Result<FyStatus>>;
  preview(firm: number, startYear: number): Promise<Result<ClosingSnapshot>>;
  close(
    firm: number,
    startYear: number,
    backupPath: string,
    resetNumbers: boolean,
  ): Promise<Result<ClosingSnapshot>>;
  reopen(firm: number): Promise<Result<string>>;
}
