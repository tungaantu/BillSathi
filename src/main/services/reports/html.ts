import { escapeHtml } from '../../../shared/invoice-html';
import { formatCell, type Translate } from '../../../shared/report-format';
import type { ReportResult } from '../../../shared/reports';
import type { Settings } from '../../../shared/types';
import type { ReportHeader } from './excel';

/** A report as a printable page: company header, period, table with totals and notes. */
export function reportHtml(
  result: ReportResult,
  header: ReportHeader,
  tr: Translate,
  options: { settings?: Settings; landscape?: boolean; fontCss?: string; language?: string } = {},
): string {
  const e = escapeHtml,
    settings = options.settings ?? {};
  const label = (key: string) => tr(key) ?? key;
  const right = (type: string) => type !== 'text' && type !== 'date';
  const head = result.columns
    .map((c) => `<th class="${right(c.type) ? 'num' : ''}">${e(label(c.label))}</th>`)
    .join('');
  const line = (row: Record<string, unknown>, extra = '') =>
    `<tr class="${extra}${row._bold ? ' strong' : ''}${row._indent ? ' indent' : ''}">${result.columns
      .map(
        (c) =>
          `<td class="${right(c.type) ? 'num' : ''}">${e(formatCell(row[c.key] as never, c, tr, settings))}</td>`,
      )
      .join('')}</tr>`;
  const cards = result.summary
    .map((s) => {
      const value =
        s.type === 'money'
          ? formatCell(s.value, { key: s.key, label: '', type: 'money' }, tr, settings)
          : String(s.value);
      return `<div class="card"><span>${e(label(s.label))}</span><strong>${e(value)}</strong></div>`;
    })
    .join('');
  return `<!doctype html><html lang="${e(options.language ?? 'en')}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><title>${e(header.title)}</title><style>
${options.fontCss ?? ''}
@page{size:A4 ${options.landscape ? 'landscape' : 'portrait'};margin:10mm}
*{box-sizing:border-box}body{margin:0;color:#0f172a;font:10pt BillSathiPrint,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:17pt;margin:0}h2{font-size:12pt;margin:10px 0 2px}p{margin:2px 0;color:#475569}
header{border-bottom:2px solid #2563eb;padding-bottom:8px;margin-bottom:10px}
.cards{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.card{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;min-width:120px}.card span{display:block;font-size:8pt;color:#64748b}.card strong{font-size:11pt}
table{border-collapse:collapse;width:100%;font-size:9pt}th{background:#2563eb;color:white;text-align:left;font-weight:600;white-space:nowrap}
td,th{padding:5px 6px;border:1px solid #e2e8f0;overflow-wrap:anywhere}.num{text-align:right;white-space:nowrap}
thead{display:table-header-group}tr{break-inside:avoid}.strong td{font-weight:700;background:#f5f7fb}.indent td:first-child{padding-left:22px}.total td{font-weight:700;border-top:2px solid #0f172a;background:#f5f7fb}
.notes{margin-top:12px;font-size:8.5pt;color:#64748b}
</style></head><body>
<header><h1>${e(header.company)}</h1>${header.gstin ? `<p>GSTIN: ${e(header.gstin)}</p>` : ''}<h2>${e(header.title)}</h2><p>${e(header.period)}</p></header>
${cards ? `<div class="cards">${cards}</div>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${result.rows.map((r) => line(r)).join('')}${result.totals ? line(result.totals, 'total') : ''}</tbody></table>
${result.notes.length ? `<div class="notes">${result.notes.map((n) => `<p>${e(label(n))}</p>`).join('')}</div>` : ''}
</body></html>`;
}
