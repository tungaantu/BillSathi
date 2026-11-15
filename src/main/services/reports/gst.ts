import { formatGSTIN } from '../../../shared/gstin';
import { txnLink, type ReportResult, type ReportRow } from '../../../shared/reports';
import { build, col, count, money, num, str, roundQty, type ReportCtx, type Row } from './engine';
import { taxLines } from './gst-lines';
import { uqc } from './gstr1-constants';

const sideTypes = (ctx: ReportCtx) =>
  ctx.filters.side === 'purchase' ? ['purchase', 'purchase_return'] : ['sale', 'sale_return'];
const isReturn = (r: Row) => ['sale_return', 'purchase_return'].includes(str(r.type));
const sign = (r: Row) => (isReturn(r) ? -1 : 1);
const taxCols = () => [
  col('taxable', 'money', { total: true }),
  col('igst', 'money', { total: true }),
  col('cgst', 'money', { total: true }),
  col('sgst', 'money', { total: true }),
  col('cess', 'money', { total: true }),
];
const sumKey = (rows: ReportRow[], key: string) => rows.reduce((n, r) => n + num(r[key]), 0);
const summaryOf = (rows: ReportRow[]) => [
  money('taxableValue', sumKey(rows, 'taxable')),
  money(
    'taxAmount',
    sumKey(rows, 'igst') + sumKey(rows, 'cgst') + sumKey(rows, 'sgst') + sumKey(rows, 'cess'),
  ),
];

/** HSN summary (goods) or SAC report (services): quantity, value and tax for every code. */
export function hsnReport(ctx: ReportCtx, services: boolean): ReportResult {
  const { from, to } = ctx.filters;
  const map = new Map<string, ReportRow>();
  for (const r of taxLines(ctx, sideTypes(ctx), from, to)) {
    if (num(r.is_charge) || (str(r.item_type) === 'service') !== services) continue;
    const hsn = str(r.hsn) || '-';
    const unit = services ? '' : uqc(str(r.unit));
    const key = `${hsn}|${unit}|${num(r.tax_bps)}`;
    const s = sign(r);
    const row = map.get(key) ?? {
      hsn,
      description: str(r.item_name),
      uqc: unit,
      rate: num(r.tax_bps),
      qty: 0,
      value: 0,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
    };
    row.qty = roundQty(num(row.qty) + s * num(r.qty));
    row.value = num(row.value) + s * num(r.total);
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess'])
      row[k] = num(row[k]) + s * num(r[k]);
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => str(a.hsn).localeCompare(str(b.hsn)));
  return build(
    services ? 'sacReport' : 'hsnSummary',
    [
      col('hsn', 'text', { label: services ? 'reports.col.sac' : 'reports.col.hsn' }),
      col('description'),
      ...(services ? [] : [col('uqc')]),
      ...(services ? [] : [col('qty', 'qty', { total: true })]),
      col('value', 'money', { total: true }),
      col('rate', 'rate'),
      ...taxCols(),
    ],
    rows,
    { summary: summaryOf(rows), notes: ['reports.note.returnsNetted'] },
  );
}

/** Tax per invoice: who, where, how much and which tax. */
export function gstReport(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const docs = new Map<number, ReportRow>();
  for (const r of taxLines(ctx, sideTypes(ctx), from, to)) {
    const id = num(r.txn_id),
      s = sign(r);
    const row = docs.get(id) ?? {
      date: str(r.date),
      number: str(r.number),
      type: `reports.type.${str(r.type)}`,
      party: str(r.party) || 'reports.cashParty',
      gstin: formatGSTIN(str(r.gstin)),
      pos: str(r.pos),
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      total: 0,
      _link: txnLink(str(r.type), id) ?? '',
    };
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess', 'total'])
      row[k] = num(row[k]) + s * num(r[k]);
    docs.set(id, row);
  }
  const rows = [...docs.values()];
  return build(
    'gstReport',
    [
      col('date', 'date'),
      col('number'),
      col('type', 'text', { translate: true }),
      col('party', 'text', { translate: true }),
      col('gstin'),
      col('pos'),
      ...taxCols(),
      col('total', 'money', { total: true }),
    ],
    rows,
    { summary: summaryOf(rows), notes: ['reports.note.returnsNetted'] },
  );
}

/** Tax collected (or paid) at each GST rate. */
export function gstRates(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const map = new Map<number, ReportRow>();
  for (const r of taxLines(ctx, sideTypes(ctx), from, to)) {
    const rate = num(r.tax_bps),
      s = sign(r);
    const row = map.get(rate) ?? { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0 };
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess'])
      row[k] = num(row[k]) + s * num(r[k]);
    row.tax = num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess);
    map.set(rate, row);
  }
  const rows = [...map.values()].sort((a, b) => num(a.rate) - num(b.rate));
  return build(
    'gstRates',
    [col('rate', 'rate'), ...taxCols(), col('tax', 'money', { total: true })],
    rows,
    { summary: summaryOf(rows), notes: ['reports.note.returnsNetted'] },
  );
}

/** Purchases with supplier GSTIN and the input tax credit each bill allows (GSTR-2 view). */
export function gstr2(ctx: ReportCtx): ReportResult {
  const { from, to } = ctx.filters;
  const docs = new Map<number, ReportRow>();
  for (const r of taxLines(ctx, ['purchase', 'purchase_return'], from, to)) {
    const id = num(r.txn_id),
      s = sign(r);
    const row = docs.get(id) ?? {
      gstin: formatGSTIN(str(r.gstin)),
      party: str(r.party),
      number: str(r.number),
      date: str(r.date),
      type: `reports.type.${str(r.type)}`,
      pos: str(r.pos),
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      itc: num(r.itc_eligible) ? 'reports.yes' : 'reports.no',
      itcAmount: 0,
      _link: txnLink(str(r.type), id) ?? '',
    };
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess'])
      row[k] = num(row[k]) + s * num(r[k]);
    docs.set(id, row);
  }
  const rows = [...docs.values()];
  for (const r of rows)
    r.itcAmount =
      r.itc === 'reports.yes' ? num(r.igst) + num(r.cgst) + num(r.sgst) + num(r.cess) : 0;
  return build(
    'gstr2',
    [
      col('gstin'),
      col('party'),
      col('number'),
      col('date', 'date'),
      col('type', 'text', { translate: true }),
      col('pos'),
      ...taxCols(),
      col('itc', 'text', { translate: true }),
      col('itcAmount', 'money', { total: true }),
    ],
    rows,
    {
      summary: [
        ...summaryOf(rows),
        money('itcAvailable', sumKey(rows, 'itcAmount'), 'success'),
        count('documents', rows.length),
      ],
      notes: ['reports.note.gstr2'],
    },
  );
}
