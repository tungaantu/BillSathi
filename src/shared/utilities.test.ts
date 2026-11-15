import { describe, expect, it } from 'vitest';
import { formatINR, paiseToDecimal, rupeesToPaise, sumPaise } from './money';
import { amountInWords } from './words';
import { extractGSTIN, formatGSTIN, gstinChecksum, validateGSTIN } from './gstin';
import { displayDocumentNumber, nextDocumentNumber } from './numbering';
import { categoryPresets, validSetting } from './settings';
describe('integer paise and Indian display', () => {
  it.each([
    [0, '₹0.00'],
    [1, '₹0.01'],
    [12345650, '₹1,23,456.50'],
    [-100, '-₹1.00'],
    [100000000, '₹10,00,000.00'],
  ])('formats %s', (paise, formatted) => expect(formatINR(Number(paise))).toBe(formatted));
  it('rounds only for display', () => {
    expect(formatINR(199, 0)).toBe('₹2');
    expect(formatINR(195, 1)).toBe('₹2.0');
  });
  it('parses decimal text exactly', () => {
    expect(paiseToDecimal(-1)).toBe('-0.01');
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('-0.01')).toBe(-1);
    expect(sumPaise([29, 71])).toBe(100);
  });
  it.each(['1.001', 'NaN', '1e2', '1,000', ''])('rejects malformed text %s', (value) =>
    expect(() => rupeesToPaise(value)).toThrow(),
  );
  it('rejects overflow and fractional paise', () => {
    expect(() => sumPaise([Number.MAX_SAFE_INTEGER, 1])).toThrow();
    expect(() => formatINR(1.1)).toThrow();
  });
});
describe('Indian words', () => {
  it('writes lakh, thousand, rupees and paise', () =>
    expect(amountInWords(12345650)).toBe(
      'One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Fifty Paise Only',
    ));
  it.each([
    [0, 'Zero Rupees Only'],
    [1, 'Zero Rupees and One Paise Only'],
    [1000000000, 'One Crore Rupees Only'],
    [-100, 'Minus One Rupees Only'],
  ])('writes %s', (paise, words) => expect(amountInWords(Number(paise))).toBe(words));
});
describe('GSTIN', () => {
  it('validates the checksum and extracts state and PAN', () => {
    expect(validateGSTIN('27AAPFU0939F1ZV')).toBe(true);
    expect(extractGSTIN('27AAPFU0939F1ZV')).toEqual({ stateCode: '27', pan: 'AAPFU0939F' });
  });
  it('normalises pasted whitespace and case', () =>
    expect(formatGSTIN(' 27aapfu0939f1zv ')).toBe('27AAPFU0939F1ZV'));
  it.each(['27AAPFU0939F1ZA', '99AAPFU0939F1ZV', '27AAPFU0939F0ZV', '', '27AAPFU0939F1XV'])(
    'rejects %s',
    (value) => {
      expect(validateGSTIN(value)).toBe(false);
      expect(extractGSTIN(value)).toBeNull();
    },
  );
  it('computes a Karnataka checksum', () => {
    const prefix = '29ABCDE1234F1Z';
    expect(validateGSTIN(prefix + gstinChecksum(prefix))).toBe(true);
  });
});
describe('numbering and presets', () => {
  it('isolates firms, document types and prefixes, preserves gaps', () => {
    const docs = [
      { firmId: 1, type: 'sale', prefix: 'INV-', number: 7 },
      { firmId: 2, type: 'sale', prefix: 'INV-', number: 99 },
      { firmId: 1, type: 'purchase', prefix: 'INV-', number: 88 },
    ];
    expect(displayDocumentNumber(nextDocumentNumber(docs, 1, 'sale', 'INV-'))).toBe('INV-0008');
    expect(nextDocumentNumber(docs, 1, 'sale', 'NEW-').number).toBe(1);
  });
  it('sets sensible category defaults and validates preferences', () => {
    expect(categoryPresets('pharmacy').batches).toBe(true);
    expect(categoryPresets('services').stock).toBe(false);
    expect(validSetting('zoom', 130)).toBe(true);
    expect(validSetting('zoom', 140)).toBe(false);
    expect(validSetting('theme', 'pink')).toBe(false);
    expect(validSetting('tour.home', true)).toBe(true);
  });
});
