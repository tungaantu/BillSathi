import { paiseToDecimal } from '../../../shared/money';
export { extractUtr, extractUtrs, isValidUpiId, isValidUtr } from '../../../shared/upi-utils';
/** UPI apps truncate or reject long values, so keep to the commonly accepted limits. */
export const UPI_NOTE_MAX = 50;
export const UPI_REF_MAX = 35;
export const UPI_NAME_MAX = 50;
export interface UpiLinkInput {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  /** Shown to the customer in their app, usually the invoice number. */
  note: string;
  /** Unique transaction reference (letters and digits only). */
  ref: string;
}
const clean = (value: string, max: number) =>
  Array.from(value, (c) => (c.charCodeAt(0) < 32 ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const encode = (value: string) => encodeURIComponent(value);
/** Letters and digits only, so every UPI app accepts it. */
export const cleanRef = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').slice(0, UPI_REF_MAX);
/** Unique, stable transaction reference for one collection attempt. */
export const collectionRef = (firmId: number, txnId: number, attempt: number) =>
  cleanRef(`BS${firmId}T${txnId}A${attempt}`);
/** Order id sent to YouPI-PG: stable per invoice and attempt. */
export const youpiOrderId = (firmId: number, txnId: number, attempt: number) =>
  `BS-${firmId}-${txnId}-${attempt}`;
export function buildUpiLink(input: UpiLinkInput): string {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new RangeError('Amount must be more than zero');
  const parts = [
    // "@" is legal in a query value and every UPI app expects to see it as typed.
    `pa=${encode(input.upiId.trim()).replace(/%40/g, '@')}`,
    `pn=${encode(clean(input.payeeName, UPI_NAME_MAX))}`,
    `am=${paiseToDecimal(input.amountPaise)}`,
    'cu=INR',
  ];
  const note = clean(input.note, UPI_NOTE_MAX);
  if (note) parts.push(`tn=${encode(note)}`);
  const ref = cleanRef(input.ref);
  if (ref) parts.push(`tr=${encode(ref)}`);
  return `upi://pay?${parts.join('&')}`;
}
