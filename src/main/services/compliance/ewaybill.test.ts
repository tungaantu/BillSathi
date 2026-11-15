import { describe, expect, it } from 'vitest';
import { blankTransport, isValidVehicle, normalizeVehicle } from '../../../shared/compliance-api';
import { totals } from '../../../shared/sales';
import { extractPincode, extractPlace, splitAddress } from './common';
import { EWB_VERSION, buildEwayBill, checkEwayBill, ewayCheck, ewayFile } from './ewaybill';
import {
  BUYER_GSTIN_KA,
  BUYER_GSTIN_MH,
  FIRM_GSTIN,
  line,
  source,
} from './compliance-fixture.test-helper';

const transport = {
  ...blankTransport(),
  transporterName: 'Speedy Carriers',
  distanceKm: 150,
  vehicleNo: 'ka-01 ab 1234',
};
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('e-way bill JSON', () => {
  it('builds an intra-state bill with CGST/SGST split, NIC dates and UQC', () => {
    const bill = buildEwayBill(source(), transport);
    expect(bill).toMatchObject({
      userGstin: FIRM_GSTIN,
      supplyType: 'O',
      subSupplyType: 1,
      docType: 'INV',
      docNo: 'INV-0001',
      docDate: '10/11/2026',
      transactionType: 1,
      fromGstin: FIRM_GSTIN,
      fromPincode: 560001,
      fromStateCode: 29,
      actFromStateCode: 29,
      toGstin: BUYER_GSTIN_KA,
      toPincode: 570001,
      toPlace: 'Mysuru',
      toStateCode: 29,
      actToStateCode: 29,
      totalValue: 100000,
      cgstValue: 9000,
      sgstValue: 9000,
      igstValue: 0,
      cessValue: 0,
      otherValue: 0,
      totInvValue: 118000,
      transMode: '1',
      transDistance: '150',
      vehicleNo: 'KA01AB1234',
      vehicleType: 'R',
    });
    expect(bill.itemList).toEqual([
      expect.objectContaining({
        productName: 'Basmati Rice',
        hsnCode: 1006,
        quantity: 100,
        qtyUnit: 'KGS',
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
        taxableAmount: 100000,
      }),
    ]);
  });

  it('builds an inter-state bill with IGST and different from/to state codes', () => {
    const bill = buildEwayBill(
      source({ place: '27', buyerAddress: 'Plot 9, Andheri East, Mumbai 400069' }),
      transport,
    );
    expect(bill).toMatchObject({
      fromStateCode: 29,
      actFromStateCode: 29,
      toGstin: BUYER_GSTIN_MH,
      toStateCode: 27,
      actToStateCode: 27,
      toPlace: 'Mumbai',
      toPincode: 400069,
      cgstValue: 0,
      sgstValue: 0,
      igstValue: 18000,
      totInvValue: 118000,
    });
    expect(bill.itemList[0]).toMatchObject({ cgstRate: 0, sgstRate: 0, igstRate: 18 });
  });

  it('reconciles with gst-calc when there are discounts, charges and round-off', () => {
    const src = source({
      doc: {
        lines: [
          line({ discountBps: 500 }),
          line({ name: 'Sugar', price: 4533, qty: 7.5, taxBps: 500 }),
        ],
        charges: [{ name: 'Freight', amount: 25050, taxBps: 1800 }],
        discount: 1234,
        roundMode: 'nearest',
        roundStep: 100,
      },
    });
    const bill = buildEwayBill(src, transport);
    const c = totals(src.doc, '29');
    const paise = (rupees: number) => Math.round(rupees * 100);
    expect(paise(bill.totInvValue)).toBe(c.total);
    expect(
      paise(bill.totalValue) +
        paise(bill.cgstValue) +
        paise(bill.sgstValue) +
        paise(bill.igstValue) +
        paise(bill.cessValue) +
        paise(bill.otherValue),
    ).toBe(c.total);
    expect(bill.itemList.reduce((n, i) => n + paise(i.taxableAmount), 0)).toBe(
      paise(bill.totalValue),
    );
    expect(bill.otherValue).not.toBe(0);
  });

  it('wraps bills in the NIC bulk file shape', () => {
    const file = ewayFile([buildEwayBill(source(), transport)]);
    expect(file.version).toBe(EWB_VERSION);
    expect(file.billLists).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(file)).billLists[0].docDate).toBe('10/11/2026');
  });

  it('treats a sale return as an inward bill from the customer', () => {
    const src = source({ doc: { type: 'sale_return', prefix: 'CN-' } });
    const bill = buildEwayBill(src, transport);
    expect(bill).toMatchObject({
      supplyType: 'I',
      subSupplyType: 7,
      docType: 'CNT',
      fromGstin: BUYER_GSTIN_KA,
      toGstin: FIRM_GSTIN,
    });
  });

  it('uses URP for an unregistered buyer', () => {
    const src = source({ buyerGstin: '' });
    src.party.gstin = '';
    const result = ewayCheck(src, transport);
    expect(codes(result.issues)).toContain('partyGstinMissing');
    expect(result.bill?.toGstin).toBe('URP');
  });
});

describe('e-way bill validation', () => {
  it('lists missing pincode, GSTIN and HSN with where to fix them', () => {
    const src = source({
      firm: { gstin: '', address: 'Bengaluru' },
      buyerAddress: 'Market Road, Mysuru',
      doc: { lines: [line({ hsn: '' }), line({ hsn: '12' })] },
    });
    const result = ewayCheck(src, transport);
    expect(result.bill).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'firmGstin', severity: 'error', fix: 'profile' }),
        expect.objectContaining({ code: 'firmPincode', severity: 'error', fix: 'profile' }),
        expect.objectContaining({ code: 'partyPincode', severity: 'error', fix: 'party' }),
        expect.objectContaining({ code: 'itemHsn', severity: 'error', fix: 'item' }),
      ]),
    );
    expect(result.issues.filter((i) => i.code === 'itemHsn')).toHaveLength(2);
  });

  it('warns, but still builds, when the invoice is below ₹50,000', () => {
    const src = source({ doc: { lines: [line({ qty: 10, price: 100000 })] } }); // Rs 11,800
    const result = ewayCheck(src, transport);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'belowThreshold', severity: 'warning' }),
    ]);
    expect(result.bill).not.toBeNull();
    expect(codes(checkEwayBill(source(), transport))).not.toContain('belowThreshold');
  });

  it('rejects bad vehicle numbers and transporter IDs, asks for Part B details', () => {
    expect(codes(checkEwayBill(source(), { ...transport, vehicleNo: 'XX' }))).toContain(
      'vehicleFormat',
    );
    expect(
      codes(checkEwayBill(source(), { ...transport, transporterId: '29ABCDE1234F1Z0' })),
    ).toContain('transporterId');
    expect(codes(checkEwayBill(source(), blankTransport()))).toContain('partB');
    expect(codes(checkEwayBill(source(), { ...transport, mode: 'rail' }))).toContain('transDoc');
  });

  it('only allows sale invoices and sale returns', () => {
    const result = ewayCheck(source({ doc: { type: 'estimate' } }), transport);
    expect(codes(result.issues)).toContain('ewbDocType');
  });
});

describe('vehicle numbers and address helpers', () => {
  it.each([
    'KA01AB1234',
    'ka 01 ab 1234',
    'MH12DE1433',
    'DL1CAB1234',
    'KA011234',
    '22BH1234AB',
    '',
  ])('accepts %s', (v) => expect(isValidVehicle(v)).toBe(true));
  it.each(['KA', '1234', 'KA01AB12', 'ABCDEFGHIJ', 'KA01AB12345'])('rejects %s', (v) =>
    expect(isValidVehicle(v)).toBe(false),
  );
  it('normalises vehicle numbers', () =>
    expect(normalizeVehicle('ka-01 ab 1234')).toBe('KA01AB1234'));
  it('extracts PIN, place and address lines', () => {
    expect(extractPincode('Shop 4, Market Road, Mysuru 570001')).toBe(570001);
    expect(extractPincode('Phone 9876543210, no pin')).toBeNull();
    expect(extractPlace('Shop 4, Market Road, Mysuru - 570001', '29')).toBe('Mysuru');
    expect(extractPlace('', '29')).toBe('Karnataka');
    const [one, two] = splitAddress(`${'A very long street name '.repeat(8)} 560001`);
    expect(one.length).toBeLessThanOrEqual(100);
    expect(two.length).toBeLessThanOrEqual(100);
    expect(one + two).not.toContain('560001');
  });
});
