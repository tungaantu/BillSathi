import { today } from '../../../shared/masters';

/** First day (1 April) of the Indian financial year that contains `on`. */
export function financialYearStart(on = today()): string {
  const year = Number(on.slice(0, 4)),
    month = Number(on.slice(5, 7));
  return `${month >= 4 ? year : year - 1}-04-01`;
}
