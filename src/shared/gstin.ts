import { STATES } from './constants';
export const formatGSTIN = (value: string): string => value.replace(/\s/g, '').toUpperCase();
export function gstinChecksum(first14: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (!/^[0-9A-Z]{14}$/.test(first14)) throw new RangeError('GSTIN requires 14 letters and digits');
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = chars.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return chars[(36 - (sum % 36)) % 36];
}
export function validateGSTIN(value: string): boolean {
  const gstin = formatGSTIN(value);
  return (
    /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) &&
    STATES.some((state) => state.code === gstin.slice(0, 2)) &&
    gstinChecksum(gstin.slice(0, 14)) === gstin[14]
  );
}
export function extractGSTIN(value: string) {
  const gstin = formatGSTIN(value);
  return validateGSTIN(gstin) ? { stateCode: gstin.slice(0, 2), pan: gstin.slice(2, 12) } : null;
}
