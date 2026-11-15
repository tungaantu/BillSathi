import { formatDate } from './dates';
import { formatINR } from './money';
import type { Cell, ReportColumn } from './reports';
import type { Settings } from './types';

export type Translate = (key: string) => string | undefined;
/**
 * Text cells that name something translatable hold `key` or `key|fallback`. The fallback is shown
 * when the key has no translation (for example a category the owner typed in).
 */
export function translateValue(tr: Translate, value: string): string {
  const [key, fallback] = value.split('|');
  return tr(key) ?? (fallback !== undefined ? fallback : key);
}
const trimmed = (n: number) => String(Number(n.toFixed(3)));
/** Basis points as a percentage, e.g. 1800 becomes `18%` and 250 becomes `2.5%`. */
export const bpsText = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
/** A cell as plain text, the way it appears on screen, in print and in the PDF. */
export function formatCell(
  value: Cell | undefined,
  column: ReportColumn,
  tr: Translate,
  settings: Settings = {},
): string {
  if (value === 'reports.total') return tr('reports.total') ?? 'reports.total';
  if (value === null || value === undefined || value === '') return '';
  switch (column.type) {
    case 'money':
      return typeof value === 'number'
        ? formatINR(value, Number(settings.decimals ?? 2))
        : String(value);
    case 'qty':
      return typeof value === 'number' ? trimmed(value) : String(value);
    case 'int':
      return String(value);
    case 'percent':
    case 'rate':
      return typeof value === 'number' ? bpsText(value) : String(value);
    case 'date':
      return formatDate(String(value), settings);
    default:
      return column.translate ? translateValue(tr, String(value)) : String(value);
  }
}
