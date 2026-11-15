import type { Settings } from './types';
export const THEMES = [
  'classic',
  'modern',
  'minimal',
  'bold',
  'compact',
  'elegant',
  'thermal58',
  'thermal80',
] as const;
export const PRINT_DEFAULTS: Settings = {
  printTheme: 'classic',
  printAccent: '#2563EB',
  printPaper: 'A4',
  printOrientation: 'portrait',
  printFont: 10,
  printCopies: 1,
  printMinRows: 5,
  printHeader: true,
  printRepeatHeader: true,
  printLogo: true,
  printAddress: true,
  printGstin: true,
  printHsn: true,
  printQty: true,
  printUnit: true,
  printPrice: true,
  printDiscount: true,
  printTax: true,
  printTaxSummary: true,
  printWords: true,
  printReceived: true,
  printPartyBalance: false,
  printSavings: true,
  printDescription: true,
  printTerms: true,
  printQr: true,
  printReceivedBy: false,
  printDeliveredBy: false,
  printTitle: '',
  printTopSpace: 0,
  printTotalQty: true,
  printAcknowledgement: false,
};
export const PRINT_SWITCHES = [
  'printRepeatHeader',
  'printHeader',
  'printLogo',
  'printAddress',
  'printGstin',
  'printHsn',
  'printQty',
  'printUnit',
  'printPrice',
  'printDiscount',
  'printTax',
  'printTaxSummary',
  'printWords',
  'printReceived',
  'printPartyBalance',
  'printSavings',
  'printDescription',
  'printTerms',
  'printBank',
  'printQr',
  'printSignature',
  'printReceivedBy',
  'printDeliveredBy',
  'printTotalQty',
  'printAcknowledgement',
];
export const TRANSACTION_DEFAULTS: Settings = {
  cashDefault: false,
  freeQty: false,
  defaultTerms: '',
  roundMode: 'nearest',
  roundStep: 100,
  'prefix.sale': 'INV-',
  'prefix.sale_return': 'CN-',
  'prefix.estimate': 'EST-',
  'prefix.sale_order': 'SO-',
  'prefix.payment_in': 'RCPT-',
  shareMessage: '',
};
export function validSalesSetting(key: string, value: unknown): boolean | null {
  if (PRINT_SWITCHES.includes(key)) return typeof value === 'boolean';
  if (key === 'printTheme') return THEMES.includes(value as (typeof THEMES)[number]);
  if (key === 'printAccent') return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (key === 'printPaper') return ['A4', 'A5'].includes(String(value));
  if (key === 'printOrientation') return ['portrait', 'landscape'].includes(String(value));
  if (key === 'roundMode') return ['nearest', 'up', 'down', 'off'].includes(String(value));
  if (key === 'roundStep') return [100, 50, 10].includes(Number(value));
  const ranges: Record<string, [number, number]> = {
    printFont: [8, 18],
    printCopies: [1, 3],
    printMinRows: [0, 40],
    printTopSpace: [0, 50],
  };
  if (ranges[key])
    return (
      Number.isInteger(value) && Number(value) >= ranges[key][0] && Number(value) <= ranges[key][1]
    );
  if (key === 'cashDefault' || key === 'freeQty') return typeof value === 'boolean';
  if (
    key === 'defaultTerms' ||
    key === 'shareMessage' ||
    key === 'printTitle' ||
    (key.startsWith('prefix.') && Object.hasOwn(TRANSACTION_DEFAULTS, key))
  )
    return (
      typeof value === 'string' &&
      value.length <=
        (key === 'defaultTerms'
          ? 8000
          : key === 'shareMessage'
            ? 1000
            : key === 'printTitle'
              ? 80
              : 30)
    );
  return null;
}
