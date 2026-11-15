import { z } from 'zod';
import { date, quantity } from './masters';
import { assertPaise, decimalScaled, safeNumber, sumPaise } from './money';

/** Quantities are compared and added as integer thousandths so 0.1 + 0.2 stays exact. */
const milli = (qty: number) => decimalScaled(qty, 3);
const fromMilli = (value: bigint) => Number(value) / 1000;

// ---------- Batches ----------
export interface BatchStock {
  id: number;
  number: string;
  expDate: string | null;
  mfgDate?: string | null;
  mrp?: number | null;
  qty: number;
}
export type ExpiryStatus = 'expired' | 'expiring30' | 'expiring60' | 'expiring90' | 'ok' | 'none';
const dayMs = 86400000;
export function daysUntil(day: string, on: string) {
  return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(on + 'T00:00:00Z')) / dayMs);
}
/** Plain-language bucket for an expiry date as of `on` (both YYYY-MM-DD). */
export function expiryStatus(expDate: string | null | undefined, on: string): ExpiryStatus {
  if (!expDate) return 'none';
  const days = daysUntil(expDate, on);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring30';
  if (days <= 60) return 'expiring60';
  if (days <= 90) return 'expiring90';
  return 'ok';
}
/** Batches in "first expiry, first out" order: earliest expiry first, undated last, then by number. */
export function fefoOrder<T extends Pick<BatchStock, 'expDate' | 'number' | 'id'>>(batches: T[]) {
  return [...batches].sort(
    (a, b) =>
      (a.expDate ?? '9999-12-31').localeCompare(b.expDate ?? '9999-12-31') ||
      a.number.localeCompare(b.number) ||
      a.id - b.id,
  );
}
export interface Allocation {
  batchId: number;
  qty: number;
}
/**
 * Takes `qty` out of batches FEFO. Expired batches are skipped unless `allowExpired`.
 * Whatever cannot be covered is returned as `remainder` (sold from un-batched stock).
 */
export function allocateFefo(
  batches: BatchStock[],
  qty: number,
  on: string,
  allowExpired = false,
): { allocations: Allocation[]; remainder: number } {
  let left = milli(qty);
  const allocations: Allocation[] = [];
  for (const b of fefoOrder(batches)) {
    if (left <= 0n) break;
    if (!allowExpired && expiryStatus(b.expDate, on) === 'expired') continue;
    const available = milli(b.qty);
    if (available <= 0n) continue;
    const take = available < left ? available : left;
    allocations.push({ batchId: b.id, qty: fromMilli(take) });
    left -= take;
  }
  return { allocations, remainder: fromMilli(left) };
}
/** Splits a stock value across allocations in proportion to quantity; remainder on the last part. */
export function splitValue(value: number, qty: number, parts: number[]) {
  assertPaise(value);
  const total = milli(qty);
  if (total === 0n) return parts.map(() => 0);
  const out: number[] = [];
  let used = 0;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) out.push(value - used);
    else {
      const share = safeNumber((BigInt(value) * milli(part)) / total);
      out.push(share);
      used += share;
    }
  });
  return out;
}
export const batchInputSchema = z.object({
  number: z.string().trim().min(1).max(60),
  expDate: z.union([date, z.literal('')]),
  mfgDate: z.union([date, z.literal('')]),
  mrp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type BatchInput = z.infer<typeof batchInputSchema>;

// ---------- Serial / IMEI ----------
/** Splits pasted or scanned text into serial numbers (new lines, commas, tabs or semicolons). */
export function parseSerials(text: string) {
  return text
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function duplicateSerials(serials: string[]) {
  const seen = new Set<string>(),
    dup = new Set<string>();
  for (const s of serials.map((v) => v.toUpperCase())) (seen.has(s) ? dup : seen).add(s);
  return [...dup];
}
/** A tracked item's quantity must be a whole number equal to the count of serials entered. */
export function serialCountMatches(qty: number, serials: string[]) {
  return Number.isInteger(qty) && qty === serials.length;
}

// ---------- Godowns & transfers ----------
export const transferLineSchema = z.object({
  itemId: z.number().int().positive(),
  qty: quantity.refine((v) => v > 0),
  batchId: z.number().int().positive().nullable().default(null),
});
export const transferSchema = z
  .object({
    date,
    fromId: z.number().int().positive(),
    toId: z.number().int().positive(),
    note: z.string().max(500).default(''),
    lines: z.array(transferLineSchema).min(1).max(500),
  })
  .refine((v) => v.fromId !== v.toId, { path: ['toId'] });
export type TransferInput = z.infer<typeof transferSchema>;
export interface TransferMovement {
  itemId: number;
  godownId: number;
  batchId: number | null;
  qty: number;
  value: number;
}
/** Each line becomes an OUT row at the source and an equal IN row at the destination. */
export function transferMovements(
  input: TransferInput,
  valueOf: (itemId: number, qty: number) => number,
): TransferMovement[] {
  return input.lines.flatMap((l) => {
    const value = valueOf(l.itemId, l.qty);
    return [
      { itemId: l.itemId, godownId: input.fromId, batchId: l.batchId, qty: -l.qty, value: -value },
      { itemId: l.itemId, godownId: input.toId, batchId: l.batchId, qty: l.qty, value },
    ];
  });
}
export function netQty(rows: { qty: number }[]) {
  return fromMilli(rows.reduce((n, r) => n + milli(r.qty), 0n));
}

// ---------- POS ----------
/** Change to hand back; negative means the customer still owes that much. */
export function posChange(total: number, tendered: number) {
  return assertPaise(tendered) - assertPaise(total);
}
export type PosMethod = 'cash' | 'upi' | 'card';
export interface PosPart {
  method: PosMethod;
  amount: number;
}
/**
 * Validates split payments: every part positive, and they add up exactly to the bill total.
 * Cash may be over-tendered; only the bill amount is recorded and the rest is change.
 */
export function settlePos(total: number, parts: PosPart[], cashTendered = 0) {
  assertPaise(total);
  if (parts.some((p) => !Number.isSafeInteger(p.amount) || p.amount <= 0))
    throw new Error('validation');
  const paid = sumPaise(parts.map((p) => p.amount));
  if (paid !== total) throw new Error(paid > total ? 'overpayment' : 'validation');
  const cash = sumPaise(parts.filter((p) => p.method === 'cash').map((p) => p.amount));
  const change = cashTendered ? posChange(cash, cashTendered) : 0;
  if (change < 0) throw new Error('validation');
  return { paid, change };
}
export function posSummary(sales: { total: number; parts: PosPart[] }[]) {
  const by = (m: PosMethod) =>
    sumPaise(sales.flatMap((s) => s.parts.filter((p) => p.method === m).map((p) => p.amount)));
  return {
    bills: sales.length,
    total: sumPaise(sales.map((s) => s.total)),
    cash: by('cash'),
    upi: by('upi'),
    card: by('card'),
  };
}

// ---------- Barcode scanner input ----------
/** Exact (case-insensitive) match on an item's barcode first, then its item code. */
export function findByCode<T extends { code: string; barcode?: string | null }>(
  items: T[],
  text: string,
): T | undefined {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return (
    items.find((i) => (i.barcode ?? '').trim().toLowerCase() === q) ??
    items.find((i) => i.code.trim().toLowerCase() === q)
  );
}
/**
 * USB scanners "type" very fast and press Enter. Feed every key with its timestamp (ms);
 * returns the scanned text when Enter ends a fast burst of at least `minLength` characters.
 */
export function scanDetector(maxGap = 50, minLength = 3) {
  let buffer = '',
    last = -Infinity;
  return (key: string, at: number): string | null => {
    const fast = at - last <= maxGap;
    if (key === 'Enter') {
      const code = fast && buffer.length >= minLength ? buffer : null;
      buffer = '';
      last = -Infinity;
      return code;
    }
    if (key.length !== 1) return null;
    buffer = fast ? buffer + key : key;
    last = at;
    return null;
  };
}
