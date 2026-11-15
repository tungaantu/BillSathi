import { canEncode, code128Svg } from '../../shared/code128';
import { formatINR } from '../../shared/money';
import type { Item } from '../../shared/masters';
import type { LabelRequest, StockTransfer } from '../../shared/inventory-api';

const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Label sheet geometry in mm. A4 sheets fill a grid; rolls print one label per page. */
export const LABEL_LAYOUTS: Record<
  string,
  { cols: number; rows: number; w: number; h: number; page: string; roll?: boolean }
> = {
  'a4-65': { cols: 5, rows: 13, w: 38.1, h: 21.2, page: 'A4' },
  'a4-48': { cols: 4, rows: 12, w: 48.5, h: 22.5, page: 'A4' },
  'a4-40': { cols: 4, rows: 10, w: 48.5, h: 27.5, page: 'A4' },
  'a4-24': { cols: 3, rows: 8, w: 64, h: 34, page: 'A4' },
  'roll-50x25': { cols: 1, rows: 1, w: 50, h: 25, page: '50mm 25mm', roll: true },
  'roll-38x25': { cols: 1, rows: 1, w: 38, h: 25, page: '38mm 25mm', roll: true },
};
/** The value printed in the barcode: the item's barcode, else its item code. */
export const labelValue = (item: Pick<Item, 'code'> & { barcode?: string | null }) =>
  (item.barcode || item.code || '').trim();

export function labelsHtml(
  request: LabelRequest,
  items: Item[],
  firmName: string,
  t: (key: string) => string,
  fontCss = '',
) {
  const layout = LABEL_LAYOUTS[request.layout];
  if (!layout) throw new Error('validation');
  const labels: string[] = [];
  for (const { itemId, copies } of request.items) {
    const item = items.find((i) => i.id === itemId);
    const value = item ? labelValue(item) : '';
    if (!item || !canEncode(value)) throw new Error('validation');
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) throw new Error('validation');
    const f = request.fields;
    const barH = Math.max(6, layout.h * 0.38);
    const label = `<div class="label">
      ${f.firm ? `<div class="firm">${esc(firmName)}</div>` : ''}
      ${f.name ? `<div class="name">${esc(item.name)}</div>` : ''}
      <div class="bars">${code128Svg(value, { module: 0.25, height: barH, unit: 'mm', quiet: 6 })}</div>
      ${f.code ? `<div class="code">${esc(value)}</div>` : ''}
      <div class="price">${f.price ? `<b>${esc(formatINR(item.salePrice))}</b>` : ''}${
        f.mrp && item.mrp
          ? ` <span>${esc(t('inventory.label.mrp'))} ${esc(formatINR(item.mrp))}</span>`
          : ''
      }</div>
    </div>`;
    for (let i = 0; i < copies; i++) labels.push(label);
  }
  if (!labels.length || labels.length > 5000) throw new Error('validation');
  const margin = layout.roll ? 0 : 6;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('inventory.labels.title'))}</title><style>
${fontCss}
@page{size:${layout.page};margin:${margin}mm}
*{box-sizing:border-box}
body{margin:0;font-family:BillSathiPrint,Inter,"Noto Sans Devanagari",sans-serif;color:#000}
.sheet{display:grid;grid-template-columns:repeat(${layout.cols},${layout.w}mm);grid-auto-rows:${layout.h}mm;gap:0;justify-content:center}
.label{width:${layout.w}mm;height:${layout.h}mm;padding:1mm 1.5mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.1;${layout.roll ? 'page-break-after:always;' : ''}}
.firm{font-size:5.5pt;opacity:.8;white-space:nowrap;overflow:hidden;max-width:100%}
.name{font-size:7pt;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.bars svg{max-width:100%;display:block}
.code{font-size:6pt;letter-spacing:.5px}
.price{font-size:7.5pt}.price span{font-size:6pt}
</style></head><body><div class="sheet">${labels.join('')}</div></body></html>`;
}

export function transferHtml(
  transfer: StockTransfer,
  items: Item[],
  firmName: string,
  t: (key: string) => string,
  formatDate: (d: string) => string,
  fontCss = '',
) {
  const rows = transfer.lines
    .map((l, i) => {
      const item = items.find((x) => x.id === l.itemId);
      return `<tr><td>${i + 1}</td><td>${esc(item?.name ?? '')}</td><td>${esc(item?.code ?? '')}</td><td class="num">${esc(l.qty)}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('inventory.transfer.title'))} #${transfer.number}</title><style>
${fontCss}
@page{size:A4;margin:14mm}
body{font-family:BillSathiPrint,Inter,"Noto Sans Devanagari",sans-serif;font-size:10pt;color:#0f172a}
h1{font-size:16pt;margin:0 0 4px}.muted{color:#475569}
.route{display:flex;gap:24px;margin:14px 0;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
th{background:#f1f5f9}.num{text-align:right}.sign{display:flex;justify-content:space-between;margin-top:56px}
.sign div{border-top:1px solid #64748b;padding-top:4px;width:40%;text-align:center}
</style></head><body>
<h1>${esc(firmName)}</h1>
<div class="muted">${esc(t('inventory.transfer.title'))} #${transfer.number} · ${esc(formatDate(transfer.date))}</div>
<div class="route"><div><b>${esc(t('inventory.transfer.from'))}</b><br>${esc(transfer.from)}</div><div>→</div><div><b>${esc(t('inventory.transfer.to'))}</b><br>${esc(transfer.to)}</div></div>
<table><thead><tr><th>#</th><th>${esc(t('inventory.col.item'))}</th><th>${esc(t('inventory.col.code'))}</th><th class="num">${esc(t('inventory.col.qty'))}</th></tr></thead><tbody>${rows}</tbody></table>
${transfer.note ? `<p><b>${esc(t('inventory.transfer.note'))}:</b> ${esc(transfer.note)}</p>` : ''}
<div class="sign"><div>${esc(t('inventory.transfer.sentBy'))}</div><div>${esc(t('inventory.transfer.receivedBy'))}</div></div>
</body></html>`;
}
