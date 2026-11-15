import { STATES } from '../../../shared/constants';
import { paiseToDecimal } from '../../../shared/money';
import type { SavedDocument } from '../../../shared/sales';
import type { Firm } from '../../../shared/types';
import type { ComplianceIssue, FixTarget, IssueSeverity } from '../../../shared/compliance-api';

/** The business or customer details that both NIC schemas need, derived from our records. */
export interface Counterparty {
  name: string;
  gstin: string;
  stateCode: string;
  address: string;
  phone: string;
  email: string;
}
export interface ComplianceSource {
  firm: Firm;
  /** The buyer (for a cash sale: the walk-in details typed on the bill). */
  party: Counterparty;
  shippingAddress: string;
  doc: SavedDocument;
  /** Unit master: id -> name & symbol. */
  units: Record<number, { name: string; symbol: string }>;
  /** Original invoice, for credit notes. */
  original?: { prefix: string; number: number; date: string };
}

export const stateName = (code: string) => STATES.find((s) => s.code === code)?.en ?? '';
/** Money for NIC JSON: rupees as a number with at most 2 decimals (computed from exact paise). */
export const rupees = (paise: number): number => Number(paiseToDecimal(paise));
/** yyyy-mm-dd -> dd/mm/yyyy, the date format used by both NIC schemas. */
export function dmy(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
/** IRP shows "dd/mm/yyyy hh:mm:ss" or "yyyy-mm-dd hh:mm:ss"; store the latter. */
export function normalizeAckDate(value: string): string {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}${m[4]}` : value;
}
/** Last 6-digit PIN code found in an address, or null. */
export function extractPincode(address: string): number | null {
  const found = address.match(/(?<!\d)[1-9]\d{5}(?!\d)/g);
  return found ? Number(found[found.length - 1]) : null;
}
const clean = (address: string) =>
  address
    .replace(/(?<!\d)[1-9]\d{5}(?!\d)/g, '')
    .split(/[\n,]+/)
    .map((part) => part.replace(/[\s\-.]+$/g, '').trim())
    .filter(Boolean);
/**
 * Best-effort city/locality: the last address part that is not the PIN code or the state
 * name; falls back to the state name. The portals insist on a place, our address is free text.
 */
export function extractPlace(address: string, stateCode: string): string {
  const state = stateName(stateCode).toLowerCase();
  const parts = clean(address).filter((p) => p.toLowerCase() !== state);
  return (parts[parts.length - 1] ?? stateName(stateCode)).slice(0, 50);
}
/** Split free-text address into the two 100-character lines the schemas allow. */
export function splitAddress(address: string): [string, string] {
  const text = clean(address).join(', ');
  if (text.length <= 100) return [text, ''];
  const cut = text.lastIndexOf(' ', 100);
  const at = cut > 40 ? cut : 100;
  return [text.slice(0, at).trim(), text.slice(at).trim().slice(0, 100)];
}
export const gstinState = (gstin: string) => gstin.slice(0, 2);
export const hsnDigits = (hsn: string) => hsn.replace(/\s/g, '');
export const isHsn = (hsn: string) => /^\d{4,8}$/.test(hsnDigits(hsn));

export function issue(
  severity: IssueSeverity,
  code: string,
  fix: FixTarget = null,
  params?: Record<string, string | number>,
): ComplianceIssue {
  return params ? { code, severity, fix, params } : { code, severity, fix };
}
export const hasErrors = (issues: ComplianceIssue[]) => issues.some((i) => i.severity === 'error');
