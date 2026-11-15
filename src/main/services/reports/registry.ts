import { gstr3b } from './gstr3b';
import { batchExpiry } from './batch';
import { categoryProfit, itemProfit } from './item-profit';
import { categorySales, itemDiscount } from './stock-sales';
import type { ReportResult } from '../../../shared/reports';
import type { ReportCtx } from './engine';
import { balanceSheet, trialBalance } from './balance';
import { bankStatement, cashBook, discountReport, loanStatement } from './cash';
import { expenseCategory, expenseItem, expenseReport, orders } from './expenses';
import { gstRates, gstReport, gstr2, hsnReport } from './gst';
import { gstr1Report } from './gstr1-report';
import { allParties, bySalesParty, partyItems, partyProfit, partyStatement } from './parties';
import { billProfit, cashFlow, profitLoss } from './profit';
import {
  itemDetail,
  itemParties,
  lowStock,
  stockByCategory,
  stockDetail,
  stockSummary,
} from './stock';
import { allTransactions, dayBook, register } from './transactions';

type Runner = (ctx: ReportCtx) => ReportResult;
export const RUNNERS: Record<string, Runner> = {
  sale: (c) => register(c, 'sale'),
  purchase: (c) => register(c, 'purchase'),
  dayBook,
  allTransactions,
  profitLoss,
  billProfit,
  cashFlow,
  trialBalance,
  balanceSheet,
  partyStatement,
  partyProfit,
  allParties,
  partyItems,
  partySales: (c) => bySalesParty(c, false),
  groupSales: (c) => bySalesParty(c, true),
  gstr1: gstr1Report,
  gstr2,
  gstr3b,
  hsnSummary: (c) => hsnReport(c, false),
  sacReport: (c) => hsnReport(c, true),
  gstReport,
  gstRates,
  stockSummary,
  stockByCategory,
  itemParties,
  itemProfit,
  categoryProfit,
  categorySales,
  itemDiscount,
  lowStock,
  batchExpiry,
  stockDetail,
  itemDetail,
  bankStatement,
  cashBook,
  discountReport,
  loanStatement,
  expenseReport,
  expenseCategory,
  expenseItem,
  saleOrders: (c) => orders(c, 'sale_order'),
  purchaseOrders: (c) => orders(c, 'purchase_order'),
};
/** Runs one report. Throws `notFound` for an unknown id. */
export function runReport(ctx: ReportCtx, id: string): ReportResult {
  const runner = RUNNERS[id];
  if (!runner) throw new Error('notFound');
  return { ...runner(ctx), id };
}
