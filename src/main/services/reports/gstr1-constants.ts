/**
 * Assumptions behind the GSTR-1 and GSTR-3B exports, kept in one place so they are easy to review
 * and to update when the GST rules change. Nothing here is tax advice: check the file on the GST
 * portal (offline tool) before filing.
 */

/** JSON schema version written to the file. The GST offline tool accepts files of its own version family. */
export const GSTR1_JSON_VERSION = 'GST3.2.2';

/**
 * B2C Large: an unregistered buyer, supply to another state, and an invoice value above the limit.
 * The limit was Rs 2,50,000 and was lowered to Rs 1,00,000 for invoices from 1 August 2024.
 * ASSUMPTION: this date and amount are taken from the CBIC notification and should be re-checked
 * before each filing season. Amounts are in paise.
 */
export const B2CL_LIMIT_CHANGE_DATE = '2024-08-01';
export const B2CL_LIMIT_BEFORE = 250_000_00;
export const B2CL_LIMIT_FROM = 100_000_00;
export const b2clLimit = (invoiceDate: string) =>
  invoiceDate >= B2CL_LIMIT_CHANGE_DATE ? B2CL_LIMIT_FROM : B2CL_LIMIT_BEFORE;

/** Invoice and note numbers: at most 16 characters, letters, digits, slash and hyphen only. */
export const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9/-]{1,16}$/;
/** HSN codes must be 4, 6 or 8 digits (services use 6-digit SAC codes starting with 99). */
export const HSN_PATTERN = /^\d{4}(\d{2}(\d{2})?)?$/;
/** GST rates in basis points that exist on the rate chart (0%, 0.1%, 0.25%, 1%, 1.5%, 3%, 5%, 6%, 7.5%, 12%, 18%, 28%). */
export const VALID_RATES_BPS = [0, 10, 25, 100, 150, 300, 500, 600, 750, 1200, 1800, 2800, 4000];

/** "Nature of document" codes of the document-issued table. */
export const DOC_NATURE = {
  invoice: { code: 1, name: 'Invoices for outward supply' },
  creditNote: { code: 5, name: 'Credit Note' },
} as const;

/**
 * Unit quantity codes (UQC) of the GST system, keyed by the symbols BillSathi uses for units.
 * Any unit not listed is reported as OTH (Others).
 */
export const UQC_BY_SYMBOL: Record<string, string> = {
  Bag: 'BAG',
  Btl: 'BTL',
  Box: 'BOX',
  Bdl: 'BDL',
  Can: 'CAN',
  Ctn: 'CTN',
  Mtq: 'CBM',
  Dzn: 'DOZ',
  Gm: 'GMS',
  Kg: 'KGS',
  Kmt: 'KME',
  Ltr: 'LTR',
  Mtr: 'MTR',
  Ml: 'MLT',
  Nos: 'NOS',
  Pac: 'PAC',
  Prs: 'PRS',
  Pcs: 'PCS',
  Qtl: 'QTL',
  Rol: 'ROL',
  Set: 'SET',
  Sqf: 'SQF',
  Sqm: 'SQM',
  Sqy: 'SQY',
  Tbs: 'TBS',
  Ton: 'TON',
  Unit: 'UNT',
};
export const uqc = (symbol: string) => UQC_BY_SYMBOL[symbol] ?? 'OTH';

/** Place of supply in the Excel sheets reads "29-Karnataka"; the JSON uses only the two-digit code. */
export const GSTR1_SHEETS = ['b2b', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'hsn', 'docs'] as const;

/** Written on the GSTR-1 screen: what the export does not cover. */
export const GSTR1_NOT_COVERED = [
  'Exports, SEZ supplies and supplies through e-commerce operators',
  'Nil-rated, exempt and non-GST supplies table (table 8)',
  'Advances received and adjusted (tables 11A/11B)',
  'Amendments to earlier periods',
  'Debit notes issued to customers (BillSathi has no customer debit note)',
] as const;
