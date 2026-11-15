import { z } from 'zod';
import type { DatabaseContext } from '../../db';
import { repositories } from '../../db/repositories';
import { date as validDate, today } from '../../../shared/masters';
import { formatDate } from '../../../shared/dates';
import type { ReportFilters, ReportResult } from '../../../shared/reports';
import type { Settings } from '../../../shared/types';
import type { ReportCtx } from './engine';
import type { ReportHeader } from './excel';
import { gstr1Data } from './gstr1';
import { insights } from './insights';
import { translator } from './labels';
import { runReport } from './registry';

const date = validDate;
const ref = z.number().int().positive().nullish();
export const filtersSchema = z.object({
  from: date,
  to: date,
  asOn: date.optional(),
  partyId: ref,
  itemId: ref,
  categoryId: ref,
  groupId: ref,
  accountId: ref,
  paymentType: z.enum(['cash', 'bank', 'upi', 'card', 'cheque']).optional(),
  side: z.enum(['sale', 'purchase']).optional(),
  docType: z.string().max(40).optional(),
  expenseCategoryId: ref,
  loanId: ref,
  tab: z.string().max(20).optional(),
  due: z.enum(['due', 'overdue']).optional(),
});
/** Reads the business's books and answers report questions. Everything here is read-only. */
export function reportService(context: DatabaseContext, now: () => string = today) {
  const repo = repositories(context);
  function ctx(firm: number, filters: ReportFilters): ReportCtx {
    repo.get(firm);
    const parsed = filtersSchema.parse(filters) as ReportFilters;
    if (parsed.from > parsed.to) throw new Error('validation');
    return { context, firm, filters: parsed, today: now() };
  }
  const run = (firm: number, id: string, filters: ReportFilters): ReportResult =>
    runReport(ctx(firm, filters), id);
  /** Company and period lines printed above an export. */
  function header(
    firm: number,
    id: string,
    filters: ReportFilters,
    settings: Settings,
  ): ReportHeader {
    const company = repo.get(firm);
    const tr = translator(settings.language);
    const asOnly = [
      'trialBalance',
      'balanceSheet',
      'allParties',
      'stockSummary',
      'stockByCategory',
    ].includes(id);
    const period = asOnly
      ? `${tr('reports.asOn') ?? ''} ${formatDate(filters.asOn || now(), settings)}`
      : `${formatDate(filters.from, settings)} - ${formatDate(filters.to, settings)}`;
    return {
      title: tr(`reports.name.${id}`) ?? id,
      company: company.name,
      gstin: company.gstin,
      period: period.trim(),
    };
  }
  return {
    run,
    header,
    context: ctx,
    gstr1: (firm: number, filters: ReportFilters) => gstr1Data(ctx(firm, filters)),
    insights: (firm: number, range: 'week' | 'month' | 'year') =>
      insights(ctx(firm, { from: now(), to: now() }), range),
    settings: (firm: number) => repo.getSettings(firm),
  };
}
