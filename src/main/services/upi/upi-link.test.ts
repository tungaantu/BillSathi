import { describe, expect, it } from 'vitest';
import {
  buildUpiLink,
  collectionRef,
  extractUtr,
  extractUtrs,
  isValidUpiId,
  isValidUtr,
  youpiOrderId,
} from './upi-link';
import { isValidLast4 } from '../../../shared/upi-utils';

describe('UPI link builder', () => {
  const base = {
    upiId: 'sharma.store@okhdfcbank',
    payeeName: 'Sharma General Store',
    amountPaise: 123456,
    note: 'INV-0012',
    ref: 'BS1T12A1',
  };
  it('builds a upi://pay link with 2-decimal amount and INR', () => {
    expect(buildUpiLink(base)).toBe(
      'upi://pay?pa=sharma.store@okhdfcbank&pn=Sharma%20General%20Store&am=1234.56&cu=INR&tn=INV-0012&tr=BS1T12A1',
    );
  });
  it('always prints two decimals, even for whole rupees and small amounts', () => {
    expect(buildUpiLink({ ...base, amountPaise: 50000 })).toContain('&am=500.00&');
    expect(buildUpiLink({ ...base, amountPaise: 5 })).toContain('&am=0.05&');
    expect(buildUpiLink({ ...base, amountPaise: 12345678 })).toContain('&am=123456.78&');
  });
  it('encodes special characters in the payee name and note', () => {
    const link = buildUpiLink({ ...base, payeeName: 'Ram & Sons #1', note: 'Bill/5 ₹' });
    expect(link).toContain('pn=Ram%20%26%20Sons%20%231');
    expect(link).toContain('tn=Bill%2F5%20%E2%82%B9');
    expect(new URL(link).searchParams.get('pn')).toBe('Ram & Sons #1');
  });
  it('limits the note to 50 characters, the name to 50 and the reference to 35 letters or digits', () => {
    const link = new URL(
      buildUpiLink({
        ...base,
        note: 'N'.repeat(80),
        payeeName: 'P'.repeat(80),
        ref: `ab-cd_${'x'.repeat(60)}`,
      }),
    );
    expect(link.searchParams.get('tn')).toHaveLength(50);
    expect(link.searchParams.get('pn')).toHaveLength(50);
    const ref = link.searchParams.get('tr')!;
    expect(ref).toHaveLength(35);
    expect(ref).toMatch(/^[a-zA-Z0-9]+$/);
  });
  it('drops control characters and leaves out an empty note', () => {
    const link = buildUpiLink({ ...base, note: '  \n ', payeeName: 'A\tB' });
    expect(link).not.toContain('tn=');
    expect(new URL(link).searchParams.get('pn')).toBe('A B');
  });
  it('refuses zero, negative and fractional amounts', () => {
    for (const amountPaise of [0, -100, 10.5, Number.NaN]) {
      expect(() => buildUpiLink({ ...base, amountPaise })).toThrow(RangeError);
    }
  });
  it('makes stable references per invoice attempt', () => {
    expect(collectionRef(1, 12, 3)).toBe('BS1T12A3');
    expect(collectionRef(1, 12, 3)).not.toBe(collectionRef(1, 12, 4));
    expect(youpiOrderId(1, 12, 3)).toBe('BS-1-12-3');
  });
});

describe('UPI ID, UTR and last-4 validation', () => {
  it('accepts name@bank handles and rejects the rest', () => {
    for (const ok of ['sharma.store@okhdfcbank', '9876543210@ybl', 'a-b_c@upi', ' x1@sbi '])
      expect(isValidUpiId(ok)).toBe(true);
    for (const bad of ['', 'sharma', '@upi', 'a@', 'a b@upi', 'a@@upi', 'a@1bank', 'x@y'])
      expect(isValidUpiId(bad)).toBe(false);
  });
  it('requires exactly 12 digits for a UTR', () => {
    expect(isValidUtr('401537805904')).toBe(true);
    expect(isValidUtr(' 401537805904 ')).toBe(true);
    for (const bad of ['', '40153780590', '4015378059041', '40153780590A', '4015 3780 5904'])
      expect(isValidUtr(bad)).toBe(false);
  });
  it('allows an empty or 4-digit last-4', () => {
    expect(isValidLast4('')).toBe(true);
    expect(isValidLast4('4821')).toBe(true);
    expect(isValidLast4('482')).toBe(false);
    expect(isValidLast4('48210')).toBe(false);
    expect(isValidLast4('48a1')).toBe(false);
  });
});

describe('UTR extraction from bank narrations', () => {
  const samples: [string, string, string][] = [
    [
      'HDFC',
      'UPI-RAHUL KUMAR-rahul@okhdfcbank-HDFC0001234-401537805904-PAYMENT FROM PHONE',
      '401537805904',
    ],
    ['SBI', 'BY TRANSFER-UPI/CR/412345678901/RAHUL K/SBIN/rahul@sbi/UPI--', '412345678901'],
    ['ICICI', 'UPI/412345678902/Payment from PhonePe/rahul@ybl/Yes Bank', '412345678902'],
    ['Axis', 'UPI/P2A/412345678903/RAHUL KUMAR/Axis Bank/UPI', '412345678903'],
  ];
  it.each(samples)('%s narration', (_bank, narration, utr) => {
    expect(extractUtr(narration)).toBe(utr);
    expect(extractUtrs(narration)).toEqual([utr]);
  });
  it('ignores account numbers, timestamps and phone numbers', () => {
    expect(extractUtr('TRANSFER FROM 4897693162093 REF 20261110123456 9876543210')).toBeNull();
  });
  it('reads the reference column as well and de-duplicates', () => {
    expect(extractUtrs('401537805904', 'UPI/CR/401537805904/NAME')).toEqual(['401537805904']);
    expect(extractUtrs('', 'a 401537805904 b 412345678901')).toEqual([
      '401537805904',
      '412345678901',
    ]);
    expect(extractUtr(undefined, null)).toBeNull();
  });
});
