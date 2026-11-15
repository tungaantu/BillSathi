import { z } from 'zod';
import { date, stockAmount, type Item } from './masters';
import { assertPaise, safeNumber } from './money';
import { documentLineFromItem, type SaleDocument } from './sales';
import type { Settings } from './types';

export const recurrenceSchema = z
  .object({
    sourceId: z.number().int().positive(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    day: z.number().int().min(1).max(31),
    start: date,
    end: z.union([date, z.literal('')]),
    mode: z.enum(['draft', 'save']),
  })
  .refine((v) => !v.end || v.end >= v.start);
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export interface Recurrence extends RecurrenceInput {
  id: number;
  next: string;
  paused: boolean;
  error: string;
}
export function addDays(value: string, days: number) {
  const d = new Date(value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Anchored day survives short months and leap years; all dates are local calendar dates. */
export function nextOccurrence(on: string, rule: Pick<RecurrenceInput, 'frequency' | 'day'>) {
  if (rule.frequency === 'daily') return addDays(on, 1);
  if (rule.frequency === 'weekly') return addDays(on, 7);
  const current = new Date(on + 'T12:00:00Z');
  const year = current.getUTCFullYear() + (rule.frequency === 'yearly' ? 1 : 0);
  const month = current.getUTCMonth() + (rule.frequency === 'monthly' ? 1 : 0);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(rule.day, last), 12)).toISOString().slice(0, 10);
}
export function firstOccurrence(rule: RecurrenceInput) {
  if (rule.frequency === 'daily') return rule.start;
  const d = new Date(rule.start + 'T12:00:00Z');
  if (rule.frequency === 'weekly') {
    const target = (rule.day - 1) % 7;
    return addDays(rule.start, (target - d.getUTCDay() + 7) % 7);
  }
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(rule.day, last));
  const candidate = d.toISOString().slice(0, 10);
  return candidate < rule.start ? nextOccurrence(candidate, rule) : candidate;
}
export function catchUp(rule: Recurrence, through: string, limit = 366) {
  const dates: string[] = [];
  let next = rule.next;
  while (
    !rule.paused &&
    next <= through &&
    (!rule.end || next <= rule.end) &&
    dates.length < limit
  ) {
    dates.push(next);
    next = nextOccurrence(next, rule);
  }
  return { dates, next };
}
export interface PartyRate {
  source?: string;
  partyId: number;
  itemId: number;
  price: number;
  inclusive: boolean;
}
export const partyRateSchema = z.object({
  partyId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  price: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inclusive: z.boolean(),
});
export function customerLine(
  doc: SaleDocument,
  item: Item,
  tax: number,
  rates: PartyRate[],
  settings: Settings,
  qty = 1,
  unit = item.unitId,
) {
  const line = documentLineFromItem(doc.type, item, tax, qty, unit);
  const rate = rates.find(
    (r) =>
      r.partyId === doc.partyId &&
      r.itemId === item.id &&
      (r.source === 'remembered' ? settings.rememberPartyPrice : settings.partyRates),
  );
  if (rate && !['purchase', 'purchase_return', 'purchase_order', 'expense'].includes(doc.type))
    return {
      ...line,
      price: stockAmount(unit === item.secondaryUnitId ? item.conversion : 1, rate.price),
      inclusive: rate.inclusive,
    };
  return line;
}
export const PLACEHOLDERS = [
  'party',
  'doc_no',
  'amount',
  'balance',
  'due_date',
  'firm',
  'upi_link',
] as const;
export type MessageValues = Record<(typeof PLACEHOLDERS)[number], string>;
export function renderMessage(template: string, values: MessageValues) {
  return template.replace(
    /\{(party|doc_no|amount|balance|due_date|firm|upi_link)\}/g,
    (_, k: keyof MessageValues) => values[k],
  );
}
export function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(digits)) throw new Error('phone');
  return `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`;
}
export function earnedPoints(basis: number, points: number, perPaise: number) {
  if (!Number.isSafeInteger(points) || points < 0 || perPaise <= 0) throw new Error('validation');
  return safeNumber(
    (BigInt(Math.max(0, assertPaise(basis))) / BigInt(assertPaise(perPaise))) * BigInt(points),
  );
}
export function redemption(points: number, available: number, value: number, maximum: number) {
  if (!Number.isSafeInteger(points) || points < 0 || points > available)
    throw new Error('validation');
  const amount = safeNumber(BigInt(points) * BigInt(assertPaise(value)));
  if (amount > maximum) throw new Error('overpayment');
  return amount;
}
export interface LoyaltyEntry {
  id: number;
  txnId: number;
  date: string;
  points: number;
  kind: string;
}
export interface Reminder {
  key: string;
  partyId: number;
  party: string;
  phone: string;
  amount: number;
  due: string;
  age: number;
  message: string;
  kind: 'payment' | 'service';
  item?: string;
}
export interface CustomerProfile {
  rates: PartyRate[];
  points: number;
  ledger: LoyaltyEntry[];
}

export function editablePoints(profile: CustomerProfile, id: number | null) {
  return (
    profile.points - profile.ledger.filter((e) => e.txnId === id).reduce((n, e) => n + e.points, 0)
  );
}
