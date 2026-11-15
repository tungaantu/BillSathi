import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
type Messages = Record<string, unknown>;
/** Per-feature string modules (`./modules/*.ts`, each exporting `en` and `hi`) are merged in. */
const modules = import.meta.glob<{ en: Messages; hi: Messages }>(
  ['./modules/*.ts', '!./modules/*.test.ts'],
  {
    eager: true,
  },
);
function deepMerge(target: Messages, source: Messages): Messages {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    target[key] =
      value && typeof value === 'object' && current && typeof current === 'object'
        ? deepMerge({ ...(current as Messages) }, value as Messages)
        : value;
  }
  return target;
}
const merge = (base: Messages, language: 'en' | 'hi') =>
  Object.values(modules).reduce((all, m) => deepMerge(all, m[language]), { ...base });
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: merge(en, 'en') },
    hi: { translation: merge(hi, 'hi') },
  },
  lng: 'en',
  fallbackLng: 'en',
  keySeparator: false,
  interpolation: { escapeValue: false },
});
export default i18n;
