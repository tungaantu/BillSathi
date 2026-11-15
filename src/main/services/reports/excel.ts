import ExcelJS from 'exceljs';
import { formatDate } from '../../../shared/dates';
import { formatCell, type Translate } from '../../../shared/report-format';
import type { ReportColumn, ReportResult } from '../../../shared/reports';
import type { Settings } from '../../../shared/types';

/** Indian digit grouping (1,23,456.00) as an Excel number format. */
export const INDIAN_MONEY = '[>=10000000]##,##,##,##0.00;[>=100000]##,##,##0.00;##,##0.00';
export interface ReportHeader {
  title: string;
  company: string;
  gstin: string;
  /** Already formatted, e.g. `01/11/2026 to 30/11/2026`. */
  period: string;
}
const alignRight = (type: ReportColumn['type']) => type !== 'text' && type !== 'date';
/**
 * A formatted worksheet: company header, period, bold headers, money as real numbers in rupees,
 * a totals row and frozen headers.
 */
export function reportWorkbook(
  result: ReportResult,
  header: ReportHeader,
  tr: Translate,
  settings: Settings = {},
): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'BillSathi';
  const sheet = book.addWorksheet(header.title.slice(0, 31).replace(/[/?*[\]:]/g, ' '));
  const label = (key: string) => tr(key) ?? key;
  const span = Math.max(1, result.columns.length);
  const top = (text: string, bold = false, size = 11) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, span);
    row.font = { bold, size };
    return row;
  };
  top(header.company, true, 14);
  if (header.gstin) top(`GSTIN: ${header.gstin}`);
  top(header.title, true, 12);
  top(header.period);
  sheet.addRow([]);
  const head = sheet.addRow(result.columns.map((c) => label(c.label)));
  head.font = { bold: true };
  head.eachCell((cell, index) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { horizontal: alignRight(result.columns[index - 1].type) ? 'right' : 'left' };
  });
  const cellValue = (value: unknown, column: ReportColumn) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      if (column.type === 'money') return value / 100;
      if (column.type === 'percent' || column.type === 'rate') return value / 10000;
      return value;
    }
    return column.type === 'date'
      ? formatDate(String(value), settings)
      : formatCell(value as string, column, tr, settings);
  };
  const add = (source: Record<string, unknown>, bold = false) => {
    const row = sheet.addRow(result.columns.map((c) => cellValue(source[c.key], c)));
    if (bold || source._bold) row.font = { bold: true };
    return row;
  };
  for (const r of result.rows) add(r);
  if (result.totals) {
    const row = add(result.totals, true);
    row.border = { top: { style: 'thin' } };
  }
  result.columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    if (column.type === 'money') target.numFmt = INDIAN_MONEY;
    if (column.type === 'percent' || column.type === 'rate') target.numFmt = '0.##%';
    if (column.type === 'qty') target.numFmt = '#,##0.###';
    target.alignment = { horizontal: alignRight(column.type) ? 'right' : 'left' };
    const widest = Math.max(
      label(column.label).length,
      ...result.rows
        .slice(0, 200)
        .map((r) => formatCell(r[column.key], column, tr, settings).length),
    );
    target.width = Math.min(48, Math.max(11, widest + 2));
  });
  sheet.views = [{ state: 'frozen', ySplit: head.number }];
  result.notes.forEach((note) => {
    sheet.addRow([]);
    const row = sheet.addRow([label(note)]);
    row.font = { italic: true, color: { argb: 'FF64748B' } };
  });
  return book;
}
