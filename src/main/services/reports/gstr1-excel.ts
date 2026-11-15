import ExcelJS from 'exceljs';
import { gstDate } from '../../../shared/report-dates';
import type { Gstr1Data, Gstr1Doc, RateAmount } from './gstr1';
import { stateName } from './gstr1';

const RUPEE_FORMAT = '#,##,##0.00';
/** Sheet headers copied from the GST offline tool workbook, so the file can be imported there. */
const HEADERS: Record<string, string[]> = {
  b2b: [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'E-Commerce GSTIN',
    'Rate',
    'Taxable Value',
    'Cess Amount',
  ],
  b2cl: [
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN',
  ],
  b2cs: [
    'Type',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN',
  ],
  cdnr: [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Note Number',
    'Note Date',
    'Note Type',
    'Place Of Supply',
    'Reverse Charge',
    'Note Supply Type',
    'Note Value',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
  ],
  cdnur: [
    'UR Type',
    'Note Number',
    'Note Date',
    'Note Type',
    'Place Of Supply',
    'Note Value',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
  ],
  hsn: [
    'HSN',
    'Description',
    'UQC',
    'Total Quantity',
    'Total Value',
    'Taxable Value',
    'Integrated Tax Amount',
    'Central Tax Amount',
    'State/UT Tax Amount',
    'Cess Amount',
  ],
  docs: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
};
/** Money columns (1-based) per sheet, formatted in Indian grouping. */
const MONEY: Record<string, number[]> = {
  b2b: [5, 12, 13],
  b2cl: [3, 7, 8],
  b2cs: [5, 6],
  cdnr: [9, 12, 13],
  cdnur: [6, 9, 10],
  hsn: [5, 6, 7, 8, 9, 10],
  docs: [],
};
const rs = (paise: number) => Number((paise / 100).toFixed(2));
const place = (pos: string) => `${pos}-${stateName(pos)}`;
const applicable = ''; // "Applicable % of Tax Rate" stays blank for regular supplies.

/** One row per invoice and rate slab, as the offline tool expects. */
function invoiceRows(
  docs: Gstr1Doc[],
  cells: (d: Gstr1Doc, r: RateAmount, first: boolean) => unknown[],
) {
  return docs.flatMap((d) => d.rates.map((r, i) => cells(d, r, i === 0)));
}

/** The GSTR-1 workbook: one sheet each for b2b, b2cl, b2cs, cdnr, cdnur, hsn and docs. */
export async function gstr1Workbook(
  data: Gstr1Data,
  settings: Record<string, unknown> = {},
): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  book.creator = 'BillSathi';
  void settings;
  const headersBySheet = { ...HEADERS },
    moneyBySheet = { ...MONEY };
  const date = gstDate;
  const sheets: Record<string, unknown[][]> = {
    b2b: invoiceRows(data.b2b, (d, r) => [
      d.ctin,
      d.party,
      d.number,
      date(d.date),
      rs(d.value),
      place(d.pos),
      d.reverseCharge ? 'Y' : 'N',
      applicable,
      'Regular',
      '',
      r.rate / 100,
      rs(r.txval),
      rs(r.cess),
    ]),
    b2cl: invoiceRows(data.b2cl, (d, r) => [
      d.number,
      date(d.date),
      rs(d.value),
      place(d.pos),
      applicable,
      r.rate / 100,
      rs(r.txval),
      rs(r.cess),
      '',
    ]),
    b2cs: data.b2cs.map((r) => [
      'OE',
      place(r.pos),
      applicable,
      r.rate / 100,
      rs(r.txval),
      rs(r.cess),
      '',
    ]),
    cdnr: invoiceRows(data.cdnr, (d, r) => [
      d.ctin,
      d.party,
      d.number,
      date(d.date),
      'C',
      place(d.pos),
      d.reverseCharge ? 'Y' : 'N',
      'Regular',
      rs(d.value),
      applicable,
      r.rate / 100,
      rs(r.txval),
      rs(r.cess),
    ]),
    cdnur: invoiceRows(data.cdnur, (d, r) => [
      'B2CL',
      d.number,
      date(d.date),
      'C',
      place(d.pos),
      rs(d.value),
      applicable,
      r.rate / 100,
      rs(r.txval),
      rs(r.cess),
    ]),
    hsn: data.hsn.map((h) => [
      h.hsn,
      h.description,
      h.uqc,
      h.qty,
      rs(h.value),
      rs(h.txval),
      rs(h.igst),
      rs(h.cgst),
      rs(h.sgst),
      rs(h.cess),
    ]),
    docs: data.docs.map((d) => [d.name, d.from, d.to, d.total, d.cancelled]),
  };
  if (data.to >= '2025-05-01') {
    const headers = [...HEADERS.hsn];
    headers.splice(4, 1);
    headers.push('Rate');
    for (const registered of [true, false]) {
      const name = registered ? 'hsn(b2b)' : 'hsn(b2c)';
      headersBySheet[name] = headers;
      moneyBySheet[name] = [5, 6, 7, 8, 9];
      sheets[name] = data.hsn
        .filter((h) => h.registered === registered)
        .map((h) => [
          h.hsn,
          h.description,
          h.uqc,
          h.qty,
          rs(h.txval),
          rs(h.igst),
          rs(h.cgst),
          rs(h.sgst),
          rs(h.cess),
          h.rate / 100,
        ]);
    }
  }
  for (const [name, headers] of Object.entries(headersBySheet).filter(([name]) =>
    data.to >= '2025-05-01' ? name !== 'hsn' : !name.startsWith('hsn('),
  )) {
    const sheet = book.addWorksheet(name);
    sheet.addRow([`GSTR-1 ${data.fp} - ${data.gstin}`]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(headers).font = { bold: true };
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    for (const row of sheets[name]) sheet.addRow(row);
    headers.forEach((header, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, header.length + 2);
    });
    for (const c of moneyBySheet[name]) sheet.getColumn(c).numFmt = RUPEE_FORMAT;
  }
  return book;
}
