import { expect, it } from 'vitest';
import { en, hi } from './compliance';
import { DEFAULT_TALLY_LEDGERS, TALLY_VOUCHER_KINDS } from '../../../shared/compliance-api';

it('has Hindi for every English compliance message, and complete help topics', () => {
  expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  for (const [key, value] of Object.entries(en)) {
    expect(value.trim(), key).not.toBe('');
    expect(hi[key].trim(), key).not.toBe('');
    if (key.startsWith('help.') && key.endsWith('.title')) {
      expect(en).toHaveProperty(key.replace(/\.title$/, '.body'));
      expect(en).toHaveProperty(key.replace(/\.title$/, '.example'));
    }
  }
});

it('keeps interpolation placeholders identical in both languages', () => {
  const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
  for (const key of Object.keys(en))
    expect(placeholders(hi[key]), key).toEqual(placeholders(en[key]));
});

it('covers every ledger, voucher kind and issue code the dialogs can show', () => {
  for (const key of Object.keys(DEFAULT_TALLY_LEDGERS))
    expect(en).toHaveProperty(`compliance.tally.ledger.${key}`);
  for (const kind of TALLY_VOUCHER_KINDS)
    expect(en).toHaveProperty(`compliance.tally.kind.${kind}`);
  for (const code of [
    'ewbDocType',
    'einvDocType',
    'firmGstin',
    'firmAddress',
    'firmPincode',
    'partyAddress',
    'partyPincode',
    'partyGstinMissing',
    'partyGstin',
    'itemHsn',
    'ewbDocNo',
    'einvDocNo',
    'vehicleFormat',
    'transporterId',
    'belowThreshold',
    'partB',
    'transDoc',
    'buyerGstin',
    'sameGstin',
    'shipPincode',
    'docDateFuture',
    'creditNoteRef',
    'gstRate',
  ])
    expect(en).toHaveProperty(`compliance.issue.${code}`);
});
