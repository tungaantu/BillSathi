import { z } from 'zod';
import { calculateInvoice, type Discount } from './gst-calc';
import { baseQuantity, date, quantity, stockAmount, today, type Item } from './masters';
import { assertPaise, decimalScaled, sumPaise } from './money';
import type { Settings } from './types';
import { STATES } from './constants';
import { batchInputSchema } from './inventory';
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ref = z.number().int().positive().nullable();
export const documentType = z.enum([
  'sale',
  'sale_return',
  'estimate',
  'sale_order',
  'delivery_challan',
  'challan_return',
  'proforma',
  'purchase',
  'purchase_return',
  'purchase_order',
  'expense',
  'other_income',
]);
export type DocumentType = z.infer<typeof documentType>;
export const DOCUMENT_CONFIG: Record<
  DocumentType,
  { stockSign: -1 | 0 | 1; price: 'sale' | 'purchase'; payments: 'receive' | 'pay' | 'none' }
> = {
  sale: { stockSign: -1, price: 'sale', payments: 'receive' },
  sale_return: { stockSign: 1, price: 'sale', payments: 'pay' },
  estimate: { stockSign: 0, price: 'sale', payments: 'none' },
  sale_order: { stockSign: 0, price: 'sale', payments: 'receive' },
  delivery_challan: { stockSign: -1, price: 'sale', payments: 'none' },
  challan_return: { stockSign: 1, price: 'sale', payments: 'none' },
  proforma: { stockSign: 0, price: 'sale', payments: 'none' },
  purchase: { stockSign: 1, price: 'purchase', payments: 'pay' },
  purchase_return: { stockSign: -1, price: 'purchase', payments: 'receive' },
  purchase_order: { stockSign: 0, price: 'purchase', payments: 'none' },
  expense: { stockSign: 0, price: 'purchase', payments: 'pay' },
  other_income: { stockSign: 0, price: 'sale', payments: 'receive' },
};
export const lineSchema = z.object({
  itemId: ref,
  name: z.string().trim().min(1).max(160),
  hsn: z.string().max(12),
  qty: quantity.refine((v) => v > 0),
  freeQty: quantity,
  unitId: ref,
  price: money,
  inclusive: z.boolean(),
  discountBps: z.number().int().min(0).max(10000),
  discountAmount: money,
  taxBps: z.number().int().min(0).max(10000),
  cessBps: z.number().int().min(0).max(10000),
  /** Batch-tracked items: chosen batch when selling (null = automatic FEFO). */
  batchId: z.number().int().positive().nullable().optional(),
  /** Batch-tracked items: batch received on a purchase (created or updated on save). */
  batch: batchInputSchema.nullable().optional(),
  /** Serial/IMEI-tracked items: one serial per unit. */
  serials: z.array(z.string().trim().min(1).max(60)).max(5000).optional(),
});
export type SaleLine = z.infer<typeof lineSchema>;
export const blankLine = (): SaleLine => ({
  itemId: null,
  name: '',
  hsn: '',
  qty: 1,
  freeQty: 0,
  unitId: null,
  price: 0,
  inclusive: false,
  discountBps: 0,
  discountAmount: 0,
  taxBps: 0,
  cessBps: 0,
});
export const documentSchema = z
  .object({
    type: documentType,
    loyaltyRedeem: z.number().int().nonnegative().default(0),
    loyaltyDiscount: money.default(0),
    supplierBillNo: z.string().max(120).default(''),
    supplierBillDate: z.union([date, z.literal('')]).default(''),
    itcEligible: z.boolean().default(true),
    categoryId: ref.default(null),
    /** Godown the goods leave from / arrive at (null = main store). */
    godownId: ref.default(null),
    expenseMode: z.enum(['simple', 'itemised']).default('itemised'),
    partyId: ref,
    cash: z.boolean(),
    partyName: z.string().max(120),
    phone: z.string().regex(/^\d{10}$|^$/),
    billingAddress: z.string().max(2000),
    shippingAddress: z.string().max(2000),
    prefix: z.string().trim().max(30),
    number: z.number().int().positive().max(1e9),
    date,
    dueDate: z.union([date, z.literal('')]),
    paymentTerms: z.number().int().min(0).max(3650),
    placeOfSupply: z.string().refine((v) => STATES.some((s) => s.code === v)),
    refTxnId: ref,
    lines: z.array(lineSchema).min(1).max(500),
    charges: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          amount: money,
          taxBps: z.number().int().min(0).max(10000),
        }),
      )
      .max(30),
    discount: money,
    discountBps: z.number().int().min(0).max(10000),
    roundMode: z.enum(['off', 'nearest', 'up', 'down']),
    roundStep: z.union([z.literal(100), z.literal(50), z.literal(10)]),
    description: z.string().max(4000),
    terms: z.string().max(8000),
    payments: z
      .array(
        z.object({
          accountId: z.number().int().positive(),
          amount: money,
          reference: z.string().max(120),
          chequeDate: z.union([date, z.literal('')]).optional(),
        }),
      )
      .max(20),
    attachmentIds: z.array(z.number().int().positive()).max(20),
  })
  .refine((v) => ['expense', 'other_income'].includes(v.type) || v.cash || v.partyId !== null, {
    path: ['partyId'],
  });
export type SaleDocument = z.infer<typeof documentSchema>;
export interface SavedDocument extends SaleDocument {
  id: number;
  firmId: number;
  total: number;
  received: number;
  balance: number;
  status: string;
  paymentStatus: string;
  deletedAt: string | null;
  partyGstin: string;
  firmState?: string;
}
export interface SaleSummary {
  categoryId: number | null;
  id: number;
  type: string;
  partyId: number | null;
  partyName: string;
  prefix: string;
  number: number;
  date: string;
  dueDate: string | null;
  total: number;
  received: number;
  balance: number;
  status: string;
  paymentStatus: string;
  deletedAt: string | null;
}
export interface Account {
  id: number;
  name: string;
  type: string;
}
export interface Allocation {
  invoiceId: number;
  amount: number;
}
export const receiptSchema = z.object({
  type: z.enum(['payment_in', 'payment_out']).default('payment_in'),
  attachmentIds: z.array(z.number().int().positive()).max(20).default([]),
  reference: z.string().max(120).default(''),
  chequeDate: z.union([date, z.literal('')]).default(''),
  partyId: z.number().int().positive(),
  amount: money.refine((v) => v > 0),
  discount: money,
  accountId: z.number().int().positive(),
  date,
  prefix: z.string().trim().max(30),
  number: z.number().int().positive().max(1e9),
  description: z.string().max(4000),
  allocations: z
    .array(z.object({ invoiceId: z.number().int().positive(), amount: money }))
    .max(1000),
  auto: z.boolean(),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const receiptDraftSchema = receiptSchema.extend({
  partyId: z.number().int().nonnegative(),
  accountId: z.number().int().nonnegative(),
  amount: money,
});
export function blankDocument(
  type: DocumentType,
  state: string,
  settings: Settings = {},
): SaleDocument {
  return {
    type,
    loyaltyRedeem: 0,
    loyaltyDiscount: 0,
    supplierBillNo: '',
    supplierBillDate: '',
    itcEligible: true,
    categoryId: null,
    godownId: null,
    expenseMode: 'itemised',
    partyId: null,
    cash: Boolean(settings.cashDefault),
    partyName: '',
    phone: '',
    billingAddress: '',
    shippingAddress: '',
    prefix: String(
      settings[`prefix.${type}`] ??
        (
          {
            sale: 'INV-',
            sale_return: 'CN-',
            estimate: 'EST-',
            sale_order: 'SO-',
            delivery_challan: 'DC-',
            challan_return: 'DCR-',
            proforma: 'PRO-',
            purchase: 'PUR-',
            purchase_return: 'DN-',
            purchase_order: 'PO-',
            expense: 'EXP-',
            other_income: 'INC-',
          } as Record<string, string>
        )[type] ??
        '',
    ),
    number: 1,
    date: today(),
    dueDate: '',
    paymentTerms: 0,
    placeOfSupply: state,
    refTxnId: null,
    lines: [],
    charges: [],
    discount: 0,
    discountBps: 0,
    roundMode: settings.roundOff ? (String(settings.roundMode ?? 'nearest') as 'nearest') : 'off',
    roundStep: Number(settings.roundStep ?? 100) as 100,
    description: '',
    terms: String(settings.defaultTerms ?? ''),
    payments: [],
    attachmentIds: [],
  };
}
export function lineFromItem(item: Item, taxBps: number, qty = 1, unitId = item.unitId): SaleLine {
  const factor = unitId && unitId === item.secondaryUnitId ? item.conversion : 1;
  const baseQty = baseQuantity(qty, factor);
  return {
    itemId: item.id,
    name: item.name,
    hsn: item.hsn,
    qty,
    freeQty: 0,
    unitId,
    price: stockAmount(
      factor,
      item.wholesaleQty > 0 && baseQty >= item.wholesaleQty ? item.wholesalePrice : item.salePrice,
    ),
    inclusive: item.inclusive,
    discountBps: item.discountType === 'percent' ? item.discountBps : 0,
    discountAmount: item.discountType === 'amount' ? item.discountAmount : 0,
    taxBps,
    cessBps: item.cessBps ?? 0,
  };
}
export function documentLineFromItem(
  type: DocumentType,
  item: Item,
  taxBps: number,
  qty = 1,
  unitId = item.unitId,
) {
  const priced =
    DOCUMENT_CONFIG[type].price === 'purchase'
      ? {
          ...item,
          salePrice: item.purchasePrice,
          inclusive: item.purchaseInclusive,
          wholesaleQty: 0,
          discountBps: 0,
          discountAmount: 0,
        }
      : item;
  return lineFromItem(priced, taxBps, qty, unitId);
}
export function totals(doc: SaleDocument, firmState: string) {
  const discount = (amount: number, bps: number): Discount =>
    amount ? { kind: 'amount', value: amount } : { kind: 'percent', value: bps / 100 };
  const input = {
    firmState,
    placeOfSupply: doc.placeOfSupply,
    lines: doc.lines.map((l) => ({
      qty: l.qty,
      price: l.price,
      inclusive: l.inclusive,
      taxRate: l.taxBps / 100,
      cessRate: l.cessBps / 100,
      discount: discount(l.discountAmount, l.discountBps),
    })),
    charges: doc.charges.map((c) => ({ qty: 1, price: c.amount, taxRate: c.taxBps / 100 })),
    discount: discount(doc.discount, doc.discountBps),
  };
  const ordinary = calculateInvoice(input);
  return calculateInvoice({
    ...input,
    discount: doc.loyaltyDiscount
      ? { kind: 'amount', value: sumPaise([ordinary.transactionDiscount, doc.loyaltyDiscount]) }
      : input.discount,
    roundOff: doc.roundMode === 'off' ? undefined : { mode: doc.roundMode, step: doc.roundStep },
  });
}
export function simpleExpenseAmount(
  doc: SaleDocument,
  price: number,
  defaultAccount: number,
): Pick<SaleDocument, 'lines' | 'payments'> {
  const lines = [{ ...doc.lines[0], price: assertPaise(price) }];
  const canUpdate = doc.payments.length === 1 && doc.payments[0].amount === doc.lines[0].price;
  return {
    lines,
    payments: !doc.payments.length
      ? [{ accountId: defaultAccount, amount: price, reference: '' }]
      : canUpdate
        ? [{ ...doc.payments[0], amount: price }]
        : doc.payments,
  };
}
export function paymentStatus(
  total: number,
  received: number,
  dueDate: string | null,
  on = today(),
) {
  if (received >= total) return 'paid';
  if (dueDate && dueDate < on) return 'overdue';
  return received > 0 ? 'partial' : 'unpaid';
}
export function allocateOldest(
  amount: number,
  invoices: { id: number; date: string; balance: number }[],
): Allocation[] {
  let remaining = assertPaise(amount);
  if (remaining < 0) throw new Error('validation');
  return [...invoices]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .flatMap((i) => {
      const used = Math.min(remaining, Math.max(0, assertPaise(i.balance)));
      remaining -= used;
      return used ? [{ invoiceId: i.id, amount: used }] : [];
    });
}
export function validateAllocations(
  amount: number,
  allocations: Allocation[],
  invoices: { id: number; balance: number }[],
) {
  if (
    new Set(allocations.map((a) => a.invoiceId)).size !== allocations.length ||
    sumPaise(allocations.map((a) => a.amount)) > amount
  )
    throw new Error('allocation');
  for (const a of allocations) {
    const invoice = invoices.find((i) => i.id === a.invoiceId);
    if (!invoice || !Number.isSafeInteger(a.amount) || a.amount < 0 || a.amount > invoice.balance)
      throw new Error('allocation');
  }
}
export function exceedsCredit(
  balance: number,
  total: number,
  received: number,
  limit: number | null,
) {
  return limit !== null && sumPaise([balance, total, -received]) > limit;
}
export function documentCreditWarning(
  doc: SaleDocument,
  firmState: string,
  party: { id: number; balance: number; creditLimit: number | null } | undefined,
  previous?: SaleDocument,
) {
  if (doc.type !== 'sale' || !party) return false;
  const old =
    previous?.partyId === party.id
      ? sumPaise([
          totals(previous, firmState).total,
          -sumPaise(previous.payments.map((p) => p.amount)),
        ])
      : 0;
  return exceedsCredit(
    sumPaise([party.balance, -old]),
    totals(doc, firmState).total,
    sumPaise(doc.payments.map((p) => p.amount)),
    party.creditLimit,
  );
}
export function stockShortages(doc: SaleDocument, items: Item[], previous?: SaleDocument) {
  return items
    .filter((item) => {
      const movement = (d: SaleDocument) =>
        d.lines
          .filter((l) => l.itemId === item.id)
          .reduce((n, l) => n + decimalScaled(stockMovement(d.type, l, item).qty, 3), 0n);
      const delta = movement(doc);
      return (
        delta < 0n && decimalScaled(item.qty, 3) - (previous ? movement(previous) : 0n) + delta < 0n
      );
    })
    .map((i) => i.id);
}
export function validateReturnAgainst(
  source: { total: number; lines: SaleLine[] },
  current: { total: number; lines: SaleLine[] },
  others: { total: number; lines: SaleLine[] }[],
) {
  if (sumPaise([current.total, ...others.map((r) => r.total)]) > source.total)
    throw new Error('overpayment');
  for (const line of current.lines) {
    const matching = (lines: SaleLine[]) =>
      lines.filter((l) => l.itemId === line.itemId && l.unitId === line.unitId);
    const q = (lines: SaleLine[]) =>
      matching(lines).reduce(
        (n, l) => n + decimalScaled(l.qty, 3) + decimalScaled(l.freeQty, 3),
        0n,
      );
    if (
      !matching(source.lines).length ||
      q(current.lines) + q(others.flatMap((r) => r.lines)) > q(source.lines)
    )
      throw new Error('validation');
  }
}
export function stockMovement(type: DocumentType, line: SaleLine, item: Item) {
  if (item.type === 'service' || DOCUMENT_CONFIG[type].stockSign === 0) return { qty: 0, value: 0 };
  const qty = Number(decimalScaled(line.qty, 3) + decimalScaled(line.freeQty, 3)) / 1000;
  const base = baseQuantity(
    qty,
    line.unitId && line.unitId === item.secondaryUnitId ? item.conversion : 1,
  );
  const sign = DOCUMENT_CONFIG[type].stockSign;
  return { qty: base * sign, value: stockAmount(base, item.purchasePrice) * sign };
}
export function dueAfter(dateValue: string, days: number) {
  const d = new Date(dateValue + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
