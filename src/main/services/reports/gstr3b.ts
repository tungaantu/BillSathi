import type { ReportResult, ReportRow } from '../../../shared/reports';
import { build, col, money, num, str, type ReportCtx, type Row } from './engine';
import { taxLines } from './gst-lines';
const isReturn = (r: Row) => ['sale_return', 'purchase_return'].includes(str(r.type));

export interface Heads {
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}
/**
 * Pays GST liability with input tax credit in the order the law allows: IGST credit against IGST,
 * then CGST, then SGST; CGST credit against CGST then IGST; SGST credit against SGST then IGST;
 * cess credit only against cess. Returns the cash to pay and the credit left to carry forward.
 */
export function utilise(liability: Heads, credit: Heads): { cash: Heads; carry: Heads } {
  const due = { ...liability },
    left = { ...credit };
  const spend = (from: keyof Heads, against: (keyof Heads)[]) => {
    for (const head of against) {
      const used = Math.max(0, Math.min(left[from], due[head]));
      left[from] -= used;
      due[head] -= used;
    }
  };
  spend('igst', ['igst', 'cgst', 'sgst']);
  spend('cgst', ['cgst', 'igst']);
  spend('sgst', ['sgst', 'igst']);
  spend('cess', ['cess']);
  return { cash: due, carry: left };
}

/** GSTR-3B: tax on sales, input tax credit and what is left to pay. */
export function gstr3b(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const t31a = zero(),
    t31c = zero(),
    t31d = zero(),
    itcRc = zero(),
    itcOther = zero(),
    ineligible = zero();
  const addTo = (target: ReturnType<typeof zero>, r: Row, s: number) => {
    target.taxable += s * num(r.taxable);
    target.igst += s * num(r.igst);
    target.cgst += s * num(r.cgst);
    target.sgst += s * num(r.sgst);
    target.cess += s * num(r.cess);
  };
  for (const r of taxLines(
    ctx,
    ['sale', 'sale_return', 'purchase', 'purchase_return', 'expense'],
    from,
    to,
  )) {
    const type = str(r.type),
      s = isReturn(r) ? -1 : 1;
    if (type === 'sale' || type === 'sale_return') {
      addTo(num(r.tax_bps) > 0 ? t31a : t31c, r, s);
      continue;
    }
    const rc = num(r.reverse_charge) === 1;
    if (rc) addTo(t31d, r, s);
    if (num(r.itc_eligible) === 1) addTo(rc ? itcRc : itcOther, r, s);
    else addTo(ineligible, r, s);
  }
  const itc = {
    igst: itcRc.igst + itcOther.igst,
    cgst: itcRc.cgst + itcOther.cgst,
    sgst: itcRc.sgst + itcOther.sgst,
    cess: itcRc.cess + itcOther.cess,
  };
  const liability = {
    igst: t31a.igst + t31d.igst,
    cgst: t31a.cgst + t31d.cgst,
    sgst: t31a.sgst + t31d.sgst,
    cess: t31a.cess + t31d.cess,
  };
  // Reverse-charge liability must be paid in cash; ITC offsets outward tax only.
  const outwardLiability = { igst: t31a.igst, cgst: t31a.cgst, sgst: t31a.sgst, cess: t31a.cess };
  const { cash, carry } = utilise(outwardLiability, itc);
  for (const head of ['igst', 'cgst', 'sgst', 'cess'] as const)
    cash[head] = Math.max(0, cash[head]) + Math.max(0, t31d[head]);
  const line = (
    label: string,
    v: Partial<ReturnType<typeof zero>>,
    extra: ReportRow = {},
  ): ReportRow => ({
    label,
    taxable: v.taxable ?? null,
    igst: v.igst ?? 0,
    cgst: v.cgst ?? 0,
    sgst: v.sgst ?? 0,
    cess: v.cess ?? 0,
    ...extra,
  });
  const rows: ReportRow[] = [
    line('reports.tb.h31', {}, { _bold: 1, taxable: null }),
    line('reports.tb.31a', t31a, { _indent: 1 }),
    line('reports.tb.31c', t31c, { _indent: 1 }),
    line('reports.tb.31d', t31d, { _indent: 1 }),
    line('reports.tb.h4', {}, { _bold: 1, taxable: null }),
    line('reports.tb.4a3', itcRc, { _indent: 1 }),
    line('reports.tb.4a5', itcOther, { _indent: 1 }),
    line('reports.tb.4c', { ...itc, taxable: undefined }, { _indent: 1, taxable: null }),
    line('reports.tb.4d', ineligible, { _indent: 1 }),
    line('reports.tb.h61', {}, { _bold: 1, taxable: null }),
    line(
      'reports.tb.liability',
      { ...liability, taxable: undefined },
      { _indent: 1, taxable: null },
    ),
    line(
      'reports.tb.itcUsed',
      {
        igst: itc.igst - carry.igst,
        cgst: itc.cgst - carry.cgst,
        sgst: itc.sgst - carry.sgst,
        cess: itc.cess - carry.cess,
      },
      { _indent: 1, taxable: null },
    ),
    line('reports.tb.cash', cash, { _bold: 1, taxable: null }),
    line('reports.tb.carry', carry, { _indent: 1, taxable: null }),
  ];
  const payable = cash.igst + cash.cgst + cash.sgst + cash.cess;
  const outward = liability.igst + liability.cgst + liability.sgst + liability.cess;
  return build(
    'gstr3b',
    [
      col('label', 'text', { translate: true }),
      col('taxable', 'money'),
      col('igst', 'money'),
      col('cgst', 'money'),
      col('sgst', 'money'),
      col('cess', 'money'),
    ],
    rows,
    {
      noTotals: true,
      summary: [
        money('outwardTax', outward),
        money('itcAvailable', itc.igst + itc.cgst + itc.sgst + itc.cess, 'success'),
        money('taxPayable', payable, payable ? 'danger' : 'success'),
      ],
      notes: ['reports.note.gstr3b'],
    },
  );
}
