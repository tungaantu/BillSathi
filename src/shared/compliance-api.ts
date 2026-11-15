import { z } from 'zod';
import type { Result } from './types';

/** Shared (renderer + main) types and small pure helpers for GST compliance exports. */

/** Consignment value (incl. tax) above which an e-way bill is normally required. */
export const EWB_THRESHOLD_PAISE = 5_000_000;

export type IssueSeverity = 'error' | 'warning';
/** Which screen can fix the problem. */
export type FixTarget = 'profile' | 'party' | 'item' | 'invoice' | null;
export interface ComplianceIssue {
  code: string;
  severity: IssueSeverity;
  fix: FixTarget;
  /** Values interpolated into the `compliance.issue.<code>` message. */
  params?: Record<string, string | number>;
}

export const TRANSPORT_MODES = ['road', 'rail', 'air', 'ship'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** Remove spaces/hyphens and upper-case, e.g. "ka 01-ab 1234" -> "KA01AB1234". */
export const normalizeVehicle = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
/**
 * Indian registration formats: standard (KA01AB1234, KA011234, KA1A1234) and Bharat series
 * (22BH1234AB). Empty is "valid" because Part-B can be added later on the portal.
 */
export function isValidVehicle(value: string): boolean {
  const v = normalizeVehicle(value);
  return (
    v === '' || /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(v) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(v)
  );
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const transportSchema = z.object({
  transporterId: z.string().trim().max(15),
  transporterName: z.string().trim().max(120),
  mode: z.enum(TRANSPORT_MODES),
  distanceKm: z.number().int().min(0).max(4000),
  vehicleNo: z.string().trim().max(20),
  vehicleType: z.enum(['regular', 'odc']),
  docNo: z.string().trim().max(15),
  docDate: z.union([isoDate, z.literal('')]),
});
export type Transport = z.infer<typeof transportSchema>;
export const blankTransport = (): Transport => ({
  transporterId: '',
  transporterName: '',
  mode: 'road',
  distanceKm: 0,
  vehicleNo: '',
  vehicleType: 'regular',
  docNo: '',
  docDate: '',
});

export const EINVOICE_SUPPLY_TYPES = ['B2B', 'SEZWP', 'SEZWOP'] as const;
export type EinvoiceSupplyType = (typeof EINVOICE_SUPPLY_TYPES)[number];
export const einvoiceOptionsSchema = z.object({ supplyType: z.enum(EINVOICE_SUPPLY_TYPES) });
export type EinvoiceOptions = z.infer<typeof einvoiceOptionsSchema>;

/** Details pasted back from the IRP portal after the JSON was uploaded. */
export const einvoiceAckSchema = z.object({
  irn: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/),
  ackNo: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/),
  /** yyyy-mm-dd or dd/mm/yyyy, optionally followed by a time. */
  ackDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})([ T]\d{2}:\d{2}(:\d{2})?)?$/),
  signedQr: z.string().trim().max(8000),
});
export type EinvoiceAck = z.infer<typeof einvoiceAckSchema>;

export const ewbNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/);

/** Compliance data stored with an invoice (transactions.metadata.compliance). */
export interface ComplianceRecord {
  ewbNo?: string;
  transport?: Transport;
  einvoice?: EinvoiceAck;
  supplyType?: EinvoiceSupplyType;
}

export interface CheckResult {
  issues: ComplianceIssue[];
  /** Headline numbers, in paise, for the confirmation summary. */
  summary: { total: number; taxable: number; tax: number; items: number };
  record: ComplianceRecord;
}
export interface SaveResult extends CheckResult {
  path: string | null;
}
export interface BulkEwayResult {
  path: string | null;
  included: number;
  skipped: { id: number; label: string; issues: ComplianceIssue[] }[];
  warnings: { id: number; label: string; issues: ComplianceIssue[] }[];
}

export const TALLY_VOUCHER_KINDS = [
  'sale',
  'purchase',
  'sale_return',
  'purchase_return',
  'payment_in',
  'payment_out',
] as const;
export type TallyVoucherKind = (typeof TALLY_VOUCHER_KINDS)[number];
export const TALLY_VOUCHER_NAMES: Record<TallyVoucherKind, string> = {
  sale: 'Sales',
  purchase: 'Purchase',
  sale_return: 'Credit Note',
  purchase_return: 'Debit Note',
  payment_in: 'Receipt',
  payment_out: 'Payment',
};

export const tallyLedgerNamesSchema = z.object({
  sales: z.string().trim().min(1).max(100),
  purchase: z.string().trim().min(1).max(100),
  outputCgst: z.string().trim().min(1).max(100),
  outputSgst: z.string().trim().min(1).max(100),
  outputIgst: z.string().trim().min(1).max(100),
  outputCess: z.string().trim().min(1).max(100),
  inputCgst: z.string().trim().min(1).max(100),
  inputSgst: z.string().trim().min(1).max(100),
  inputIgst: z.string().trim().min(1).max(100),
  inputCess: z.string().trim().min(1).max(100),
  roundOff: z.string().trim().min(1).max(100),
  discount: z.string().trim().min(1).max(100),
  cash: z.string().trim().min(1).max(100),
});
export type TallyLedgerNames = z.infer<typeof tallyLedgerNamesSchema>;
export const DEFAULT_TALLY_LEDGERS: TallyLedgerNames = {
  sales: 'Sales',
  purchase: 'Purchase',
  outputCgst: 'Output CGST',
  outputSgst: 'Output SGST',
  outputIgst: 'Output IGST',
  outputCess: 'Output Cess',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  inputCess: 'Input Cess',
  roundOff: 'Round Off',
  discount: 'Discount Allowed',
  cash: 'Cash',
};

export const tallyOptionsSchema = z.object({
  from: isoDate,
  to: isoDate,
  masters: z.boolean(),
  vouchers: z.boolean(),
  voucherKinds: z.array(z.enum(TALLY_VOUCHER_KINDS)).max(6),
  openingBalances: z.boolean(),
  companyName: z.string().trim().min(1).max(200),
  ledgers: tallyLedgerNamesSchema,
});
export type TallyOptions = z.infer<typeof tallyOptionsSchema>;
export interface TallyCounts {
  ledgers: number;
  stockItems: number;
  units: number;
  vouchers: number;
  warnings: { code: string; count: number }[];
}
export interface TallySaveResult extends TallyCounts {
  paths: string[];
}

export interface ComplianceApi {
  record(firm: number, id: number): Promise<Result<ComplianceRecord>>;
  ewayCheck(firm: number, id: number, transport: Transport): Promise<Result<CheckResult>>;
  ewaySave(firm: number, id: number, transport: Transport): Promise<Result<SaveResult>>;
  ewaySaveNumber(firm: number, id: number, ewbNo: string): Promise<Result<ComplianceRecord>>;
  ewayBulk(
    firm: number,
    from: string,
    to: string,
    transport: Transport,
  ): Promise<Result<BulkEwayResult>>;
  einvoiceCheck(firm: number, id: number, options: EinvoiceOptions): Promise<Result<CheckResult>>;
  einvoiceSave(firm: number, id: number, options: EinvoiceOptions): Promise<Result<SaveResult>>;
  einvoiceSaveAck(
    firm: number,
    id: number,
    ack: EinvoiceAck | null,
  ): Promise<Result<ComplianceRecord>>;
  tallyCount(firm: number, options: TallyOptions): Promise<Result<TallyCounts>>;
  tallySave(firm: number, options: TallyOptions): Promise<Result<TallySaveResult | null>>;
}
