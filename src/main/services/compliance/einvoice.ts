import { totals } from '../../../shared/sales';
import { displayDocumentNumber } from '../../../shared/numbering';
import { validateGSTIN } from '../../../shared/gstin';
import { decimalScaled, divideRound, safeNumber, sumPaise } from '../../../shared/money';
import { today } from '../../../shared/masters';
import type { CheckResult, ComplianceIssue, EinvoiceOptions } from '../../../shared/compliance-api';
import {
  dmy,
  extractPincode,
  extractPlace,
  gstinState,
  hasErrors,
  hsnDigits,
  isHsn,
  issue,
  rupees,
  splitAddress,
  type ComplianceSource,
} from './common';
import { uqcFor } from './uqc';

/**
 * NIC e-Invoice (IRP) JSON, schema version 1.1 - the file you upload at einvoice1.gst.gov.in
 * (Bulk Generation) or send to an IRP API.
 *
 *   Version "1.1"
 *   TranDtls  TaxSch "GST", SupTyp B2B|SEZWP|SEZWOP, RegRev Y|N, IgstOnIntra Y|N
 *   DocDtls   Typ INV|CRN|DBN, No (max 16 chars, upper-case, no leading 0), Dt dd/mm/yyyy
 *   SellerDtls / BuyerDtls  Gstin, LglNm, Addr1, Addr2, Loc, Pin, Stcd (+ Pos for the buyer)
 *   ItemList  SlNo, PrdDesc, IsServc, HsnCd, Qty, Unit (UQC), UnitPrice, TotAmt, Discount,
 *             AssAmt, GstRt, Igst/Cgst/SgstAmt, CesRt/CesAmt, TotItemVal
 *   ValDtls   AssVal, CgstVal, SgstVal, IgstVal, CesVal, Discount, OthChrg, RndOffAmt, TotInvVal
 *
 * Mapping decisions (so the numbers reconcile exactly with the app's own invoice totals):
 *  - ItemList carries every discount (line + share of the bill discount) in `Discount`, so
 *    AssAmt = TotAmt - Discount is the same taxable value the tax was computed on.
 *  - Additional charges are sent as service items (SAC 9997) because they are taxed lines;
 *    that keeps ValDtls.OthChrg and ValDtls.Discount at 0 and TotInvVal = sum(TotItemVal)+RndOff.
 */
export const EINVOICE_VERSION = '1.1';
export const EINVOICE_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 14, 18, 28, 40];

export interface EinvoiceItem {
  SlNo: string;
  PrdDesc: string;
  IsServc: 'Y' | 'N';
  HsnCd: string;
  Qty: number;
  FreeQty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  AssAmt: number;
  GstRt: number;
  IgstAmt: number;
  CgstAmt: number;
  SgstAmt: number;
  CesRt: number;
  CesAmt: number;
  OthChrg: number;
  TotItemVal: number;
}
interface Party {
  Gstin: string;
  LglNm: string;
  Addr1: string;
  Addr2?: string;
  Loc: string;
  Pin: number;
  Stcd: string;
  Pos?: string;
  Ph?: string;
  Em?: string;
}
export interface Einvoice {
  Version: string;
  TranDtls: {
    TaxSch: 'GST';
    SupTyp: string;
    RegRev: 'Y' | 'N';
    IgstOnIntra: 'Y' | 'N';
  };
  DocDtls: { Typ: 'INV' | 'CRN'; No: string; Dt: string };
  SellerDtls: Party;
  BuyerDtls: Party;
  ShipDtls?: Omit<Party, 'Pos' | 'Ph' | 'Em'>;
  ItemList: EinvoiceItem[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
  PrecDocDtls?: { InvNo: string; InvDt: string }[];
}

const IRP_DOC_NO = /^[A-Z1-9][A-Z0-9/-]{0,15}$/;

export function checkEinvoice(src: ComplianceSource): ComplianceIssue[] {
  const { firm, party, doc } = src;
  const issues: ComplianceIssue[] = [];
  const add = (...args: Parameters<typeof issue>) => issues.push(issue(...args));
  if (doc.type !== 'sale' && doc.type !== 'sale_return') add('error', 'einvDocType', 'invoice');
  if (!validateGSTIN(firm.gstin)) add('error', 'firmGstin', 'profile');
  if (!firm.address.trim()) add('error', 'firmAddress', 'profile');
  else if (!extractPincode(firm.address)) add('error', 'firmPincode', 'profile');
  if (!party.gstin) add('error', 'buyerGstin', 'party');
  else if (!validateGSTIN(party.gstin)) add('error', 'partyGstin', 'party');
  else if (party.gstin === firm.gstin) add('error', 'sameGstin', 'party');
  if (!party.address.trim()) add('error', 'partyAddress', 'party');
  else if (!extractPincode(party.address)) add('error', 'partyPincode', 'party');
  if (src.shippingAddress.trim() && !extractPincode(src.shippingAddress))
    add('warning', 'shipPincode', 'party');
  const number = displayDocumentNumber(doc);
  if (!IRP_DOC_NO.test(number)) add('error', 'einvDocNo', 'invoice', { number });
  if (doc.date > today()) add('error', 'docDateFuture', 'invoice');
  if (doc.type === 'sale_return' && !src.original) add('warning', 'creditNoteRef', 'invoice');
  doc.lines.forEach((line, i) => {
    if (!isHsn(line.hsn)) add('error', 'itemHsn', 'item', { name: line.name, line: i + 1 });
    if (!EINVOICE_GST_RATES.includes(line.taxBps / 100))
      add('warning', 'gstRate', 'item', { name: line.name, rate: line.taxBps / 100 });
  });
  doc.charges.forEach((charge) => {
    if (!EINVOICE_GST_RATES.includes(charge.taxBps / 100))
      add('warning', 'gstRate', 'invoice', { name: charge.name, rate: charge.taxBps / 100 });
  });
  return issues;
}

/** Decimal rupees from milli-rupees (3 places) kept exact through BigInt. */
const milli = (value: bigint) =>
  Number(`${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`);

export function buildEinvoice(src: ComplianceSource, options: EinvoiceOptions): Einvoice {
  const { firm, party, doc } = src;
  const firmState = doc.firmState ?? firm.stateCode;
  const c = totals(doc, firmState);
  const [sellerA1, sellerA2] = splitAddress(firm.address);
  const [buyerA1, buyerA2] = splitAddress(party.address);
  const seller: Party = {
    Gstin: firm.gstin,
    LglNm: firm.name,
    Addr1: sellerA1,
    ...(sellerA2 ? { Addr2: sellerA2 } : {}),
    Loc: extractPlace(firm.address, firm.stateCode),
    Pin: extractPincode(firm.address) ?? 0,
    Stcd: gstinState(firm.gstin) || firm.stateCode,
    ...(/^\d{6,12}$/.test(firm.phone) ? { Ph: firm.phone } : {}),
    ...(firm.email.length >= 6 ? { Em: firm.email } : {}),
  };
  const buyer: Party = {
    Gstin: party.gstin,
    LglNm: party.name,
    Pos: doc.placeOfSupply,
    Addr1: buyerA1,
    ...(buyerA2 ? { Addr2: buyerA2 } : {}),
    Loc: extractPlace(party.address, party.stateCode || doc.placeOfSupply),
    Pin: extractPincode(party.address) ?? 0,
    Stcd: gstinState(party.gstin) || party.stateCode || doc.placeOfSupply,
    ...(/^\d{6,12}$/.test(party.phone) ? { Ph: party.phone } : {}),
    ...(party.email.length >= 6 ? { Em: party.email } : {}),
  };
  const shipPin = extractPincode(src.shippingAddress);
  const ship =
    src.shippingAddress.trim() && shipPin && src.shippingAddress.trim() !== party.address.trim()
      ? (() => {
          const [a1, a2] = splitAddress(src.shippingAddress);
          return {
            Gstin: party.gstin,
            LglNm: party.name,
            Addr1: a1,
            ...(a2 ? { Addr2: a2 } : {}),
            Loc: extractPlace(src.shippingAddress, doc.placeOfSupply),
            Pin: shipPin,
            Stcd: doc.placeOfSupply,
          };
        })()
      : undefined;

  const item = (
    index: number,
    name: string,
    hsn: string,
    qty: number,
    freeQty: number,
    unit: string,
    price: number,
    inclusive: boolean,
    taxBps: number,
    cessBps: number,
    r: (typeof c.lines)[number],
  ): EinvoiceItem => {
    const totalDiscount = sumPaise([r.discount, r.transactionDiscount]);
    // Inclusive prices carry GST inside the discount too; bring it back to a pre-tax figure.
    const discount = inclusive
      ? sumPaise([
          safeNumber(divideRound(BigInt(r.discount) * 10000n, BigInt(10000 + taxBps + cessBps))),
          r.transactionDiscount,
        ])
      : totalDiscount;
    const totAmt = sumPaise([r.taxable, discount]);
    const qtyScaled = decimalScaled(qty, 3);
    const unitPrice =
      inclusive && qtyScaled > 0n
        ? milli(divideRound(BigInt(totAmt) * 10_000n, qtyScaled))
        : milli(BigInt(price) * 10n);
    const hsnClean = hsnDigits(hsn);
    return {
      SlNo: String(index + 1),
      PrdDesc: name.slice(0, 300),
      IsServc: hsnClean.startsWith('99') ? 'Y' : 'N',
      HsnCd: hsnClean,
      Qty: qty,
      FreeQty: freeQty,
      Unit: unit,
      UnitPrice: unitPrice,
      TotAmt: rupees(totAmt),
      Discount: rupees(discount),
      AssAmt: rupees(r.taxable),
      GstRt: taxBps / 100,
      IgstAmt: rupees(r.igst),
      CgstAmt: rupees(r.cgst),
      SgstAmt: rupees(r.sgst),
      CesRt: cessBps / 100,
      CesAmt: rupees(r.cess),
      OthChrg: 0,
      TotItemVal: rupees(r.total),
    };
  };
  const lines = doc.lines.map((line, i) => {
    const unitRef = line.unitId ? src.units[line.unitId] : undefined;
    return item(
      i,
      line.name,
      line.hsn,
      Number(line.qty),
      Number(line.freeQty),
      uqcFor(unitRef?.symbol || unitRef?.name),
      line.price,
      line.inclusive,
      line.taxBps,
      line.cessBps,
      c.lines[i],
    );
  });
  const charges = doc.charges.map((charge, i) =>
    item(
      doc.lines.length + i,
      charge.name,
      '9997',
      1,
      0,
      'OTH',
      charge.amount,
      false,
      charge.taxBps,
      0,
      c.charges[i],
    ),
  );
  return {
    Version: EINVOICE_VERSION,
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: options.supplyType,
      RegRev: 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: doc.type === 'sale_return' ? 'CRN' : 'INV',
      No: displayDocumentNumber(doc),
      Dt: dmy(doc.date),
    },
    SellerDtls: seller,
    BuyerDtls: buyer,
    ...(ship ? { ShipDtls: ship } : {}),
    ItemList: [...lines, ...charges],
    ValDtls: {
      AssVal: rupees(c.taxable),
      CgstVal: rupees(c.cgst),
      SgstVal: rupees(c.sgst),
      IgstVal: rupees(c.igst),
      CesVal: rupees(c.cess),
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: rupees(c.roundOff),
      TotInvVal: rupees(c.total),
    },
    ...(doc.type === 'sale_return' && src.original
      ? {
          PrecDocDtls: [
            {
              InvNo: displayDocumentNumber({ firmId: src.firm.id, type: 'sale', ...src.original }),
              InvDt: dmy(src.original.date),
            },
          ],
        }
      : {}),
  };
}

export function einvoiceCheck(
  src: ComplianceSource,
  options: EinvoiceOptions,
): CheckResult & { json: Einvoice | null } {
  const issues = checkEinvoice(src);
  const c = totals(src.doc, src.doc.firmState ?? src.firm.stateCode);
  return {
    issues,
    json: hasErrors(issues) ? null : buildEinvoice(src, options),
    summary: {
      total: c.total,
      taxable: c.taxable,
      tax: sumPaise([c.cgst, c.sgst, c.igst, c.cess]),
      items: src.doc.lines.length + src.doc.charges.length,
    },
    record: {},
  };
}
