import type { Settings } from './types';
import { DATE_FORMATS } from './dates';
import { PRINT_DEFAULTS, TRANSACTION_DEFAULTS, validSalesSetting } from './print-settings';
export const DEFAULT_SETTINGS: Settings = {
  ...PRINT_DEFAULTS,
  ...TRANSACTION_DEFAULTS,
  partyRates: false,
  rememberPartyPrice: false,
  challanStock: true,
  challanReturns: false,
  challanAmount: false,
  loyalty: false,
  loyaltyEarnPoints: 1,
  loyaltyPerPaise: 10000,
  loyaltyValuePaise: 100,
  loyaltyBasis: 'total',
  remindDays: 0,
  decimals: 2,
  dateFormat: 'DD/MM/YYYY',
  updatePurchasePrice: false,
  updateSalePrice: false,
  negativeStock: true,
  zoom: 100,
  theme: 'light',
  language: 'en',
  estimate: true,
  proforma: false,
  orders: false,
  challan: false,
  otherIncome: false,
  invoicePreview: true,
  dueDates: true,
  roundOff: true,
  printBank: true,
  printSignature: true,
  gst: true,
  hsn: true,
  reverseCharge: false,
  messages: false,
  reminders: false,
  partyGroups: false,
  partyStatus: true,
  itemTax: true,
  itemDiscount: true,
  wholesale: true,
  mrp: true,
  qtyDecimals: 3,
  shippingAddress: true,
  stock: true,
  barcode: false,
  batches: false,
  serials: false,
  godowns: false,
  posAutoPrint: false,
  booksClosedThrough: '',
  fyResetNumbers: false,
  autoBackup: false,
  auditTrail: true,
  backupReminder: true,
};
export function categoryPresets(category: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    stock: category !== 'services',
    batches: category === 'pharmacy',
    serials: category === 'electronics',
    barcode: ['grocery', 'pharmacy', 'books', 'garments'].includes(category),
    orders: ['hardware', 'auto'].includes(category),
    challan: category === 'hardware',
  };
}
export function validSetting(key: string, value: unknown): boolean {
  if (
    /^message\.(sale|purchase|sale_return|purchase_return|payment_in|payment_out|estimate|proforma|sale_order|purchase_order|delivery_challan|challan_return|cancelled|reminder|service)$/.test(
      key,
    )
  )
    return typeof value === 'string' && value.length <= 4000;
  if (['loyaltyEarnPoints', 'loyaltyPerPaise', 'loyaltyValuePaise', 'remindDays'].includes(key))
    return (
      Number.isSafeInteger(value) &&
      Number(value) >= (key === 'loyaltyPerPaise' ? 1 : 0) &&
      Number(value) <= (key === 'remindDays' ? 365 : 100000000)
    );
  if (key === 'loyaltyBasis') return value === 'total' || value === 'paid';
  if (key === 'dateFormat') return DATE_FORMATS.includes(value as (typeof DATE_FORMATS)[number]);
  const salesSetting = validSalesSetting(key, value);
  if (salesSetting !== null) return salesSetting;
  if (/^(party|item)Custom[1-4](Name|Type|Print)$/.test(key)) {
    return key.endsWith('Print')
      ? typeof value === 'boolean'
      : key.endsWith('Type')
        ? value === 'text' || value === 'date'
        : typeof value === 'string' && value.length <= 80;
  }
  if (/^(tour|banner)\.[\w/-]{1,100}$/.test(key)) return typeof value === 'boolean';
  // Report favourites and recently opened reports: comma-separated report ids.
  if (/^reports\.(favourites|recent)$/.test(key))
    return typeof value === 'string' && /^[A-Za-z0-9,]{0,600}$/.test(value);
  // Only Close financial year may move the lock date (never the generic settings screen).
  if (key === 'booksClosedThrough') return false;
  if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return false;
  if (key === 'decimals') return [0, 1, 2].includes(value as number);
  if (key === 'qtyDecimals') return [0, 1, 2, 3].includes(value as number);
  if (key === 'zoom') return Number.isInteger(value) && Number(value) >= 80 && Number(value) <= 130;
  if (key === 'theme') return value === 'light' || value === 'dark';
  if (key === 'language') return value === 'en' || value === 'hi';
  return typeof value === 'boolean';
}
