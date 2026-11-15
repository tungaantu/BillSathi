import { paiseToDecimal } from '../../../shared/money';
import {
  TALLY_VOUCHER_NAMES,
  type TallyLedgerNames,
  type TallyVoucherKind,
} from '../../../shared/compliance-api';
import { tallyUom } from './uqc';

/**
 * Tally Prime import XML (Gateway of Tally -> Import -> Masters / Transactions).
 * Two files are produced: one with REPORTNAME "All Masters" and one with "Vouchers".
 *
 * Sign convention used by Tally's XML: a DEBIT amount is negative (ISDEEMEDPOSITIVE "Yes"),
 * a CREDIT amount is positive (ISDEEMEDPOSITIVE "No"). Every voucher built here sums to zero:
 *   ledger entries (party, GST, round-off, direct sales/purchase) + the accounting allocations
 *   inside each stock-item line = 0.
 */

export interface TallyParty {
  ledgerName: string;
  group: 'Sundry Debtors' | 'Sundry Creditors';
  gstin: string;
  gstType: 'consumer' | 'regular' | 'composition';
  stateName: string;
  address: string;
  pincode: string;
  phone: string;
  email: string;
  /** Paise; positive = they owe us (debit). */
  openingBalance: number;
}
export interface TallyStockItem {
  name: string;
  unit: string;
  hsn: string;
  taxBps: number;
  cessBps: number;
  exempt: boolean;
}
export interface TallyUnitMaster {
  symbol: string;
  uqc: string;
}
export interface TallyAccountLedger {
  name: string;
  parent: 'Cash-in-Hand' | 'Bank Accounts';
}
export interface TallyVoucherLine {
  /** True when this is a stock item (inventory entry); false for services / free text. */
  stock: boolean;
  name: string;
  unit: string;
  qty: number;
  freeQty: number;
  /** Taxable value in paise after all discounts. */
  taxable: number;
}
export interface TallyVoucher {
  kind: TallyVoucherKind;
  number: string;
  /** yyyy-mm-dd */
  date: string;
  partyName: string;
  partyGstin: string;
  placeOfSupply: string;
  narration: string;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  lines: TallyVoucherLine[];
  /** Taxable value of additional charges, posted straight to the sales/purchase ledger. */
  chargesTaxable: number;
  /** Receipts / payments: money moved through each cash or bank ledger. */
  payments: { ledger: string; amount: number }[];
  discount: number;
  /** Receipts / payments: invoices settled (bill references). */
  against: { ref: string; amount: number }[];
}
export interface TallyData {
  company: string;
  ledgerNames: TallyLedgerNames;
  parties: TallyParty[];
  stockItems: TallyStockItem[];
  units: TallyUnitMaster[];
  accounts: TallyAccountLedger[];
  vouchers: TallyVoucher[];
  includeOpening: boolean;
}

/** Remove characters XML 1.0 cannot carry, then escape the five special characters. */
export function xmlEscape(value: unknown): string {
  return (
    String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
      )
  );
}
const tag = (name: string, value: unknown) => `<${name}>${xmlEscape(value)}</${name}>`;
const wrap = (name: string, inner: string, attrs = '') => `<${name}${attrs}>${inner}</${name}>`;
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
/** Signed rupee text; Tally wants "-1180.00" for a debit of Rs 1,180. */
const amount = (paise: number) => paiseToDecimal(paise);
const dateText = (iso: string) => iso.replace(/-/g, '');
const qtyText = (qty: number, unit: string) => `${qty} ${unit}`.trim();

/** Make duplicate names unique ("Asha", "Asha (2)") because Tally ledger names are unique. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = name.trim() || '-';
    const key = base.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

const GST_HEADS = {
  cgst: 'Central Tax',
  sgst: 'State Tax',
  igst: 'Integrated Tax',
  cess: 'Cess',
} as const;

function envelope(report: string, company: string, messages: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>${xmlEscape(report)}</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
${messages.map((m) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${m}\n    </TALLYMESSAGE>`).join('\n')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

const names = (name: string) =>
  wrap('LANGUAGENAME.LIST', wrap('NAME.LIST', tag('NAME', name), ' TYPE="String"'));

function unitXml(unit: TallyUnitMaster): string {
  return wrap(
    'UNIT',
    [
      tag('NAME', unit.symbol),
      tag('ISSIMPLEUNIT', 'Yes'),
      tag('GSTREPUOM', tallyUom(unit.uqc)),
    ].join(''),
    ` NAME="${xmlEscape(unit.symbol)}" RESERVEDNAME=""`,
  );
}

function ledgerXml(name: string, parent: string, extra = ''): string {
  return wrap(
    'LEDGER',
    [tag('NAME', name), names(name), tag('PARENT', parent), extra].join(''),
    ` NAME="${xmlEscape(name)}" RESERVEDNAME=""`,
  );
}

function partyXml(party: TallyParty, includeOpening: boolean): string {
  const registration =
    party.gstType === 'composition'
      ? 'Composition'
      : party.gstType === 'regular' || party.gstin
        ? 'Regular'
        : 'Consumer';
  const parts = [
    tag('ISBILLWISEON', 'Yes'),
    party.address
      ? wrap(
          'ADDRESS.LIST',
          party.address
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => tag('ADDRESS', line))
            .join(''),
          ' TYPE="String"',
        )
      : '',
    tag('COUNTRYNAME', 'India'),
    party.stateName ? tag('LEDSTATENAME', party.stateName) : '',
    party.pincode ? tag('PINCODE', party.pincode) : '',
    tag('GSTREGISTRATIONTYPE', registration),
    party.gstin ? tag('PARTYGSTIN', party.gstin) : '',
    party.phone ? tag('LEDGERPHONE', party.phone) : '',
    party.email ? tag('EMAIL', party.email) : '',
    includeOpening && party.openingBalance
      ? tag('OPENINGBALANCE', amount(-party.openingBalance))
      : '',
  ];
  return ledgerXml(party.ledgerName, party.group, parts.join(''));
}

function stockItemXml(item: TallyStockItem): string {
  const rate = (head: string, value: number) =>
    wrap(
      'RATEDETAILS.LIST',
      [
        tag('GSTRATEDUTYHEAD', head),
        tag('GSTRATEVALUATIONTYPE', 'Based on Value'),
        tag('GSTRATE', value / 100),
      ].join(''),
    );
  const half = item.taxBps / 2;
  const details = wrap(
    'GSTDETAILS.LIST',
    [
      tag('APPLICABLEFROM', '20170701'),
      tag('CALCULATIONTYPE', 'On Value'),
      item.hsn ? tag('HSNCODE', item.hsn) : '',
      tag('TAXABILITY', item.exempt ? 'Exempt' : item.taxBps === 0 ? 'Nil Rated' : 'Taxable'),
      wrap(
        'STATEWISEDETAILS.LIST',
        [
          tag('STATENAME', 'Any'),
          rate(GST_HEADS.cgst, half),
          rate(GST_HEADS.sgst, half),
          rate(GST_HEADS.igst, item.taxBps),
          item.cessBps ? rate(GST_HEADS.cess, item.cessBps) : '',
        ].join(''),
      ),
    ].join(''),
  );
  return wrap(
    'STOCKITEM',
    [
      tag('NAME', item.name),
      names(item.name),
      tag('BASEUNITS', item.unit),
      tag('GSTAPPLICABLE', 'Applicable'),
      tag('GSTTYPEOFSUPPLY', 'Goods'),
      details,
    ].join(''),
    ` NAME="${xmlEscape(item.name)}" RESERVEDNAME=""`,
  );
}

/** Standard ledgers every Tally company needs before vouchers can be imported. */
function standardLedgers(data: TallyData): { name: string; parent: string; extra: string }[] {
  const n = data.ledgerNames;
  const gst = (head: string) => tag('TAXTYPE', 'GST') + tag('GSTDUTYHEAD', head);
  const used = new Set(data.vouchers.map((v) => v.kind));
  const salesSide =
    data.vouchers.length === 0 ||
    ['sale', 'sale_return'].some((k) => used.has(k as TallyVoucherKind));
  const purchaseSide =
    data.vouchers.length === 0 ||
    ['purchase', 'purchase_return'].some((k) => used.has(k as TallyVoucherKind));
  const list: { name: string; parent: string; extra: string }[] = [];
  if (salesSide) {
    list.push({ name: n.sales, parent: 'Sales Accounts', extra: '' });
    list.push({ name: n.outputCgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.cgst) });
    list.push({ name: n.outputSgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.sgst) });
    list.push({ name: n.outputIgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.igst) });
    list.push({ name: n.outputCess, parent: 'Duties & Taxes', extra: gst(GST_HEADS.cess) });
  }
  if (purchaseSide) {
    list.push({ name: n.purchase, parent: 'Purchase Accounts', extra: '' });
    list.push({ name: n.inputCgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.cgst) });
    list.push({ name: n.inputSgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.sgst) });
    list.push({ name: n.inputIgst, parent: 'Duties & Taxes', extra: gst(GST_HEADS.igst) });
    list.push({ name: n.inputCess, parent: 'Duties & Taxes', extra: gst(GST_HEADS.cess) });
  }
  list.push({ name: n.roundOff, parent: 'Indirect Expenses', extra: '' });
  list.push({ name: n.discount, parent: 'Indirect Expenses', extra: '' });
  list.push({ name: n.cash, parent: 'Cash-in-Hand', extra: '' });
  for (const account of data.accounts)
    list.push({ name: account.name, parent: account.parent, extra: '' });
  const seen = new Set<string>();
  return list.filter((l) => {
    const key = l.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildMastersXml(data: TallyData): string {
  const standard = standardLedgers(data);
  const taken = new Set(standard.map((l) => l.name.toLowerCase()));
  const messages = [
    ...data.units.map(unitXml),
    ...standard.map((l) => ledgerXml(l.name, l.parent, l.extra)),
    ...data.parties
      .filter((p) => !taken.has(p.ledgerName.toLowerCase()))
      .map((p) => partyXml(p, data.includeOpening)),
    ...data.stockItems.map(stockItemXml),
  ].map((m) => `     ${m}`);
  return envelope('All Masters', data.company, messages);
}

/** Dr/Cr entry as Tally expects: debits negative + deemed positive, credits positive. */
function ledgerEntry(ledger: string, signed: number, extra = ''): string {
  return wrap(
    'ALLLEDGERENTRIES.LIST',
    [
      tag('LEDGERNAME', ledger),
      tag('ISDEEMEDPOSITIVE', yesNo(signed < 0)),
      extra,
      tag('AMOUNT', amount(signed)),
    ].join(''),
  );
}
const partyEntry = (ledger: string, signed: number, billRef: string, billType: string) =>
  ledgerEntry(
    ledger,
    signed,
    tag('ISPARTYLEDGER', 'Yes') +
      (billRef
        ? wrap(
            'BILLALLOCATIONS.LIST',
            [tag('NAME', billRef), tag('BILLTYPE', billType), tag('AMOUNT', amount(signed))].join(
              '',
            ),
          )
        : ''),
  );

/** Which ledgers a goods voucher posts to, and whether the party side is the credit. */
function goodsPlan(kind: TallyVoucherKind, n: TallyLedgerNames) {
  const sales = kind === 'sale' || kind === 'sale_return';
  return {
    partyCredit: kind === 'purchase' || kind === 'sale_return',
    goods: sales ? n.sales : n.purchase,
    cgst: sales ? n.outputCgst : n.inputCgst,
    sgst: sales ? n.outputSgst : n.inputSgst,
    igst: sales ? n.outputIgst : n.inputIgst,
    cess: sales ? n.outputCess : n.inputCess,
  };
}

function goodsVoucherBody(v: TallyVoucher, n: TallyLedgerNames): string {
  const plan = goodsPlan(v.kind, n);
  const sign = plan.partyCredit ? -1 : 1; // sign of the goods/tax side (opposite to the party)
  const stockLines = v.lines.filter((l) => l.stock);
  const directTaxable =
    v.lines.filter((l) => !l.stock).reduce((s, l) => s + l.taxable, 0) + v.chargesTaxable;
  const taxes = v.cgst + v.sgst + v.igst + v.cess;
  const stockTaxable = stockLines.reduce((s, l) => s + l.taxable, 0);
  const roundOff = v.total - stockTaxable - directTaxable - taxes;
  const entries = [
    partyEntry(v.partyName, plan.partyCredit ? v.total : -v.total, v.number, 'New Ref'),
    ...(directTaxable ? [ledgerEntry(plan.goods, sign * directTaxable)] : []),
    ...(v.cgst ? [ledgerEntry(plan.cgst, sign * v.cgst)] : []),
    ...(v.sgst ? [ledgerEntry(plan.sgst, sign * v.sgst)] : []),
    ...(v.igst ? [ledgerEntry(plan.igst, sign * v.igst)] : []),
    ...(v.cess ? [ledgerEntry(plan.cess, sign * v.cess)] : []),
    ...(roundOff ? [ledgerEntry(n.roundOff, sign * roundOff)] : []),
  ];
  const inventory = stockLines.map((l) => {
    const signed = sign * l.taxable;
    const billed = l.qty;
    const rate = billed > 0 ? ratePerUnit(l.taxable, billed) : '0';
    return wrap(
      'ALLINVENTORYENTRIES.LIST',
      [
        tag('STOCKITEMNAME', l.name),
        tag('ISDEEMEDPOSITIVE', yesNo(signed < 0)),
        tag('RATE', `${rate}/${l.unit}`),
        tag('AMOUNT', amount(signed)),
        tag('ACTUALQTY', qtyText(l.qty + l.freeQty, l.unit)),
        tag('BILLEDQTY', qtyText(l.qty, l.unit)),
        wrap(
          'ACCOUNTINGALLOCATIONS.LIST',
          [
            tag('LEDGERNAME', plan.goods),
            tag('ISDEEMEDPOSITIVE', yesNo(signed < 0)),
            tag('AMOUNT', amount(signed)),
          ].join(''),
        ),
      ].join(''),
    );
  });
  return [...inventory, ...entries].join('');
}
/** Net rate = taxable value / quantity, up to 4 decimals, trailing zeros trimmed. */
function ratePerUnit(taxable: number, qty: number): string {
  const rate = taxable / 100 / qty;
  return String(Number(rate.toFixed(4)));
}

function cashVoucherBody(v: TallyVoucher, n: TallyLedgerNames): string {
  const received = v.kind === 'payment_in';
  const partySign = received ? 1 : -1; // receipt: party credited; payment: party debited
  const moved = v.payments.reduce((s, p) => s + p.amount, 0);
  const rest = v.total - moved - v.discount;
  const payments = [...v.payments, ...(rest ? [{ ledger: n.cash, amount: rest }] : [])];
  const allocated = v.against.reduce((sum, r) => sum + r.amount, 0);
  const refs = [
    ...v.against.map((r) => ({ ...r, type: 'Agst Ref' })),
    ...(v.total > allocated
      ? [{ ref: v.number, amount: v.total - allocated, type: 'On Account' }]
      : []),
  ];
  const bills = refs
    .map((r) =>
      wrap(
        'BILLALLOCATIONS.LIST',
        [
          tag('NAME', r.ref),
          tag('BILLTYPE', r.type),
          tag('AMOUNT', amount(partySign * r.amount)),
        ].join(''),
      ),
    )
    .join('');
  return [
    ledgerEntry(v.partyName, partySign * v.total, tag('ISPARTYLEDGER', 'Yes') + bills),
    ...payments.map((p) => ledgerEntry(p.ledger, -partySign * p.amount)),
    ...(v.discount ? [ledgerEntry(n.discount, -partySign * v.discount)] : []),
  ].join('');
}

export function voucherXml(v: TallyVoucher, n: TallyLedgerNames): string {
  const typeName = TALLY_VOUCHER_NAMES[v.kind];
  const goods = !['payment_in', 'payment_out'].includes(v.kind);
  const view = goods ? 'Invoice Voucher View' : 'Accounting Voucher View';
  const head = [
    tag('DATE', dateText(v.date)),
    tag('VOUCHERTYPENAME', typeName),
    tag('VOUCHERNUMBER', v.number),
    tag('PARTYLEDGERNAME', v.partyName),
    ...(goods
      ? [
          v.partyGstin ? tag('PARTYGSTIN', v.partyGstin) : '',
          v.placeOfSupply ? tag('PLACEOFSUPPLY', v.placeOfSupply) : '',
          tag('BASICBUYERNAME', v.partyName),
          tag('ISINVOICE', 'Yes'),
        ]
      : []),
    tag('PERSISTEDVIEW', view),
    v.narration ? tag('NARRATION', v.narration) : '',
  ].join('');
  return wrap(
    'VOUCHER',
    head + (goods ? goodsVoucherBody(v, n) : cashVoucherBody(v, n)),
    ` VCHTYPE="${xmlEscape(typeName)}" ACTION="Create" OBJVIEW="${view}"`,
  );
}

/** How many masters an import file will contain (for the confirmation summary). */
export function countMasters(data: TallyData) {
  const standard = standardLedgers(data);
  const taken = new Set(standard.map((l) => l.name.toLowerCase()));
  return {
    ledgers:
      standard.length + data.parties.filter((p) => !taken.has(p.ledgerName.toLowerCase())).length,
    stockItems: data.stockItems.length,
    units: data.units.length,
  };
}

export function buildVouchersXml(data: TallyData): string {
  return envelope(
    'Vouchers',
    data.company,
    data.vouchers.map((v) => `     ${voucherXml(v, data.ledgerNames)}`),
  );
}
