import { validateGSTIN, formatGSTIN } from '../../../shared/gstin';
import { STATES } from '../../../shared/constants';
import { taxPeriod } from '../../../shared/report-dates';
import type { FixIssue } from '../../../shared/reports';
import { docNumber, num, query, str, type ReportCtx } from './engine';
import {
  DOC_NATURE,
  HSN_PATTERN,
  INVOICE_NUMBER_PATTERN,
  VALID_RATES_BPS,
  b2clLimit,
  uqc,
} from './gstr1-constants';
import { taxLines } from './gst-lines';

export interface RateAmount {
  /** GST rate in basis points. */
  rate: number;
  txval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}
export interface Gstr1Doc {
  id: number;
  type: 'sale' | 'sale_return';
  number: string;
  date: string;
  value: number;
  pos: string;
  interstate: boolean;
  reverseCharge: boolean;
  originalValue: number;
  originalDate: string;
  ctin: string;
  party: string;
  rates: RateAmount[];
}
export interface B2csRow extends RateAmount {
  supply: 'INTRA' | 'INTER';
  pos: string;
}
export interface HsnRow extends RateAmount {
  registered: boolean;
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  value: number;
}
export interface DocRow {
  nature: 'invoice' | 'creditNote';
  code: number;
  name: string;
  from: string;
  to: string;
  total: number;
  cancelled: number;
  net: number;
}
export interface Gstr1Data {
  gstin: string;
  /** Tax period `MMYYYY`. */
  fp: string;
  from: string;
  to: string;
  b2b: Gstr1Doc[];
  b2cl: Gstr1Doc[];
  b2cs: B2csRow[];
  cdnr: Gstr1Doc[];
  cdnur: Gstr1Doc[];
  hsn: HsnRow[];
  docs: DocRow[];
  issues: FixIssue[];
}
const empty = (rate: number): RateAmount => ({
  rate,
  txval: 0,
  igst: 0,
  cgst: 0,
  sgst: 0,
  cess: 0,
});
const add = (a: RateAmount, b: RateAmount, sign = 1) => {
  a.txval += sign * b.txval;
  a.igst += sign * b.igst;
  a.cgst += sign * b.cgst;
  a.sgst += sign * b.sgst;
  a.cess += sign * b.cess;
};
export const stateName = (code: string) => STATES.find((s) => s.code === code)?.en ?? '';
const link = (type: string, id: number) =>
  type === 'sale_return' ? `saleReturns/preview/${id}` : `invoices/preview/${id}`;

/** Sorts a month of sales and credit notes into the GSTR-1 tables and finds what needs fixing first. */
export function gstr1Data(ctx: ReportCtx): Gstr1Data {
  const { from, to } = ctx.filters;
  const firm = query(ctx, 'SELECT gstin, state_code FROM firms WHERE id = ?', ctx.firm)[0];
  const gstin = formatGSTIN(str(firm?.gstin)),
    firmState = str(firm?.state_code);
  const lines = taxLines(ctx, ['sale', 'sale_return'], from, to);
  const issues: FixIssue[] = [];
  const seen = new Set<string>();
  const issue = (
    code: string,
    severity: FixIssue['severity'],
    docNo: string,
    detail: string,
    to: string,
  ) => {
    const key = `${code}|${docNo}|${detail}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, severity, docNumber: docNo, detail, link: to });
  };
  if (!validateGSTIN(gstin)) issue('reports.fix.firmGstin', 'error', '', gstin || '-', 'profile');

  if (from.slice(0, 7) !== to.slice(0, 7))
    issue('reports.fix.period', 'error', '', `${from} / ${to}`, 'reports/gstr1');
  const docs = new Map<number, Gstr1Doc>();
  const hsnMap = new Map<string, HsnRow>();
  for (const r of lines) {
    const id = num(r.txn_id),
      type = str(r.type) as Gstr1Doc['type'],
      sign = type === 'sale' ? 1 : -1;
    let doc = docs.get(id);
    if (!doc) {
      const partyGstin = formatGSTIN(str(r.gstin));
      const pos = str(r.pos);
      const valid = Boolean(partyGstin) && validateGSTIN(partyGstin);
      const number = str(r.number);
      if (partyGstin && !valid)
        issue('reports.fix.invalidGstin', 'error', number, partyGstin, link(type, id));
      else if (!partyGstin && str(r.gst_type) !== 'consumer')
        issue('reports.fix.missingGstin', 'error', number, str(r.party), link(type, id));
      if (!STATES.some((state) => state.code === pos))
        issue('reports.fix.noPos', 'error', number, str(r.party), link(type, id));
      if (!INVOICE_NUMBER_PATTERN.test(number))
        issue('reports.fix.badNumber', 'error', number, number, link(type, id));
      doc = {
        id,
        type,
        number,
        date: str(r.date),
        value: num(r.doc_total),
        pos: pos || firmState,
        interstate: Boolean(pos) && pos !== firmState,
        reverseCharge: num(r.reverse_charge) === 1,
        originalValue: num(r.original_total),
        originalDate: str(r.original_date),
        ctin: valid ? partyGstin : '',
        party: str(r.party),
        rates: [],
      };
      docs.set(id, doc);
    }
    const rate = num(r.tax_bps);
    if (!VALID_RATES_BPS.includes(rate))
      issue('reports.fix.badRate', 'error', doc.number, `${rate / 100}%`, link(type, id));
    let slot = doc.rates.find((x) => x.rate === rate);
    if (!slot) doc.rates.push((slot = empty(rate)));
    const amount: RateAmount = {
      rate,
      txval: num(r.taxable),
      igst: num(r.igst),
      cgst: num(r.cgst),
      sgst: num(r.sgst),
      cess: num(r.cess),
    };
    add(slot, amount);
    if (num(r.is_charge)) continue;
    const hsn = str(r.hsn).replace(/\s/g, '');
    if (!hsn)
      issue(
        'reports.fix.noHsn',
        'warning',
        doc.number,
        str(r.item_name),
        r.item_id ? `items/${num(r.item_id)}` : link(type, id),
      );
    else if (!HSN_PATTERN.test(hsn))
      issue(
        'reports.fix.badHsn',
        'warning',
        doc.number,
        `${str(r.item_name)} (${hsn})`,
        r.item_id ? `items/${num(r.item_id)}` : link(type, id),
      );
    if (!hsn) continue;
    const unit = uqc(str(r.unit));
    const key = `${Boolean(doc.ctin)}|${hsn}|${unit}|${rate}`;
    let row = hsnMap.get(key);
    if (!row) {
      hsnMap.set(
        key,
        (row = {
          ...empty(rate),
          registered: Boolean(doc.ctin),
          hsn,
          description: str(r.item_name),
          uqc: unit,
          qty: 0,
          value: 0,
        }),
      );
    }
    add(row, amount, sign);
    row.qty += sign * num(r.qty);
    row.value += sign * num(r.total);
  }

  const data: Gstr1Data = {
    gstin,
    fp: taxPeriod(to),
    from,
    to,
    b2b: [],
    b2cl: [],
    b2cs: [],
    cdnr: [],
    cdnur: [],
    hsn: [...hsnMap.values()]
      .map((h) => ({ ...h, qty: Math.round(h.qty * 1000) / 1000 }))
      .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
    docs: [],
    issues,
  };
  const small = new Map<string, B2csRow>();
  for (const doc of docs.values()) {
    const note = doc.type === 'sale_return';
    if (doc.ctin) (note ? data.cdnr : data.b2b).push(doc);
    else if (
      doc.interstate &&
      (note && doc.originalValue ? doc.originalValue : doc.value) >
        b2clLimit(note && doc.originalDate ? doc.originalDate : doc.date)
    )
      (note ? data.cdnur : data.b2cl).push(doc);
    else
      for (const r of doc.rates) {
        const supply = doc.interstate ? 'INTER' : 'INTRA';
        const key = `${supply}|${doc.pos}|${r.rate}`;
        let row = small.get(key);
        if (!row) small.set(key, (row = { ...empty(r.rate), supply, pos: doc.pos }));
        add(row, r, note ? -1 : 1);
      }
  }
  data.b2cs = [...small.values()].sort(
    (a, b) => a.pos.localeCompare(b.pos) || a.supply.localeCompare(b.supply) || a.rate - b.rate,
  );
  data.docs = documentSeries(ctx);
  issues.sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  return data;
}

/** Documents issued in the period, by series: first, last, how many and how many were cancelled. */
function documentSeries(ctx: ReportCtx): DocRow[] {
  const rows = query(
    ctx,
    `SELECT type, prefix, number, status, deleted_at FROM txns
     WHERE firm_id = ? AND type IN ('sale', 'sale_return') AND status <> 'draft' AND date BETWEEN ? AND ?
     ORDER BY type, prefix, number`,
    ctx.firm,
    ctx.filters.from,
    ctx.filters.to,
  );
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${str(r.type)}|${str(r.prefix)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const nature = key.startsWith('sale_return') ? 'creditNote' : 'invoice';
    const cancelled = list.filter((r) => str(r.status) === 'cancelled' || r.deleted_at).length;
    return {
      nature,
      code: DOC_NATURE[nature].code,
      name: DOC_NATURE[nature].name,
      from: docNumber(list[0].prefix, list[0].number),
      to: docNumber(list[list.length - 1].prefix, list[list.length - 1].number),
      total: list.length,
      cancelled,
      net: list.length - cancelled,
    };
  });
}
