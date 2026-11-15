import type { DateRange } from './report-dates';
import type { Result } from './types';

export const REPORT_SECTIONS = [
  'transactions',
  'party',
  'gst',
  'item',
  'business',
  'expense',
  'orders',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export type FilterKey =
  | 'period'
  | 'asOn'
  | 'party'
  | 'item'
  | 'itemCategory'
  | 'partyGroup'
  | 'account'
  | 'paymentType'
  | 'side'
  | 'docType'
  | 'expenseCategory'
  | 'loan'
  | 'godown';
export interface ReportDef {
  id: string;
  section: ReportSection;
  /** Name of a lucide icon, resolved in the renderer. */
  icon: string;
  filters: FilterKey[];
  /** Wide reports print in landscape. */
  wide?: boolean;
}
const def = (
  section: ReportSection,
  icon: string,
  filters: FilterKey[],
  ids: string[],
  wide = false,
): ReportDef[] => ids.map((id) => ({ id, section, icon, filters, wide }));
const P: FilterKey[] = ['period'];
export const REPORTS: ReportDef[] = [
  ...def('transactions', 'ShoppingBag', ['period', 'party', 'paymentType'], ['sale']),
  ...def('transactions', 'ShoppingCart', ['period', 'party', 'paymentType'], ['purchase']),
  ...def('transactions', 'BookOpen', P, ['dayBook']),
  ...def('transactions', 'List', ['period', 'party', 'docType'], ['allTransactions'], true),
  ...def('transactions', 'TrendingUp', P, ['profitLoss']),
  ...def('transactions', 'Receipt', ['period', 'party'], ['billProfit']),
  ...def('transactions', 'ArrowLeftRight', P, ['cashFlow']),
  ...def('transactions', 'Scale', ['asOn'], ['trialBalance', 'balanceSheet']),
  ...def('party', 'FileText', ['period', 'party'], ['partyStatement']),
  ...def('party', 'TrendingUp', P, ['partyProfit']),
  ...def('party', 'Users', ['asOn', 'partyGroup'], ['allParties'], true),
  ...def('party', 'Package', ['period', 'party'], ['partyItems']),
  ...def('party', 'Users', ['period', 'side'], ['partySales']),
  ...def('party', 'Layers', ['period', 'side'], ['groupSales']),
  ...def('gst', 'FileSpreadsheet', P, ['gstr1'], true),
  ...def('gst', 'FileSpreadsheet', P, ['gstr2'], true),
  ...def('gst', 'FileSpreadsheet', P, ['gstr3b']),
  ...def('gst', 'Hash', ['period', 'side'], ['hsnSummary', 'sacReport']),
  ...def('gst', 'Percent', ['period', 'side'], ['gstReport', 'gstRates'], true),
  ...def('item', 'Boxes', ['asOn', 'itemCategory', 'godown'], ['stockSummary']),
  ...def('item', 'Boxes', ['asOn', 'itemCategory'], ['stockByCategory']),
  ...def('item', 'Users', ['period', 'item'], ['itemParties']),
  ...def('item', 'TrendingUp', ['period', 'itemCategory'], ['itemProfit']),
  ...def('item', 'Layers', P, ['categoryProfit']),
  ...def('item', 'TriangleAlert', ['itemCategory'], ['lowStock']),
  ...def('item', 'CalendarClock', ['asOn', 'item'], ['batchExpiry']),
  ...def('item', 'History', ['period', 'item'], ['stockDetail', 'itemDetail']),
  ...def('item', 'Layers', ['period', 'side'], ['categorySales']),
  ...def('item', 'BadgePercent', ['period', 'side'], ['itemDiscount']),
  ...def('business', 'Landmark', ['period', 'account'], ['bankStatement']),
  ...def('business', 'Wallet', P, ['cashBook']),
  ...def('business', 'BadgePercent', ['period', 'party'], ['discountReport']),
  ...def('business', 'HandCoins', ['loan'], ['loanStatement']),
  ...def('expense', 'Receipt', ['period', 'expenseCategory', 'paymentType'], ['expenseReport']),
  ...def('expense', 'Layers', P, ['expenseCategory']),
  ...def('expense', 'Package', P, ['expenseItem']),
  ...def('orders', 'ClipboardList', ['period', 'party'], ['saleOrders', 'purchaseOrders']),
];
export const reportDef = (id: string) => REPORTS.find((r) => r.id === id);

export interface ReportFilters extends DateRange {
  asOn?: string;
  partyId?: number | null;
  itemId?: number | null;
  /** Item category. */
  categoryId?: number | null;
  groupId?: number | null;
  accountId?: number | null;
  /** Payment account type: cash, bank, upi, card or cheque. */
  paymentType?: string;
  side?: 'sale' | 'purchase';
  docType?: string;
  expenseCategoryId?: number | null;
  loanId?: number | null;
  godownId?: number | null;
  /** GSTR-1 tab. */
  tab?: string;
  /** Sale and purchase registers: only bills that still have a balance (`due`) or are past their due date. */
  due?: 'due' | 'overdue';
}
export type ColumnType = 'text' | 'date' | 'money' | 'qty' | 'int' | 'percent' | 'rate';
export interface ReportColumn {
  key: string;
  /** i18n key. */
  label: string;
  type: ColumnType;
  /** Add this column up in the totals row. */
  total?: boolean;
  /** Cell values are i18n keys. */
  translate?: boolean;
}
export type Cell = string | number | null;
/** Reserved keys: `_link` route to open, `_bold` heading row, `_indent` nested row. */
export type ReportRow = Record<string, Cell>;
export interface SummaryCard {
  key: string;
  label: string;
  value: number;
  type: 'money' | 'int' | 'percent' | 'qty';
  tone?: 'success' | 'danger';
}
export interface FixIssue {
  /** i18n key of the problem. */
  code: string;
  docNumber: string;
  detail: string;
  /** Route that opens the offending invoice or party. */
  link: string;
  severity: 'error' | 'warning';
}
export interface ReportResult {
  id: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
  summary: SummaryCard[];
  /** i18n keys of short plain-language notes shown under the table. */
  notes: string[];
  issues?: FixIssue[];
  tabs?: { id: string; count: number }[];
}
export interface ReportOutputResult {
  path: string | null;
}
export interface InsightData {
  series: { label: string; sales: number; purchase: number }[];
  topCustomers: { partyId: number; name: string; total: number }[];
  topItems: { itemId: number; name: string; total: number; qty: number }[];
  profitMonth: number;
  profitFrom: string;
  alerts: { overdueCount: number; overdueTotal: number; lowStock: number; chequesDue: number };
}
export interface ReportsApi {
  run(firm: number, id: string, filters: ReportFilters): Promise<Result<ReportResult>>;
  exportExcel(
    firm: number,
    id: string,
    filters: ReportFilters,
  ): Promise<Result<ReportOutputResult>>;
  exportPdf(firm: number, id: string, filters: ReportFilters): Promise<Result<ReportOutputResult>>;
  print(firm: number, id: string, filters: ReportFilters): Promise<Result<ReportOutputResult>>;
  gstr1Json(firm: number, filters: ReportFilters): Promise<Result<ReportOutputResult>>;
  gstr1Excel(firm: number, filters: ReportFilters): Promise<Result<ReportOutputResult>>;
  insights(firm: number, range: 'week' | 'month' | 'year'): Promise<Result<InsightData>>;
}
/** Route that opens a transaction, used by clickable report rows. */
export const TXN_ROUTES: Record<string, string> = {
  sale: 'invoices',
  payment_in: 'paymentIn',
  payment_out: 'paymentOut',
  estimate: 'estimates',
  sale_return: 'saleReturns',
  sale_order: 'saleOrders',
  purchase: 'bills',
  purchase_return: 'purchaseReturns',
  purchase_order: 'purchaseOrders',
  expense: 'expenses',
  other_income: 'otherIncome',
};
export const txnLink = (type: string, id: number): string | null => {
  const route = TXN_ROUTES[type];
  if (!route) return null;
  return ['payment_in', 'payment_out'].includes(type)
    ? `${route}/edit/${id}`
    : `${route}/preview/${id}`;
};
