import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from '../../db/sales-fixture.test-helper';
import { DEFAULT_TALLY_LEDGERS, type TallyOptions } from '../../../shared/compliance-api';
import { blankTransport } from '../../../shared/compliance-api';
import { complianceStore } from './store';
import { tallyData } from './tally-data';
import { buildMastersXml, buildVouchersXml } from './tally-xml';
import { ewayCheck } from './ewaybill';
import { all, child, kids, parseXml, textOf, toPaise } from './xml.test-helper';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});
const options = (overrides: Partial<TallyOptions> = {}): TallyOptions => ({
  from: '2026-04-01',
  to: '2027-03-31',
  masters: true,
  vouchers: true,
  voucherKinds: ['sale', 'purchase', 'sale_return', 'purchase_return', 'payment_in', 'payment_out'],
  openingBalances: false,
  companyName: 'Sales Test',
  ledgers: { ...DEFAULT_TALLY_LEDGERS },
  ...overrides,
});

it('exports real books to balanced Tally vouchers, including payments taken with the bill', async () => {
  const { context, sales, firm, document, cash, upi, receipt } = await setup();
  const first = sales.save(firm.id, null, {
    ...document(2),
    payments: [
      { accountId: cash.id, amount: 1000, reference: '' },
      { accountId: upi.id, amount: 5000, reference: 'UPI-1' },
    ],
  });
  sales.receipt(firm.id, receipt(3000));
  sales.save(firm.id, null, {
    ...document(1),
    type: 'sale_return',
    prefix: 'CN-',
    number: 1,
    refTxnId: first.id,
  });
  const { data, warnings } = tallyData(context, firm.id, options());
  expect(warnings).toEqual([]);
  expect(data.parties.map((p) => [p.ledgerName, p.group])).toEqual([
    ['Customer', 'Sundry Debtors'],
  ]);
  expect(data.stockItems).toEqual([expect.objectContaining({ name: 'Book' })]);
  expect(data.units.map((u) => u.symbol)).toContain(data.stockItems[0].unit);
  const kinds = data.vouchers.map((v) => v.kind).sort();
  // sale + its 2 split payments as one Receipt, standalone receipt, credit note
  expect(kinds).toEqual(['payment_in', 'payment_in', 'sale', 'sale_return']);

  const masters = parseXml(buildMastersXml(data));
  const names = all(masters, 'LEDGER').map((l) => l.attrs.NAME);
  expect(names).toEqual(
    expect.arrayContaining(['Customer', 'Sales', 'Output CGST', 'Cash', 'UPI']),
  );
  const vouchers = all(parseXml(buildVouchersXml(data)), 'VOUCHER');
  expect(vouchers).toHaveLength(4);
  for (const voucher of vouchers) {
    const direct = kids(voucher, 'ALLLEDGERENTRIES.LIST');
    const allocations = kids(voucher, 'ALLINVENTORYENTRIES.LIST').flatMap((i) =>
      kids(i, 'ACCOUNTINGALLOCATIONS.LIST'),
    );
    const sum = [...direct, ...allocations].reduce((n, e) => n + toPaise(textOf(e, 'AMOUNT')), 0);
    expect(sum, textOf(voucher, 'VOUCHERNUMBER')).toBe(0);
  }
  const sale = vouchers.find((v) => v.attrs.VCHTYPE === 'Sales')!;
  expect(toPaise(textOf(kids(sale, 'ALLLEDGERENTRIES.LIST')[0], 'AMOUNT'))).toBe(-23600);
  expect(textOf(child(sale, 'ALLINVENTORYENTRIES.LIST'), 'BILLEDQTY')).toMatch(/^2 /);
  const settled = vouchers.filter((v) => v.attrs.VCHTYPE === 'Receipt');
  expect(settled.map((v) => textOf(v, 'VOUCHERNUMBER')).sort()).toEqual([
    'INV-0001/R',
    'RCPT-0001',
  ]);
});

it('respects the date range and the chosen voucher types', async () => {
  const { context, sales, firm, document } = await setup();
  sales.save(firm.id, null, document(1));
  const none = tallyData(context, firm.id, options({ from: '2027-01-01', to: '2027-02-01' }));
  expect(none.data.vouchers).toEqual([]);
  const mastersOnly = tallyData(context, firm.id, options({ vouchers: false }));
  expect(mastersOnly.data.vouchers).toEqual([]);
  const vouchersOnly = tallyData(
    context,
    firm.id,
    options({ masters: false, voucherKinds: ['sale'] }),
  );
  expect(vouchersOnly.data.parties).toEqual([]);
  expect(vouchersOnly.data.vouchers).toHaveLength(1);
});

it('keeps IRN and e-way bill details with the invoice, through later edits and into print data', async () => {
  const { context, sales, firm, document } = await setup();
  const store = complianceStore(context);
  const saved = sales.save(firm.id, null, document(2));
  expect(store.readRecord(firm.id, saved.id)).toEqual({});
  store.saveRecord(firm.id, saved.id, { ewbNo: '341001234567' });
  store.saveRecord(firm.id, saved.id, {
    einvoice: {
      irn: 'a'.repeat(64),
      ackNo: '112010012345678',
      ackDate: '2026-11-10 12:30:00',
      signedQr: 'eyJhbGciOiJSUzI1NiJ9.e30.sig',
    },
  });
  sales.save(firm.id, saved.id, { ...saved, description: 'edited' });
  const record = store.readRecord(firm.id, saved.id);
  expect(record.ewbNo).toBe('341001234567');
  expect(record.einvoice?.irn).toBe('a'.repeat(64));
  const block = await store.printBlock(firm.id, saved.id);
  expect(block).toMatchObject({ irn: 'a'.repeat(64), ackNo: '112010012345678' });
  expect(block?.qr).toMatch(/^data:image\/png;base64,/);
  store.saveRecord(firm.id, saved.id, { einvoice: undefined });
  expect(store.readRecord(firm.id, saved.id).einvoice).toBeUndefined();
  expect(await store.printBlock(firm.id, saved.id)).toBeUndefined();
});

it('builds the compliance source from saved invoices and flags what is missing', async () => {
  const { context, sales, firm, document } = await setup();
  const saved = sales.save(firm.id, null, document(2));
  const source = complianceStore(context).source(firm.id, saved.id);
  expect(source.party.name).toBe('Customer');
  expect(source.units[source.doc.lines[0].unitId!]).toBeDefined();
  const result = ewayCheck(source, blankTransport());
  expect(result.bill).toBeNull();
  expect(result.issues.map((i) => i.code)).toEqual(
    expect.arrayContaining(['firmGstin', 'firmPincode', 'itemHsn', 'belowThreshold']),
  );
});
