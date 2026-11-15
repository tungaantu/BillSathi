import { expect, it } from 'vitest';
import { invoiceHtml } from './invoice-html';
import { blankDocument, lineFromItem, type SavedDocument } from './sales';
import { blankItem, type Item } from './masters';
import type { Firm } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { THEMES } from './print-settings';
import en from '../renderer/i18n/en.json';
const firm: Firm = {
  id: 1,
  name: 'BillSathi Test Store',
  phone: '9876543210',
  category: 'grocery',
  stateCode: '29',
  gstin: '29ABCDE1234F1Z5',
  pan: '',
  address: 'Bengaluru',
  email: '',
  bankName: 'Example Bank',
  accountNumber: '123456',
  ifsc: 'BANK0000001',
  upiId: 'test@upi',
  logo: null,
  signature: null,
  demo: false,
};
const item: Item = {
  ...blankItem(),
  id: 1,
  firmId: 1,
  name: 'Notebook',
  hsn: '4820',
  salePrice: 10000,
  qty: 10,
  value: 60000,
};
const doc: SavedDocument = {
  ...blankDocument('sale', '29'),
  date: '2026-11-10',
  dueDate: '2026-12-10',
  partyName: 'Asha',
  partyId: 1,
  lines: [lineFromItem(item, 1800)],
  terms: 'Payment within 30 days',
  id: 1,
  firmId: 1,
  total: 11800,
  received: 1800,
  balance: 10000,
  status: 'posted',
  paymentStatus: 'partial',
  deletedAt: null,
  partyGstin: '29ABCDE1234F1Z5',
};
const labels = Object.fromEntries(
  Object.entries(en)
    .filter(([k]) => k.startsWith('print.'))
    .map(([k, v]) => [k.slice(6), v]),
);
it('snapshots the complete original invoice HTML', () =>
  expect(invoiceHtml({ firm, doc, settings: DEFAULT_SETTINGS, labels })).toMatchSnapshot());
it.each(THEMES)('renders %s offline with GST details and escaped user content', (theme) => {
  const html = invoiceHtml({
    firm,
    doc: { ...doc, partyName: '<script>alert(1)</script>' },
    settings: DEFAULT_SETTINGS,
    labels,
    theme,
  });
  for (const value of [
    'INV-0001',
    '10/11/2026',
    'CGST',
    'SGST',
    'IGST',
    '4820',
    'Reverse charge: No',
    'Rupees',
    '&lt;script&gt;',
  ])
    expect(html).toContain(value);
  expect(html).not.toContain('<script>');
  expect(html).not.toMatch(/src="https?:/);
  if (theme.startsWith('thermal')) expect(html).toContain(theme === 'thermal58' ? '58mm' : '80mm');
});
it('supports copies and visibility settings without removing essential party and document data', () => {
  const html = invoiceHtml({
    firm,
    doc,
    settings: {
      ...DEFAULT_SETTINGS,
      printTitle: 'Bill of Supply',
      printHeader: false,
      printWords: false,
      printTaxSummary: false,
      printCopies: 2,
    },
    labels,
  });
  expect(html).toContain('Bill of Supply');
  expect(html).toContain('Duplicate for transporter');
  expect(html).toContain('Asha');
  expect(html).not.toContain('<h1>BillSathi Test Store</h1>');
  expect(html).not.toContain('Amount in words');
});
