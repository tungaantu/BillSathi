import { expect, it } from 'vitest';
import { payments } from './payments';
import en from '../en.json';
import hi from '../hi.json';

it('has Hindi for every English payments message, with complete help topics', () => {
  expect(Object.keys(payments.hi).sort()).toEqual(Object.keys(payments.en).sort());
  for (const [key, value] of Object.entries(payments.en)) {
    expect(value.trim(), key).not.toBe('');
    expect(payments.hi[key].trim(), key).not.toBe('');
    if (key.startsWith('help.') && key.endsWith('.title')) {
      expect(payments.en, key).toHaveProperty(key.replace(/\.title$/, '.body'));
      expect(payments.en, key).toHaveProperty(key.replace(/\.title$/, '.example'));
    }
  }
});

it('keeps the same {{placeholders}} in both languages and never overrides base messages', () => {
  const holes = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(payments.en)) {
    expect(holes(payments.hi[key]), key).toEqual(holes(payments.en[key]));
    expect(en, key).not.toHaveProperty(key);
    expect(hi, key).not.toHaveProperty(key);
  }
});

it('defines every plural and every problem message the screens can show', () => {
  for (const base of [
    'payments.alert.seen',
    'payments.alert.waiting',
    'payments.alert.confirmedToast',
    'payments.statement.confirmed',
  ])
    for (const suffix of ['_one', '_other']) expect(payments.en).toHaveProperty(base + suffix);
  for (const code of [
    'unreachable',
    'timeout',
    'auth',
    'mismatch',
    'busy',
    'blocked',
    'observers',
    'rejected',
    'notFound',
    'badResponse',
    'server',
    'config',
    'noSecureStorage',
  ])
    expect(payments.en).toHaveProperty(`payments.problem.${code}`);
  for (const reason of [
    'noUpiId',
    'notPayable',
    'badAmount',
    'badUtr',
    'badLast4',
    'noParty',
    'overpayment',
    'duplicateUtr',
    'storage',
    'notRecordable',
  ])
    expect(payments.en).toHaveProperty(`payments.error.${reason}`);
});
