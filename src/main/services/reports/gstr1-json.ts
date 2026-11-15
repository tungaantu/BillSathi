import { gstDate } from '../../../shared/report-dates';
import { paiseToDecimal } from '../../../shared/money';
import { GSTR1_JSON_VERSION } from './gstr1-constants';
import type { Gstr1Data, Gstr1Doc, RateAmount } from './gstr1';

/** Rupees with at most two decimals, as a JSON number (the portal expects numbers, not strings). */
const rs = (paise: number) => Number(paiseToDecimal(paise));
const rate = (bps: number) => bps / 100;

/** Tax amounts for one rate slab: IGST for other-state supplies, CGST + SGST for same-state ones. */
function detail(r: RateAmount, interstate: boolean) {
  return {
    txval: rs(r.txval),
    rt: rate(r.rate),
    ...(interstate ? { iamt: rs(r.igst) } : { camt: rs(r.cgst), samt: rs(r.sgst) }),
    csamt: rs(r.cess),
  };
}
const items = (doc: Gstr1Doc) =>
  doc.rates.map((r, i) => ({ num: i + 1, itm_det: detail(r, doc.interstate) }));
const groupBy = <T>(list: T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of list) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.entries()];
};

/**
 * GSTR-1 in the JSON layout of the GST offline tool: b2b, b2cl, b2cs, cdnr, cdnur, hsn and doc_issue.
 * `gt` and `cur_gt` (turnover) are left out because BillSathi does not know the whole-year turnover.
 */
export function gstr1Json(data: Gstr1Data) {
  const invoice = (d: Gstr1Doc) => ({
    inum: d.number,
    idt: gstDate(d.date),
    val: rs(d.value),
    pos: d.pos,
    rchrg: d.reverseCharge ? 'Y' : 'N',
    inv_typ: 'R',
    itms: items(d),
  });
  const note = (d: Gstr1Doc) => ({
    ntty: 'C',
    nt_num: d.number,
    nt_dt: gstDate(d.date),
    val: rs(d.value),
    pos: d.pos,
    rchrg: d.reverseCharge ? 'Y' : 'N',
    inv_typ: 'R',
    itms: items(d),
  });
  const out: Record<string, unknown> = {
    gstin: data.gstin,
    fp: data.fp,
    version: GSTR1_JSON_VERSION,
    hash: 'hash',
  };
  if (data.b2b.length)
    out.b2b = groupBy(data.b2b, (d) => d.ctin).map(([ctin, list]) => ({
      ctin,
      inv: list.map(invoice),
    }));
  if (data.b2cl.length)
    out.b2cl = groupBy(data.b2cl, (d) => d.pos).map(([pos, list]) => ({
      pos,
      inv: list.map((d) => ({
        inum: d.number,
        idt: gstDate(d.date),
        val: rs(d.value),
        itms: items(d),
      })),
    }));
  if (data.b2cs.length)
    out.b2cs = data.b2cs.map((r) => ({
      sply_ty: r.supply,
      pos: r.pos,
      typ: 'OE',
      ...detail(r, r.supply === 'INTER'),
    }));
  if (data.cdnr.length)
    out.cdnr = groupBy(data.cdnr, (d) => d.ctin).map(([ctin, list]) => ({
      ctin,
      nt: list.map(note),
    }));
  if (data.cdnur.length)
    out.cdnur = data.cdnur.map((d) => ({
      typ: 'B2CL',
      ntty: 'C',
      nt_num: d.number,
      nt_dt: gstDate(d.date),
      val: rs(d.value),
      pos: d.pos,
      itms: items(d),
    }));
  if (data.hsn.length) {
    const modern = data.to >= '2025-05-01';
    const hsnRows = (registered?: boolean) =>
      data.hsn
        .filter((h) => registered === undefined || h.registered === registered)
        .map((h, i) => ({
          num: i + 1,
          hsn_sc: h.hsn,
          desc: h.description,
          uqc: h.uqc,
          qty: h.qty,
          ...(!modern ? { val: rs(h.value) } : {}),
          txval: rs(h.txval),
          iamt: rs(h.igst),
          camt: rs(h.cgst),
          samt: rs(h.sgst),
          csamt: rs(h.cess),
          rt: rate(h.rate),
        }));
    out.hsn = modern ? { hsn_b2b: hsnRows(true), hsn_b2c: hsnRows(false) } : { data: hsnRows() };
  }
  if (data.docs.length)
    out.doc_issue = {
      doc_det: [...new Set(data.docs.map((d) => d.code))].map((code) => {
        const list = data.docs.filter((d) => d.code === code);
        return {
          doc_num: code,
          doc_typ: list[0].name,
          docs: list.map((d, i) => ({
            num: i + 1,
            from: d.from,
            to: d.to,
            totnum: d.total,
            cancel: d.cancelled,
            net_issue: d.net,
          })),
        };
      }),
    };
  return out;
}
