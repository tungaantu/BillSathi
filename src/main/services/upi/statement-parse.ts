/** Reads a bank statement (already split into rows of text cells) into typed lines. Pure. */
import { extractUtrs } from '../../../shared/upi-utils';

import type { StatementLine, StatementMapping } from '../../../shared/payments-api';
export type { StatementLine, StatementMapping };
export interface StatementSheet {
  headers: string[];
  rows: string[][];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}
const fullYear = (value: string) =>
  value.length === 2 ? (Number(value) < 70 ? 2000 : 1900) + Number(value) : Number(value);

/** Understands the date styles Indian banks use. Returns YYYY-MM-DD or null. */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s.*)?$/.exec(text);
  if (m) return validDate(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[ /-]([a-zA-Z]{3})[a-z]*[ ,/-]+(\d{4}|\d{2})(?:\s.*)?$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? validDate(fullYear(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/** "1,23,456.78", "₹ 500", "250.00 Cr" to paise. Blank, "-" and zero give 0; junk gives null. */
export function parseStatementAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '').replace(/(cr|dr)\.?$/i, '');
  if (cleaned === '' || cleaned === '-') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

const key = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function classify(header: string): keyof StatementMapping | 'valueDate' | null {
  const h = key(header);
  if (!h) return null;
  if (/^(value (date|dt)|posting date)/.test(h)) return 'valueDate';
  if (h === 'date' || /^(txn|tran|transaction|trans) date/.test(h)) return 'date';
  if (/(narration|description|particular|remark|details)/.test(h)) return 'narration';
  if (/(withdrawal|debit)/.test(h)) return 'debit';
  if (/(deposit|credit)/.test(h)) return 'credit';
  if (/(utr|reference|chq|ref no|ref num|cheque)/.test(h)) return 'utr';
  return null;
}

/** Suggests a mapping from header names; null when no date, narration and credit column is found. */
export function suggestMapping(headers: string[]): StatementMapping | null {
  const found: Record<string, number> = {};
  headers.forEach((header, index) => {
    const kind = classify(header);
    if (kind && found[kind] === undefined) found[kind] = index;
  });
  const date = found.date ?? found.valueDate;
  if (date === undefined || found.narration === undefined || found.credit === undefined)
    return null;
  return {
    date,
    narration: found.narration,
    credit: found.credit,
    debit: found.debit ?? -1,
    utr: found.utr ?? -1,
  };
}

/** Finds the header row in the first lines (banks put account details above it). */
export function detectSheet(
  table: string[][],
): { sheet: StatementSheet; mapping: StatementMapping | null } | null {
  const limit = Math.min(table.length, 40);
  for (let i = 0; i < limit; i++) {
    const mapping = suggestMapping(table[i]);
    if (mapping)
      return {
        sheet: {
          headers: table[i],
          rows: table.slice(i + 1).filter((r) => r.some((c) => c.trim())),
        },
        mapping,
      };
  }
  const first = table.findIndex((r) => r.filter((c) => c.trim()).length >= 3);
  return first < 0
    ? null
    : {
        sheet: {
          headers: table[first],
          rows: table.slice(first + 1).filter((r) => r.some((c) => c.trim())),
        },
        mapping: null,
      };
}

/** Turns sheet rows into lines. Rows without a readable date are skipped (opening balance, totals). */
export function parseLines(sheet: StatementSheet, mapping: StatementMapping): StatementLine[] {
  const cell = (row: string[], at: number) => (at >= 0 ? (row[at] ?? '').trim() : '');
  const lines: StatementLine[] = [];
  sheet.rows.forEach((row, index) => {
    const date = parseStatementDate(cell(row, mapping.date));
    const credit = parseStatementAmount(cell(row, mapping.credit));
    const debit = parseStatementAmount(cell(row, mapping.debit));
    if (!date || credit === null || debit === null || (credit === 0 && debit === 0)) return;
    const description = cell(row, mapping.narration);
    lines.push({
      index,
      date,
      description,
      creditPaise: credit,
      debitPaise: debit,
      utrs: extractUtrs(cell(row, mapping.utr), description),
    });
  });
  return lines;
}

/** CSV in the layout YouPI-PG's importer accepts (HDFC style headers, DD/MM/YYYY). */
export function toYoupiCsv(lines: StatementLine[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rupees = (paise: number) => (paise ? `${Math.floor(paise / 100)}.${pad(paise % 100)}` : '');
  const rows = lines.map((l) => {
    const [y, m, d] = l.date.split('-');
    return [
      `${d}/${m}/${y}`,
      quote(l.description),
      quote(l.utrs[0] ?? ''),
      rupees(l.debitPaise),
      rupees(l.creditPaise),
    ].join(',');
  });
  return ['Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.', ...rows].join('\n');
}

/** Minimal RFC 4180 CSV reader (quoted cells, doubled quotes, CRLF). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}
