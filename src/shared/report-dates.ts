/** Date presets for report filters. All dates are ISO `YYYY-MM-DD`; the financial year starts on 1 April. */
export const DATE_PRESETS = [
  'today',
  'week',
  'month',
  'lastMonth',
  'quarter',
  'fy',
  'lastFy',
  'custom',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export interface DateRange {
  from: string;
  to: string;
}
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function parts(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return { y, m, d };
}
export function addDays(value: string, days: number): string {
  const { y, m, d } = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from),
    b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
/** Start year of the financial year containing `value` (April to March). */
export const fyStartYear = (value: string) => {
  const { y, m } = parts(value);
  return m >= 4 ? y : y - 1;
};
export function fyRange(startYear: number): DateRange {
  return { from: iso(startYear, 4, 1), to: iso(startYear + 1, 3, 31) };
}
/** Resolves a preset against `today`. `custom` keeps the current month so the pickers have a start. */
export function resolvePreset(preset: DatePreset, today: string): DateRange {
  const { y, m } = parts(today);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      // Weeks run Monday to Sunday.
      const { y: yy, m: mm, d: dd } = parts(today);
      const weekday = (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7;
      const from = addDays(today, -weekday);
      return { from, to: addDays(from, 6) };
    }
    case 'lastMonth': {
      const ly = m === 1 ? y - 1 : y,
        lm = m === 1 ? 12 : m - 1;
      return { from: iso(ly, lm, 1), to: iso(ly, lm, daysIn(ly, lm)) };
    }
    case 'quarter': {
      const start = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, start, 1), to: iso(y, start + 2, daysIn(y, start + 2)) };
    }
    case 'fy':
      return fyRange(fyStartYear(today));
    case 'lastFy':
      return fyRange(fyStartYear(today) - 1);
    default:
      return { from: iso(y, m, 1), to: iso(y, m, daysIn(y, m)) };
  }
}
/** Tax period `MMYYYY` of the month that holds `from` (GSTR-1 / GSTR-3B filing period). */
export const taxPeriod = (from: string) => {
  const { y, m } = parts(from);
  return `${pad(m)}${y}`;
};
/** `dd-mm-yyyy`, the date format of the GST offline tool JSON. */
export const gstDate = (value: string) => {
  const { y, m, d } = parts(value);
  return `${pad(d)}-${pad(m)}-${y}`;
};
