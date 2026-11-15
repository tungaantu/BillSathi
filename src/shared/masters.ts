import { z } from 'zod';
import { STATES } from './constants';
import { extractGSTIN, formatGSTIN, validateGSTIN } from './gstin';
import { assertPaise, decimalScaled, divideRound, safeNumber, sumPaise } from './money';

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const quantity = z
  .number()
  .finite()
  .min(0)
  .max(1e9)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.000001);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const ref = z.number().int().positive().nullable();
const custom = z.record(z.string().regex(/^[1-4]$/), z.string().max(500));
export const partySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(/^\d{10}$|^$/),
    email: z.string().refine((v) => !v || z.email().safeParse(v).success),
    gstType: z.enum(['consumer', 'regular', 'composition']),
    gstin: z
      .string()
      .transform(formatGSTIN)
      .refine((v) => !v || validateGSTIN(v)),
    stateCode: z.string().refine((v) => !v || STATES.some((s) => s.code === v)),
    billingAddress: z.string().max(2000),
    shippingAddress: z.string().max(2000),
    openingBalance: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    openingDate: date,
    creditLimit: money.nullable(),
    groupId: ref,
    customFields: custom,
    active: z.boolean(),
  })
  .transform((v) => ({ ...v, stateCode: extractGSTIN(v.gstin)?.stateCode ?? v.stateCode }));
export type PartyInput = z.infer<typeof partySchema>;
export interface Party extends PartyInput {
  id: number;
  firmId: number;
  balance: number;
}
export const itemSchema = z
  .object({
    serviceReminderDays: z.number().int().min(0).max(36500).default(0),
    trackBatches: z.boolean().default(false),
    trackSerials: z.boolean().default(false),
    name: z.string().trim().min(1).max(160),
    type: z.enum(['product', 'service']),
    code: z.string().trim().max(80),
    hsn: z.string().regex(/^\d{4,8}$|^$/),
    categoryId: ref,
    unitId: ref,
    secondaryUnitId: ref,
    conversion: z.number().finite().positive().max(1e6),
    taxRateId: ref,
    salePrice: money,
    purchasePrice: money,
    wholesalePrice: money,
    mrp: money,
    inclusive: z.boolean(),
    purchaseInclusive: z.boolean(),
    discountBps: z.number().int().min(0).max(10000),
    discountAmount: money,
    discountType: z.enum(['percent', 'amount']),
    wholesaleQty: quantity,
    openingQty: quantity,
    openingPrice: money,
    openingDate: date,
    minStock: quantity,
    location: z.string().max(200),
    image: z
      .string()
      .max(3e6)
      .nullable()
      .refine((v) => !v || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)),
    customFields: custom,
  })
  .refine((v) => !v.secondaryUnitId || (v.unitId && v.secondaryUnitId !== v.unitId), {
    path: ['secondaryUnitId'],
  })
  .refine((v) => v.type !== 'service' || v.openingQty === 0, { path: ['openingQty'] });
export type ItemInput = z.infer<typeof itemSchema>;
/** One row of Utilities → Bulk update items: only the fields that changed. */
export const itemPatchSchema = z
  .object({
    id: z.number().int().positive(),
    salePrice: money.optional(),
    purchasePrice: money.optional(),
    mrp: money.optional(),
    wholesalePrice: money.optional(),
    taxRateId: ref.optional(),
    hsn: z
      .string()
      .regex(/^\d{4,8}$|^$/)
      .optional(),
    minStock: quantity.optional(),
    categoryId: ref.optional(),
  })
  .strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;
export interface Item extends ItemInput {
  cessBps?: number;
  barcode?: string | null;
  id: number;
  firmId: number;
  qty: number;
  value: number;
}
export interface Named {
  id: number;
  name: string;
  count: number;
}
export interface Unit {
  id: number;
  name: string;
  symbol: string;
  standard: boolean;
}
export interface Conversion {
  id: number;
  fromUnit: number;
  toUnit: number;
  factor: number;
}
export interface Lookups {
  groups: Named[];
  categories: Named[];
  units: Unit[];
  conversions: Conversion[];
  taxes: { id: number; name: string; rateBps: number }[];
}
export type LookupKind = 'groups' | 'categories' | 'units';
export interface Movement {
  id: number;
  date: string;
  qty: number;
  value: number;
  reason: string | null;
}
export interface LedgerRow {
  id: number;
  date: string;
  type: string;
  number: string;
  total: number;
  change: number;
  balance: number;
}
export const adjustmentSchema = z.object({
  direction: z.enum(['add', 'reduce']),
  qty: quantity.refine((v) => v > 0),
  price: money,
  date,
  reason: z.string().trim().min(1).max(500),
  unitId: ref,
});
export type Adjustment = z.infer<typeof adjustmentSchema>;
export function blankParty(stateCode = ''): PartyInput {
  return {
    name: '',
    phone: '',
    email: '',
    gstType: 'consumer',
    gstin: '',
    stateCode,
    billingAddress: '',
    shippingAddress: '',
    openingBalance: 0,
    openingDate: today(),
    creditLimit: null,
    groupId: null,
    customFields: {},
    active: true,
  };
}
export function blankItem(): ItemInput {
  return {
    serviceReminderDays: 0,
    trackBatches: false,
    trackSerials: false,
    name: '',
    type: 'product',
    code: '',
    hsn: '',
    categoryId: null,
    unitId: null,
    secondaryUnitId: null,
    conversion: 1,
    taxRateId: null,
    salePrice: 0,
    purchasePrice: 0,
    wholesalePrice: 0,
    mrp: 0,
    inclusive: false,
    purchaseInclusive: false,
    discountBps: 0,
    discountAmount: 0,
    discountType: 'percent',
    wholesaleQty: 0,
    openingQty: 0,
    openingPrice: 0,
    openingDate: today(),
    minStock: 0,
    location: '',
    image: null,
    customFields: {},
  };
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function stockAmount(qty: number, price: number) {
  return safeNumber(divideRound(decimalScaled(qty, 3) * BigInt(assertPaise(price)), 1000n));
}
export function baseQuantity(qty: number, factor = 1): number {
  const scaled = decimalScaled(qty, 3) * decimalScaled(factor, 6);
  if (scaled % 1000000n) throw new Error('validation');
  return quantity.parse(Number(scaled / 1000000n) / 1000);
}
export function stockBalance(rows: Pick<Movement, 'qty' | 'value'>[]) {
  return {
    qty: Number(rows.reduce((n, r) => n + decimalScaled(r.qty, 3), 0n)) / 1000,
    value: sumPaise(rows.map((r) => r.value)),
  };
}
export function partyLedger(
  opening: number,
  openingDate: string,
  rows: Omit<LedgerRow, 'balance'>[],
  from = '',
  to = '9999-12-31',
): LedgerRow[] {
  let balance = 0;
  return [
    { id: 0, date: openingDate, type: 'opening', number: '', total: opening, change: opening },
    ...rows,
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((row) => ({ ...row, balance: (balance = sumPaise([balance, row.change])) }))
    .filter((row) => row.date >= from && row.date <= to);
}
