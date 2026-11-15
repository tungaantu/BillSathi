import { describe, expect, it } from 'vitest';
import { UNITS } from '../../../shared/constants';
import { UQC, tallyUom, uqcFor } from './uqc';

describe('UQC mapping', () => {
  it.each([
    ['BAGS', 'BAG'],
    ['BOX', 'BOX'],
    ['KGS', 'KGS'],
    ['Kg', 'KGS'],
    ['LTR', 'LTR'],
    ['Litre', 'LTR'],
    ['PCS', 'PCS'],
    ['Pcs', 'PCS'],
    ['NOS', 'NOS'],
    ['NUMBERS', 'NOS'],
    ['DOZENS', 'DOZ'],
    ['  square   feet ', 'SQF'],
    ['Metric Ton', 'MTS'],
  ])('maps %s to %s', (unit, code) => expect(uqcFor(unit)).toBe(code));

  it('falls back to OTH for services, empty and unknown units', () => {
    expect(uqcFor('SERVICE')).toBe('OTH');
    expect(uqcFor('HOUR')).toBe('OTH');
    expect(uqcFor('Furlong')).toBe('OTH');
    expect(uqcFor('')).toBe('OTH');
    expect(uqcFor(null)).toBe('OTH');
    expect(uqcFor(undefined)).toBe('OTH');
  });

  it('always returns a code that exists in the official UQC list', () => {
    for (const [name, symbol] of UNITS) {
      expect(UQC).toHaveProperty(uqcFor(name));
      expect(UQC).toHaveProperty(uqcFor(symbol));
    }
  });

  it('maps every standard app unit by name and by symbol to the same code', () => {
    for (const [name, symbol] of UNITS) expect(uqcFor(symbol)).toBe(uqcFor(name));
  });

  it('accepts UQC codes themselves and formats Tally UOM text', () => {
    expect(uqcFor('GMS')).toBe('GMS');
    expect(tallyUom('KGS')).toBe('KGS-KILOGRAMS');
    expect(tallyUom('OTH')).toBe('OTH-OTHERS');
  });
});
