import en from '../../../renderer/i18n/en.json';
import hi from '../../../renderer/i18n/hi.json';
import * as safety from '../../../renderer/i18n/modules/safety';
import * as reports from '../../../renderer/i18n/modules/reports';
import * as inventory from '../../../renderer/i18n/modules/inventory';
import type { Translate } from '../../../shared/report-format';

type Dictionary = Record<string, string>;
const merged = (language: 'en' | 'hi'): Dictionary => ({
  ...(language === 'hi' ? hi : en),
  ...safety[language],
  ...reports[language],
  ...inventory[language],
});
/** Message lookup for exports and print, in the owner's language (falls back to English). */
export function translator(language: unknown): Translate {
  const lang = language === 'hi' ? 'hi' : 'en';
  const main = merged(lang),
    fallback = merged('en');
  return (key) => main[key] ?? fallback[key];
}
