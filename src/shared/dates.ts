import type { Settings } from './types';
export const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD MMM YYYY'] as const;
export function formatDate(iso: string | null | undefined, settings: Settings = {}) {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return '';
  const style = settings.dateFormat ?? DATE_FORMATS[0];
  if (style === 'DD MMM YYYY') {
    const name = new Intl.DateTimeFormat(settings.language === 'hi' ? 'hi-IN' : 'en-IN', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${year}-${month}-${day}T12:00:00Z`));
    return `${day} ${name} ${year}`;
  }
  return [day, month, year].join(style === 'DD-MM-YYYY' ? '-' : '/');
}
export function parseDate(value: string, settings: Settings = {}) {
  const text = value.trim();
  if (!text) return '';
  let iso = text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split(/[\s/-]+/);
    let month = parts[1];
    if (month && !/^\d+$/.test(month)) {
      const months = Array.from(
        { length: 12 },
        (_, i) =>
          formatDate(`2026-${String(i + 1).padStart(2, '0')}-01`, {
            ...settings,
            dateFormat: 'DD MMM YYYY',
          }).split(' ')[1],
      );
      const index = months.findIndex((m) => m.toLowerCase() === month.toLowerCase());
      if (index < 0) throw new Error('validation');
      month = String(index + 1);
    }
    iso = `${parts[2]}-${month?.padStart(2, '0')}-${parts[0]?.padStart(2, '0')}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    Number.isNaN(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new Error('validation');
  return iso;
}
