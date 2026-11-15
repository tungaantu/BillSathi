/** Money is integer paise; all intermediate arithmetic uses BigInt rationals. */
export function assertPaise(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError('Money must be safe integer paise');
  return value;
}
export function safeNumber(value: bigint): number {
  const result = Number(value);
  return assertPaise(result);
}
export function divideRound(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError('Positive divisor required');
  return n < 0n ? -divideRound(-n, d) : (n + d / 2n) / d;
}
export function decimalScaled(value: string | number, places: number): bigint {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new RangeError('Enter a plain decimal number');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places)))
    throw new RangeError('Too many decimal places');
  const result =
    BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.slice(0, places).padEnd(places, '0'));
  return negative ? -result : result;
}
export const rupeesToPaise = (value: string): number => safeNumber(decimalScaled(value, 2));
export function paiseToDecimal(value: number): string {
  const amount = BigInt(assertPaise(value));
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function formatINR(paise: number, decimals = 2): string {
  assertPaise(paise);
  if (![0, 1, 2].includes(decimals)) throw new RangeError('Use 0, 1 or 2 decimal places');
  const rounded = divideRound(BigInt(Math.abs(paise)), 10n ** BigInt(2 - decimals));
  const digits = rounded.toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const grouped =
    whole.length <= 3
      ? whole
      : whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + whole.slice(-3);
  return `${paise < 0 ? '-' : ''}₹${grouped}${decimals ? '.' + digits.slice(-decimals) : ''}`;
}
export function sumPaise(values: number[]): number {
  return safeNumber(values.reduce((sum, value) => sum + BigInt(assertPaise(value)), 0n));
}
