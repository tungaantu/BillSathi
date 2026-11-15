import type { ReportColumn, ReportResult, ReportRow } from '../../../shared/reports';
import { build, col, count, money, type ReportCtx } from './engine';
import { gstr1Data, stateName, type Gstr1Doc, type RateAmount } from './gstr1';
const link = (type: string, id: number) =>
  type === 'sale_return' ? `saleReturns/preview/${id}` : `invoices/preview/${id}`;

const rateCols = (): ReportColumn[] => [
  col('rate', 'rate'),
  col('taxable', 'money', { total: true }),
  col('igst', 'money', { total: true }),
  col('cgst', 'money', { total: true }),
  col('sgst', 'money', { total: true }),
  col('cess', 'money', { total: true }),
];
const rateCells = (r: RateAmount): ReportRow => ({
  rate: r.rate,
  taxable: r.txval,
  igst: r.igst,
  cgst: r.cgst,
  sgst: r.sgst,
  cess: r.cess,
});
const docRows = (docs: Gstr1Doc[], withGstin: boolean): ReportRow[] =>
  docs.flatMap((d) =>
    d.rates.map((r, i) => ({
      ...(withGstin ? { gstin: d.ctin, party: d.party } : {}),
      number: d.number,
      date: d.date,
      value: i === 0 ? d.value : null,
      pos: `${d.pos}-${stateName(d.pos)}`,
      ...rateCells(r),
      _link: link(d.type, d.id),
    })),
  );
export const GSTR1_TABS = ['b2b', 'b2cl', 'b2cs', 'cdnr', 'hsn', 'docs'] as const;

/** One tab of the GSTR-1 screen, plus the list of things to fix before filing. */
export function gstr1Report(ctx: ReportCtx): ReportResult {
  const data = gstr1Data(ctx);
  const tab = (GSTR1_TABS as readonly string[]).includes(ctx.filters.tab ?? '')
    ? (ctx.filters.tab as (typeof GSTR1_TABS)[number])
    : 'b2b';
  const counts: Record<string, number> = {
    b2b: data.b2b.length,
    b2cl: data.b2cl.length,
    b2cs: data.b2cs.length,
    cdnr: data.cdnr.length + data.cdnur.length,
    hsn: data.hsn.length,
    docs: data.docs.length,
  };
  let columns: ReportColumn[], rows: ReportRow[];
  switch (tab) {
    case 'b2b':
    case 'cdnr':
      columns = [
        col('gstin'),
        col('party'),
        col('number'),
        col('date', 'date'),
        col('value', 'money'),
        col('pos'),
        ...rateCols(),
      ];
      rows = docRows(tab === 'b2b' ? data.b2b : [...data.cdnr, ...data.cdnur], true);
      break;
    case 'b2cl':
      columns = [
        col('number'),
        col('date', 'date'),
        col('value', 'money'),
        col('pos'),
        ...rateCols(),
      ];
      rows = docRows(data.b2cl, false);
      break;
    case 'b2cs':
      columns = [col('supply', 'text', { translate: true }), col('pos'), ...rateCols()];
      rows = data.b2cs.map((r) => ({
        supply: `reports.supply.${r.supply}`,
        pos: `${r.pos}-${stateName(r.pos)}`,
        ...rateCells(r),
      }));
      break;
    case 'hsn':
      columns = [
        col('hsn'),
        col('description'),
        col('uqc'),
        col('qty', 'qty', { total: true }),
        col('value', 'money', { total: true }),
        ...rateCols(),
      ];
      rows = data.hsn.map((h) => ({
        hsn: h.hsn,
        description: h.description,
        uqc: h.uqc,
        qty: h.qty,
        value: h.value,
        ...rateCells(h),
      }));
      break;
    default:
      columns = [
        col('nature', 'text', { translate: true }),
        col('from'),
        col('to'),
        col('totalDocs', 'int', { total: true }),
        col('cancelled', 'int', { total: true }),
        col('netIssued', 'int', { total: true }),
      ];
      rows = data.docs.map((d) => ({
        nature: `reports.docs.${d.nature}`,
        from: d.from,
        to: d.to,
        totalDocs: d.total,
        cancelled: d.cancelled,
        netIssued: d.net,
      }));
  }
  const all = [...data.b2b, ...data.b2cl, ...data.cdnr, ...data.cdnur];
  const signed = (d: Gstr1Doc) => (d.type === 'sale' ? 1 : -1);
  const taxable = (docs: Gstr1Doc[]) =>
    docs.reduce((n, d) => n + signed(d) * d.rates.reduce((m, r) => m + r.txval, 0), 0);
  const tax = (docs: Gstr1Doc[]) =>
    docs.reduce(
      (n, d) => n + signed(d) * d.rates.reduce((m, r) => m + r.igst + r.cgst + r.sgst + r.cess, 0),
      0,
    );
  const smallTaxable = data.b2cs.reduce((n, r) => n + r.txval, 0);
  const smallTax = data.b2cs.reduce((n, r) => n + r.igst + r.cgst + r.sgst + r.cess, 0);
  const result = build(`gstr1`, columns, rows, {
    summary: [
      money('taxableValue', taxable(all) + smallTaxable),
      money('taxAmount', tax(all) + smallTax),
      count('errors', data.issues.filter((i) => i.severity === 'error').length),
      count('warnings', data.issues.filter((i) => i.severity === 'warning').length),
    ],
    notes: ['reports.note.gstr1', 'reports.note.gstr1NotCovered'],
  });
  return {
    ...result,
    issues: data.issues,
    tabs: GSTR1_TABS.map((id) => ({ id, count: counts[id] })),
  };
}
