/** Pure UPI helpers shared by the main process and the renderer. */
const UPI_ID = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,31}$/;
/** A UPI ID looks like name@bank, for example sharma.store@okhdfcbank. */
export const isValidUpiId = (value: string): boolean => UPI_ID.test(value.trim());
/** A UTR / UPI reference is exactly 12 digits. */
export const isValidUtr = (value: string): boolean => /^\d{12}$/.test(value.trim());
/** The last four digits of the payer's phone or account (optional). */
export const isValidLast4 = (value: string): boolean => /^(\d{4})?$/.test(value.trim());
/**
 * Finds every standalone 12-digit number in a bank narration or reference column.
 * Longer digit runs (account numbers, timestamps) are ignored on purpose.
 */
export function extractUtrs(...texts: (string | null | undefined)[]): string[] {
  const found = texts.join(' ').match(/(?<!\d)\d{12}(?!\d)/g) ?? [];
  return [...new Set(found)];
}
/** The first 12-digit reference in the text, or null. */
export const extractUtr = (...texts: (string | null | undefined)[]): string | null =>
  extractUtrs(...texts)[0] ?? null;
/** How a payment is shown in lists. */
export type PaymentBadge = 'upi' | 'seen' | 'confirmed';
