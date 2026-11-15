import { describe, expect, it } from 'vitest';
import { totals } from '../../../shared/sales';
import { EINVOICE_VERSION, buildEinvoice, checkEinvoice, einvoiceCheck } from './einvoice';
import {
  BUYER_GSTIN_KA,
  BUYER_GSTIN_MH,
  FIRM_GSTIN,
  line,
  source,
} from './compliance-fixture.test-helper';

const paise = (rupees: number) => Math.round(rupees * 100);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('e-invoice JSON (IRP v1.1)', () => {
  it('has the schema sections, NIC dates and party details', () => {
    const json = buildEinvoice(source(), { supplyType: 'B2B' });
    expect(json).toMatchObject({
      Version: EINVOICE_VERSION,
      TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
      DocDtls: { Typ: 'INV', No: 'INV-0001', Dt: '10/11/2026' },
      SellerDtls: { Gstin: FIRM_GSTIN, Pin: 560001, Stcd: '29' },
      BuyerDtls: { Gstin: BUYER_GSTIN_KA, Pos: '29', Pin: 570001, Stcd: '29', Loc: 'Mysuru' },
    });
    expect(json.ItemList[0]).toMatchObject({
      SlNo: '1',
      PrdDesc: 'Basmati Rice',
      IsServc: 'N',
      HsnCd: '1006',
      Qty: 100,
      Unit: 'KGS',
      UnitPrice: 1000,
      TotAmt: 100000,
      Discount: 0,
      AssAmt: 100000,
      GstRt: 18,
      CgstAmt: 9000,
      SgstAmt: 9000,
      IgstAmt: 0,
      TotItemVal: 118000,
    });
    expect(json.ValDtls).toMatchObject({
      AssVal: 100000,
      CgstVal: 9000,
      SgstVal: 9000,
      IgstVal: 0,
      RndOffAmt: 0,
      TotInvVal: 118000,
    });
  });

  it('uses IGST, the customer state for Stcd and the supply place for Pos', () => {
    const json = buildEinvoice(source({ place: '27' }), { supplyType: 'B2B' });
    expect(json.BuyerDtls).toMatchObject({ Gstin: BUYER_GSTIN_MH, Pos: '27', Stcd: '27' });
    expect(json.ItemList[0]).toMatchObject({ IgstAmt: 18000, CgstAmt: 0, SgstAmt: 0 });
    expect(json.ValDtls.IgstVal).toBe(18000);
  });

  function reconcile(src: ReturnType<typeof source>) {
    const json = buildEinvoice(src, { supplyType: 'B2B' });
    const c = totals(src.doc, '29');
    const sum = (pick: (i: (typeof json.ItemList)[number]) => number) =>
      json.ItemList.reduce((n, i) => n + paise(pick(i)), 0);
    // Totals come straight from gst-calc.
    expect(paise(json.ValDtls.AssVal)).toBe(c.taxable);
    expect(paise(json.ValDtls.CgstVal)).toBe(c.cgst);
    expect(paise(json.ValDtls.SgstVal)).toBe(c.sgst);
    expect(paise(json.ValDtls.IgstVal)).toBe(c.igst);
    expect(paise(json.ValDtls.CesVal)).toBe(c.cess);
    expect(paise(json.ValDtls.RndOffAmt)).toBe(c.roundOff);
    expect(paise(json.ValDtls.TotInvVal)).toBe(c.total);
    // Items add up to the totals, and each item is internally consistent.
    expect(sum((i) => i.AssAmt)).toBe(c.taxable);
    expect(sum((i) => i.CgstAmt)).toBe(c.cgst);
    expect(sum((i) => i.SgstAmt)).toBe(c.sgst);
    expect(sum((i) => i.IgstAmt)).toBe(c.igst);
    expect(sum((i) => i.CesAmt)).toBe(c.cess);
    expect(sum((i) => i.TotItemVal) + c.roundOff).toBe(c.total);
    for (const item of json.ItemList) {
      expect(paise(item.TotAmt) - paise(item.Discount)).toBe(paise(item.AssAmt));
      expect(
        paise(item.AssAmt) +
          paise(item.CgstAmt) +
          paise(item.SgstAmt) +
          paise(item.IgstAmt) +
          paise(item.CesAmt) +
          paise(item.OthChrg),
      ).toBe(paise(item.TotItemVal));
    }
    expect(
      paise(json.ValDtls.AssVal) +
        paise(json.ValDtls.CgstVal) +
        paise(json.ValDtls.SgstVal) +
        paise(json.ValDtls.IgstVal) +
        paise(json.ValDtls.CesVal) +
        paise(json.ValDtls.OthChrg) -
        paise(json.ValDtls.Discount) +
        paise(json.ValDtls.RndOffAmt),
    ).toBe(paise(json.ValDtls.TotInvVal));
    return json;
  }

  it('reconciles a plain invoice', () => {
    reconcile(source());
  });

  it('reconciles with line discounts, a bill discount and rounding', () => {
    const json = reconcile(
      source({
        doc: {
          lines: [
            line({ discountBps: 750 }),
            line({
              name: 'Sugar',
              hsn: '1701',
              price: 4533,
              qty: 7.5,
              taxBps: 500,
              discountAmount: 333,
            }),
          ],
          discount: 1234,
          roundMode: 'nearest',
          roundStep: 100,
        },
      }),
    );
    expect(json.ItemList[0].Discount).toBeGreaterThan(0);
    expect(json.ValDtls.RndOffAmt).not.toBe(0);
  });

  it('sends additional charges as taxed service items so totals still match', () => {
    const json = reconcile(
      source({
        doc: {
          charges: [
            { name: 'Freight', amount: 25050, taxBps: 1800 },
            { name: 'Packing', amount: 1000, taxBps: 0 },
          ],
          discount: 5000,
          roundMode: 'down',
          roundStep: 10,
        },
        place: '27',
      }),
    );
    expect(json.ItemList).toHaveLength(3);
    expect(json.ItemList[1]).toMatchObject({
      PrdDesc: 'Freight',
      IsServc: 'Y',
      HsnCd: '9997',
      Qty: 1,
      Unit: 'OTH',
    });
    expect(json.ValDtls.OthChrg).toBe(0);
  });

  it('reconciles tax-inclusive prices, cess and free quantity', () => {
    const json = reconcile(
      source({
        doc: {
          lines: [
            line({ inclusive: true, price: 11800, qty: 3, discountBps: 1000 }),
            line({
              name: 'Cola',
              hsn: '2202',
              cessBps: 1200,
              taxBps: 2800,
              freeQty: 1,
              qty: 12,
              price: 2000,
            }),
          ],
        },
      }),
    );
    expect(json.ItemList[1]).toMatchObject({ FreeQty: 1, CesRt: 12 });
    expect(json.ValDtls.CesVal).toBeGreaterThan(0);
  });

  it('makes a credit note that points to the original invoice', () => {
    const src = source({ doc: { type: 'sale_return', prefix: 'CN-', number: 3 } });
    src.original = { prefix: 'INV-', number: 1, date: '2026-11-01' };
    const json = buildEinvoice(src, { supplyType: 'B2B' });
    expect(json.DocDtls).toMatchObject({ Typ: 'CRN', No: 'CN-0003' });
    expect(json.PrecDocDtls).toEqual([{ InvNo: 'INV-0001', InvDt: '01/11/2026' }]);
    expect(codes(checkEinvoice(src))).not.toContain('creditNoteRef');
    expect(codes(checkEinvoice(source({ doc: { type: 'sale_return', prefix: 'CN-' } })))).toContain(
      'creditNoteRef',
    );
  });
});

describe('e-invoice validation panel', () => {
  it('passes a complete B2B invoice', () => {
    const result = einvoiceCheck(source(), { supplyType: 'B2B' });
    expect(result.issues).toEqual([]);
    expect(result.json).not.toBeNull();
    expect(result.summary).toMatchObject({ total: 11800000, taxable: 10000000, tax: 1800000 });
  });

  it('lists everything missing and refuses to build', () => {
    const src = source({
      buyerGstin: '',
      buyerAddress: 'Market Road',
      firm: { gstin: 'BAD', address: '' },
      doc: { lines: [line({ hsn: '' })], date: '2999-01-01', prefix: 'inv-' },
    });
    src.party.gstin = '';
    const result = einvoiceCheck(src, { supplyType: 'B2B' });
    expect(result.json).toBeNull();
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining([
        'firmGstin',
        'firmAddress',
        'buyerGstin',
        'partyPincode',
        'itemHsn',
        'einvDocNo',
        'docDateFuture',
      ]),
    );
  });

  it('flags the same GSTIN on both sides, bad rates, and non-sale documents', () => {
    const same = source({ buyerGstin: FIRM_GSTIN });
    same.party.gstin = FIRM_GSTIN;
    expect(codes(checkEinvoice(same))).toContain('sameGstin');
    expect(codes(checkEinvoice(source({ doc: { lines: [line({ taxBps: 1700 })] } })))).toContain(
      'gstRate',
    );
    expect(codes(checkEinvoice(source({ doc: { type: 'sale_order' } })))).toContain('einvDocType');
  });
});
