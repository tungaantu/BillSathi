import { describe, expect, it } from 'vitest';
import { DEFAULT_TALLY_LEDGERS, TALLY_VOUCHER_NAMES } from '../../../shared/compliance-api';
import {
  buildMastersXml,
  buildVouchersXml,
  countMasters,
  uniqueNames,
  xmlEscape,
  type TallyData,
  type TallyVoucher,
} from './tally-xml';
import { all, child, kids, parseXml, textOf, toPaise, type XmlNode } from './xml.test-helper';

const NASTY = `Ravi & Sons <Traders> "Best" O'Neil`;
const base: Omit<TallyVoucher, 'kind'> = {
  number: 'INV-0001',
  date: '2026-11-10',
  partyName: NASTY,
  partyGstin: '29AAPFU0939F1ZV',
  placeOfSupply: 'Karnataka',
  narration: 'Goods & services <urgent>',
  total: 147510,
  cgst: 11250,
  sgst: 11250,
  igst: 0,
  cess: 0,
  chargesTaxable: 5000,
  lines: [
    { stock: true, name: 'Basmati & Rice <5kg>', unit: 'Kg', qty: 10, freeQty: 1, taxable: 100000 },
    { stock: false, name: 'Delivery', unit: '', qty: 1, freeQty: 0, taxable: 20000 },
  ],
  payments: [],
  discount: 0,
  against: [],
};
const goods = (kind: TallyVoucher['kind'], extra: Partial<TallyVoucher> = {}): TallyVoucher => ({
  ...base,
  kind,
  ...extra,
});
const data = (vouchers: TallyVoucher[]): TallyData => ({
  company: 'Asha & Sons <Traders>',
  ledgerNames: { ...DEFAULT_TALLY_LEDGERS, sales: 'Sales "A/c" & more' },
  parties: [
    {
      ledgerName: NASTY,
      group: 'Sundry Debtors',
      gstin: '29AAPFU0939F1ZV',
      gstType: 'regular',
      stateName: 'Karnataka',
      address: 'Shop 4 & 5, <Market> Road\nMysuru',
      pincode: '570001',
      phone: '9123456789',
      email: 'ravi@example.com',
      openingBalance: 250000,
    },
    {
      ledgerName: 'Supplier One',
      group: 'Sundry Creditors',
      gstin: '',
      gstType: 'consumer',
      stateName: '',
      address: '',
      pincode: '',
      phone: '',
      email: '',
      openingBalance: -5000,
    },
  ],
  stockItems: [
    {
      name: 'Basmati & Rice <5kg>',
      unit: 'Kg',
      hsn: '1006',
      taxBps: 500,
      cessBps: 0,
      exempt: false,
    },
    { name: 'Salt', unit: 'Nos', hsn: '2501', taxBps: 0, cessBps: 0, exempt: true },
  ],
  units: [
    { symbol: 'Kg', uqc: 'KGS' },
    { symbol: 'Nos', uqc: 'NOS' },
  ],
  accounts: [{ name: 'HDFC & Co <Bank>', parent: 'Bank Accounts' }],
  vouchers,
  includeOpening: true,
});

/** Debit/credit entries of one voucher in paise: ledger entries plus stock-line allocations. */
function entries(voucher: XmlNode) {
  const direct = kids(voucher, 'ALLLEDGERENTRIES.LIST');
  const allocations = kids(voucher, 'ALLINVENTORYENTRIES.LIST').flatMap((i) =>
    kids(i, 'ACCOUNTINGALLOCATIONS.LIST'),
  );
  return [...direct, ...allocations].map((e) => ({
    ledger: textOf(e, 'LEDGERNAME'),
    amount: toPaise(textOf(e, 'AMOUNT')),
    deemedPositive: textOf(e, 'ISDEEMEDPOSITIVE'),
  }));
}

const allVouchers = (): TallyVoucher[] => [
  goods('sale'),
  goods('purchase'),
  goods('sale_return'),
  goods('purchase_return'),
  goods('sale', { number: 'INV-0002', igst: 22500, cgst: 0, sgst: 0, total: 147500 }),
  goods('sale', { number: 'INV-0003', total: 147490 }), // negative round-off
  goods('sale', { number: 'INV-0004', cess: 500, total: 148010 }),
  {
    ...base,
    kind: 'payment_in',
    number: 'RCPT-0001',
    total: 60000,
    discount: 1000,
    lines: [],
    chargesTaxable: 0,
    cgst: 0,
    sgst: 0,
    payments: [{ ledger: 'HDFC & Co <Bank>', amount: 59000 }],
    against: [{ ref: 'INV-0001', amount: 50000 }],
  },
  {
    ...base,
    kind: 'payment_out',
    number: 'PAY-0001',
    total: 30000,
    lines: [],
    chargesTaxable: 0,
    cgst: 0,
    sgst: 0,
    payments: [{ ledger: 'Cash', amount: 30000 }],
  },
  {
    ...base,
    kind: 'payment_in',
    number: 'RCPT-0002',
    total: 7000,
    lines: [],
    chargesTaxable: 0,
    cgst: 0,
    sgst: 0,
    payments: [], // nothing recorded: falls back to the cash ledger
  },
];

describe('Tally XML', () => {
  it('produces well-formed masters and vouchers files with the import envelope', () => {
    const d = data(allVouchers());
    const masters = parseXml(buildMastersXml(d));
    const vouchers = parseXml(buildVouchersXml(d));
    expect(masters.name).toBe('ENVELOPE');
    expect(textOf(child(masters, 'HEADER'), 'TALLYREQUEST')).toBe('Import Data');
    const request = child(child(child(masters, 'BODY'), 'IMPORTDATA'), 'REQUESTDESC');
    expect(textOf(request, 'REPORTNAME')).toBe('All Masters');
    expect(textOf(child(request, 'STATICVARIABLES'), 'SVCURRENTCOMPANY')).toBe(d.company);
    const voucherRequest = child(child(child(vouchers, 'BODY'), 'IMPORTDATA'), 'REQUESTDESC');
    expect(textOf(voucherRequest, 'REPORTNAME')).toBe('Vouchers');
    expect(all(vouchers, 'TALLYMESSAGE').every((m) => m.attrs['xmlns:UDF'] === 'TallyUDF')).toBe(
      true,
    );
  });

  it('balances debits and credits to zero in every voucher', () => {
    const root = parseXml(buildVouchersXml(data(allVouchers())));
    const nodes = all(root, 'VOUCHER');
    expect(nodes).toHaveLength(allVouchers().length);
    for (const voucher of nodes) {
      const list = entries(voucher);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(
        list.reduce((n, e) => n + e.amount, 0),
        textOf(voucher, 'VOUCHERNUMBER'),
      ).toBe(0);
      for (const e of list) {
        expect(e.amount).not.toBe(0);
        expect(e.deemedPositive).toBe(e.amount < 0 ? 'Yes' : 'No');
      }
    }
  });

  it('puts the debit/credit on the right side for each voucher type', () => {
    const root = parseXml(buildVouchersXml(data(allVouchers())));
    const byNumber = (type: string) => all(root, 'VOUCHER').find((v) => v.attrs.VCHTYPE === type)!;
    const side = (voucher: XmlNode, ledger: string) =>
      entries(voucher)
        .filter((e) => e.ledger === ledger)
        .reduce((n, e) => n + e.amount, 0);
    const sales = byNumber('Sales'); // first sale
    expect(side(sales, NASTY)).toBe(-147510); // customer debited
    expect(side(sales, 'Sales "A/c" & more')).toBe(100000 + 20000 + 5000);
    expect(side(sales, 'Output CGST')).toBe(11250);
    expect(side(sales, 'Round Off')).toBe(10);
    const purchase = byNumber('Purchase');
    expect(side(purchase, NASTY)).toBe(147510); // supplier credited
    expect(side(purchase, 'Purchase')).toBe(-125000);
    expect(side(purchase, 'Input SGST')).toBe(-11250);
    expect(side(byNumber('Credit Note'), NASTY)).toBe(147510);
    expect(side(byNumber('Credit Note'), 'Output CGST')).toBe(-11250);
    expect(side(byNumber('Debit Note'), NASTY)).toBe(-147510);
    const receipt = byNumber('Receipt');
    expect(side(receipt, NASTY)).toBe(60000);
    expect(side(receipt, 'HDFC & Co <Bank>')).toBe(-59000);
    expect(side(receipt, 'Discount Allowed')).toBe(-1000);
    const payment = byNumber('Payment');
    expect(side(payment, NASTY)).toBe(-30000);
    expect(side(payment, 'Cash')).toBe(30000);
  });

  it('writes stock lines with rate, quantities and a sales allocation', () => {
    const root = parseXml(buildVouchersXml(data([goods('sale')])));
    const voucher = all(root, 'VOUCHER')[0];
    expect(voucher.attrs).toMatchObject({ VCHTYPE: 'Sales', ACTION: 'Create' });
    expect(textOf(voucher, 'DATE')).toBe('20261110');
    expect(textOf(voucher, 'VOUCHERTYPENAME')).toBe(TALLY_VOUCHER_NAMES.sale);
    expect(textOf(voucher, 'PARTYLEDGERNAME')).toBe(NASTY);
    expect(textOf(voucher, 'NARRATION')).toBe('Goods & services <urgent>');
    const item = child(voucher, 'ALLINVENTORYENTRIES.LIST');
    expect(textOf(item, 'STOCKITEMNAME')).toBe('Basmati & Rice <5kg>');
    expect(textOf(item, 'RATE')).toBe('100/Kg');
    expect(textOf(item, 'AMOUNT')).toBe('1000.00');
    expect(textOf(item, 'BILLEDQTY')).toBe('10 Kg');
    expect(textOf(item, 'ACTUALQTY')).toBe('11 Kg');
    expect(textOf(child(item, 'ACCOUNTINGALLOCATIONS.LIST'), 'LEDGERNAME')).toBe(
      'Sales "A/c" & more',
    );
    expect(
      textOf(child(child(voucher, 'ALLLEDGERENTRIES.LIST'), 'BILLALLOCATIONS.LIST'), 'NAME'),
    ).toBe('INV-0001');
  });

  it('escapes & < > " \' in names, addresses and narration, and strips control characters', () => {
    const xml = buildMastersXml(data([])) + buildVouchersXml(data([goods('sale')]));
    expect(xml).not.toContain('Ravi & Sons');
    expect(xml).toContain('Ravi &amp; Sons &lt;Traders&gt; &quot;Best&quot; O&apos;Neil');
    expect(xmlEscape('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(xmlEscape('bell\u0007 and\u0000nul')).toBe('bell and' + 'nul');
    const masters = parseXml(buildMastersXml(data([])));
    const ledger = all(masters, 'LEDGER').find((l) => l.attrs.NAME === NASTY)!;
    expect(textOf(ledger, 'NAME')).toBe(NASTY);
    expect(kids(child(ledger, 'ADDRESS.LIST')!, 'ADDRESS').map((a) => a.text)).toEqual([
      'Shop 4 & 5, <Market> Road',
      'Mysuru',
    ]);
  });

  it('writes masters: party ledgers, stock items with GST, units and standard ledgers', () => {
    const d = data([goods('sale')]);
    const masters = parseXml(buildMastersXml(d));
    const ledgers = all(masters, 'LEDGER');
    const customer = ledgers.find((l) => l.attrs.NAME === NASTY)!;
    expect(textOf(customer, 'PARENT')).toBe('Sundry Debtors');
    expect(textOf(customer, 'PARTYGSTIN')).toBe('29AAPFU0939F1ZV');
    expect(textOf(customer, 'LEDSTATENAME')).toBe('Karnataka');
    expect(textOf(customer, 'PINCODE')).toBe('570001');
    expect(textOf(customer, 'GSTREGISTRATIONTYPE')).toBe('Regular');
    expect(textOf(customer, 'OPENINGBALANCE')).toBe('-2500.00'); // receivable = debit
    const supplier = ledgers.find((l) => l.attrs.NAME === 'Supplier One')!;
    expect(textOf(supplier, 'PARENT')).toBe('Sundry Creditors');
    expect(textOf(supplier, 'OPENINGBALANCE')).toBe('50.00');
    const names = ledgers.map((l) => l.attrs.NAME);
    expect(names).toEqual(
      expect.arrayContaining([
        'Sales "A/c" & more',
        'Output CGST',
        'Output IGST',
        'Round Off',
        'Cash',
      ]),
    );
    expect(names).not.toContain('Purchase'); // no purchase vouchers in this file
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    const cgst = ledgers.find((l) => l.attrs.NAME === 'Output CGST')!;
    expect(textOf(cgst, 'PARENT')).toBe('Duties & Taxes');
    expect(textOf(cgst, 'GSTDUTYHEAD')).toBe('Central Tax');
    const rice = all(masters, 'STOCKITEM').find((s) => s.attrs.NAME === 'Basmati & Rice <5kg>')!;
    expect(textOf(rice, 'BASEUNITS')).toBe('Kg');
    const details = child(rice, 'GSTDETAILS.LIST');
    expect(textOf(details, 'HSNCODE')).toBe('1006');
    expect(textOf(details, 'TAXABILITY')).toBe('Taxable');
    const rates = all(details, 'RATEDETAILS.LIST').map((r) => [
      textOf(r, 'GSTRATEDUTYHEAD'),
      textOf(r, 'GSTRATE'),
    ]);
    expect(rates).toEqual([
      ['Central Tax', '2.5'],
      ['State Tax', '2.5'],
      ['Integrated Tax', '5'],
    ]);
    const salt = all(masters, 'STOCKITEM').find((s) => s.attrs.NAME === 'Salt')!;
    expect(textOf(child(salt, 'GSTDETAILS.LIST'), 'TAXABILITY')).toBe('Exempt');
    const units = all(masters, 'UNIT');
    expect(units.map((u) => [u.attrs.NAME, textOf(u, 'GSTREPUOM')])).toEqual([
      ['Kg', 'KGS-KILOGRAMS'],
      ['Nos', 'NOS-NUMBERS'],
    ]);
    expect(countMasters(d)).toMatchObject({ stockItems: 2, units: 2 });
  });

  it('leaves opening balances out unless asked', () => {
    const xml = buildMastersXml({ ...data([]), includeOpening: false });
    expect(xml).not.toContain('OPENINGBALANCE');
  });

  it('makes duplicate names unique', () => {
    expect(uniqueNames(['Asha', 'asha', 'Ravi', 'Asha'])).toEqual([
      'Asha',
      'asha (2)',
      'Ravi',
      'Asha (3)',
    ]);
  });
});
