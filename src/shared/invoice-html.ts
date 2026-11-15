import { formatDate } from './dates';
import type { Firm, Settings } from './types';
import type { SavedDocument } from './sales';
import { totals } from './sales';
import { amountInWords } from './words';
import { decimalScaled, formatINR, sumPaise } from './money';
import { PRINT_DEFAULTS, THEMES } from './print-settings';
import { displayDocumentNumber } from './numbering';
import { STATES } from './constants';
export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export interface InvoiceHtmlInput {
  firm: Firm;
  doc: SavedDocument;
  settings: Settings;
  labels: Record<string, string>;
  theme?: string;
  qr?: string;
  logo?: string | null;
  signature?: string | null;
  partyBalance?: number;
  units?: Record<number, string>;
  fontCss?: string;
  /** Set once the IRN has been pasted back from the e-invoice portal. */
  einvoice?: {
    irn: string;
    ackNo: string;
    ackDate: string;
    qr?: string;
    labels: { irn: string; ackNo: string; ackDate: string };
  };
}
export function invoiceHtml(input: InvoiceHtmlInput) {
  const { firm, doc, labels } = input,
    s = { ...PRINT_DEFAULTS, ...input.settings };
  const theme = THEMES.includes((input.theme ?? s.printTheme) as (typeof THEMES)[number])
    ? String(input.theme ?? s.printTheme)
    : 'classic';
  const thermal = theme.startsWith('thermal'),
    width = theme === 'thermal58' ? 58 : 80;
  const e = escapeHtml,
    t = (key: string) => e(labels[key] ?? key),
    money = (n: number) => e(formatINR(n));
  const c = totals(doc, doc.firmState ?? firm.stateCode);
  const sameState = (doc.firmState ?? firm.stateCode) === doc.placeOfSupply;
  const state = STATES.find((s) => s.code === doc.placeOfSupply);
  const supplyName = `${doc.placeOfSupply}${state ? ' · ' + (labels.lang === 'hi' ? state.hi : state.en) : ''}`;
  const accent = /^#[0-9a-f]{6}$/i.test(String(s.printAccent)) ? String(s.printAccent) : '#2563EB';
  const quantityOnly =
    ['delivery_challan', 'challan_return'].includes(doc.type) && !s.challanAmount;
  if (quantityOnly)
    Object.assign(s, {
      printPrice: false,
      printDiscount: false,
      printTax: false,
      printTaxSummary: false,
      printWords: false,
      printSavings: false,
      printReceived: false,
      printPartyBalance: false,
      printQr: false,
      printAcknowledgement: false,
    });
  const title = ['sale_order', 'delivery_challan', 'challan_return', 'proforma'].includes(doc.type)
    ? labels[`type.${doc.type}`] || ''
    : String(s.printTitle) || labels[`type.${doc.type}`] || '';
  const picture = (src: string | null | undefined, kind: string) =>
    src && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)
      ? `<img class="${kind}" src="${src}" alt="${t(kind)}">`
      : '';
  const cols = [
    ['name', true],
    ['hsn', s.printHsn],
    ['qty', s.printQty],
    ['unit', s.printUnit],
    ['price', s.printPrice],
    ['discount', s.printDiscount],
    ['taxable', true],
    ['cgst', s.printTax],
    ['sgst', s.printTax],
    ['igst', s.printTax],
    ['cess', s.printTax && c.cess > 0],
    ['amount', true],
  ]
    .filter(
      ([key, show]) =>
        show && (!quantityOnly || ['name', 'hsn', 'qty', 'unit'].includes(String(key))),
    )
    .map(([key]) => String(key));
  const rows = doc.lines.map((line, i) => {
    const r = c.lines[i];
    const values: Record<string, string> = {
      name: e(line.name),
      hsn: e(line.hsn),
      qty: e(`${line.qty}${line.freeQty ? ` + ${line.freeQty}` : ''}`),
      unit: e(input.units?.[line.unitId ?? 0] ?? ''),
      price: money(line.price),
      discount: money(sumPaise([r.discount, r.transactionDiscount])),
      taxable: money(r.taxable),
      cgst: `${sameState ? line.taxBps / 200 : 0}%<br>${money(r.cgst)}`,
      sgst: `${sameState ? line.taxBps / 200 : 0}%<br>${money(r.sgst)}`,
      igst: `${!sameState ? line.taxBps / 100 : 0}%<br>${money(r.igst)}`,
      cess: `${line.cessBps / 100}%<br>${money(r.cess)}`,
      amount: money(r.total),
    };
    if (thermal && quantityOnly)
      return `<tr><td>${values.name}</td><td>${values.qty} ${values.unit}</td></tr>`;
    if (thermal)
      return `<tr><td><strong>${values.name}</strong><p>${s.printHsn ? `${t('hsn')}: ${values.hsn} · ` : ''}${s.printQty ? values.qty : ''} ${s.printUnit ? values.unit : ''} ${s.printPrice ? `× ${values.price}` : ''}</p><p>${t('taxable')}: ${values.taxable}</p>${s.printDiscount ? `<p>${t('discount')}: ${values.discount}</p>` : ''}${s.printTax ? `<p>${t('cgst')} ${values.cgst.replace('<br>', ' ')} · ${t('sgst')} ${values.sgst.replace('<br>', ' ')}<br>${t('igst')} ${values.igst.replace('<br>', ' ')}${r.cess ? ` · ${t('cess')} ${values.cess.replace('<br>', ' ')}` : ''}</p>` : ''}</td><td class="num">${values.amount}</td></tr>`;
    return `<tr>${cols.map((k) => `<td class="${k === 'name' ? '' : 'num'}">${values[k]}</td>`).join('')}</tr>`;
  });
  for (let i = rows.length; !thermal && i < Number(s.printMinRows); i++)
    rows.push(`<tr class="blank">${cols.map(() => '<td>&nbsp;</td>').join('')}</tr>`);
  const groups = new Map<
    string,
    { taxable: number; cgst: number; sgst: number; igst: number; cess: number; rate: number }
  >();
  [
    ...doc.lines.map((l, i) => ({ hsn: l.hsn, rate: l.taxBps, c: c.lines[i] })),
    ...doc.charges.map((l, i) => ({ hsn: labels.charges ?? '', rate: l.taxBps, c: c.charges[i] })),
  ].forEach(({ hsn, rate, c: r }) => {
    const key = `${hsn}/${rate}`,
      prev = groups.get(key);
    groups.set(key, {
      rate,
      taxable: sumPaise([prev?.taxable ?? 0, r.taxable]),
      cgst: sumPaise([prev?.cgst ?? 0, r.cgst]),
      sgst: sumPaise([prev?.sgst ?? 0, r.sgst]),
      igst: sumPaise([prev?.igst ?? 0, r.igst]),
      cess: sumPaise([prev?.cess ?? 0, r.cess]),
    });
  });
  const taxSummary = s.printTaxSummary
    ? `<h3>${t('taxSummary')}</h3><table><thead><tr>${['hsn', 'rate', 'taxable', 'cgst', 'sgst', 'igst', ...(c.cess ? ['cess'] : [])].map((k) => `<th>${t(labels['column.' + k] ? 'column.' + k : k)}</th>`).join('')}</tr></thead><tbody>${[...groups].map(([key, r]) => `<tr><td>${e(key.slice(0, key.lastIndexOf('/')))}</td><td>${r.rate / 100}%</td>${[r.taxable, r.cgst, r.sgst, r.igst, ...(c.cess ? [r.cess] : [])].map((n) => `<td class="num">${money(n)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';
  const totalRow = (label: string, value: number, bold = false) =>
    quantityOnly
      ? ''
      : `<div class="sum ${bold ? 'grand' : ''}"><span>${t(label)}</span><strong>${money(value)}</strong></div>`;
  const summaryHtml =
    thermal && s.printTaxSummary
      ? `<h3>${t('taxSummary')}</h3>${[...groups].map(([key, r]) => `<section class="thermal-tax"><strong>${t('hsn')}: ${e(key.slice(0, key.lastIndexOf('/')))} · ${r.rate / 100}%</strong><p>${t('taxable')}: ${money(r.taxable)}</p><p>${t('cgst')}: ${money(r.cgst)} · ${t('sgst')}: ${money(r.sgst)}<br>${t('igst')}: ${money(r.igst)}${r.cess ? ` · ${t('cess')}: ${money(r.cess)}` : ''}</p></section>`).join('')}`
      : taxSummary;
  const totalQty =
    Number(
      doc.lines.reduce((n, l) => n + decimalScaled(l.qty, 3) + decimalScaled(l.freeQty, 3), 0n),
    ) / 1000;
  const einv = input.einvoice
    ? `<section class="einv" style="display:flex;gap:10px;align-items:center;margin:0 0 10px;font-size:8pt;overflow-wrap:anywhere">${picture(input.einvoice.qr, 'qr').replace('<img ', '<img style="width:80px;height:80px" ')}<div><p><strong>${e(input.einvoice.labels.irn)}:</strong> ${e(input.einvoice.irn)}</p><p>${e(input.einvoice.labels.ackNo)}: ${e(input.einvoice.ackNo)} · ${e(input.einvoice.labels.ackDate)}: ${e(input.einvoice.ackDate)}</p></div></section>`
    : '';
  const copyNames = ['original', 'duplicate', 'triplicate'];
  const copies = Array.from(
    { length: Math.max(1, Math.min(3, Number(s.printCopies) || 1)) },
    (_, index) => `<article class="invoice ${theme}">
    <header>${s.printHeader ? `<div class="company">${s.printLogo ? picture(input.logo, 'logo') : ''}<div><h1>${e(firm.name)}</h1>${s.printAddress ? `<p>${e(firm.address)}</p><p>${e(firm.phone)} ${e(firm.email)}</p>` : ''}${s.printGstin && firm.gstin ? `<p>${t('gstin')}: ${e(firm.gstin)}</p>` : ''}</div></div>` : ''}<div><h2>${e(title)}</h2><p>${t(copyNames[index])}</p><p>${t('number')}: <strong>${e(displayDocumentNumber({ ...doc, type: doc.type }))}</strong></p><p>${t('date')}: ${e(formatDate(doc.date, s))}</p>${doc.supplierBillNo ? `<p>${t('supplierBillNo')}: ${e(doc.supplierBillNo)}</p>` : ''}${doc.supplierBillDate ? `<p>${t('supplierBillDate')}: ${e(formatDate(doc.supplierBillDate, s))}</p>` : ''}${doc.dueDate ? `<p>${t('dueDate')}: ${e(formatDate(doc.dueDate, s))}</p>` : ''}</div></header>
    ${doc.status === 'cancelled' ? `<h2>${t('cancelled')}</h2>` : ''}
    <section class="party"><div><strong>${e(doc.partyName) || t('walkIn')}</strong><p>${e(doc.billingAddress)}</p><p>${e(doc.phone)}</p><p>${t('gstin')}: ${e(doc.partyGstin) || t('unregistered')}</p></div><div>${doc.shippingAddress ? `<strong>${t('shippingAddress')}</strong><p>${e(doc.shippingAddress)}</p>` : ''}<p>${t('placeOfSupply')}: ${e(supplyName)}</p><p>${t('reverseCharge')}</p>${doc.refTxnId ? `<p>${t('reference')}: ${doc.refTxnId}</p>` : ''}</div></section>${einv}
    <table class="items"><thead><tr>${(thermal ? ['name', quantityOnly ? 'qty' : 'amount'] : cols).map((k) => `<th>${t(labels['column.' + k] ? 'column.' + k : k)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
    <section class="bottom"><div>${!quantityOnly && doc.charges.length ? `<p><strong>${t('chargesIncluded')}</strong></p>${doc.charges.map((charge, i) => `<p>${e(charge.name)}: ${money(c.charges[i].taxable)}</p>`).join('')}` : ''}${s.printWords ? `<p><strong>${t('words')}</strong><br>${e(amountInWords(c.total))}</p>` : ''}${s.printTotalQty ? `<p>${t('totalQty')}: ${totalQty}</p>` : ''}${s.printSavings ? `<p>${t('savings')}: ${money(sumPaise([c.lineDiscount, c.transactionDiscount]))}</p>` : ''}</div><div class="totals">${totalRow('taxable', c.taxable)}${totalRow('cgst', c.cgst)}${totalRow('sgst', c.sgst)}${totalRow('igst', c.igst)}${c.cess ? totalRow('cess', c.cess) : ''}${totalRow('roundOff', c.roundOff)}${totalRow('total', c.total, true)}${s.printReceived ? `${totalRow('received', doc.received)}${totalRow('balance', doc.balance)}` : ''}${s.printPartyBalance ? totalRow('partyBalance', input.partyBalance ?? 0) : ''}</div></section>
    ${summaryHtml}
    <footer>${s.printDescription && doc.description ? `<p><strong>${t('description')}</strong><br>${e(doc.description)}</p>` : ''}${s.printTerms && doc.terms ? `<p><strong>${t('terms')}</strong><br>${e(doc.terms)}</p>` : ''}
    <div class="footer-grid">${s.printBank && [firm.bankName, firm.accountNumber, firm.ifsc, firm.upiId].some(Boolean) ? `<div><strong>${t('bank')}</strong>${firm.bankName ? `<p>${e(firm.bankName)}</p>` : ''}${firm.accountNumber || firm.ifsc ? `<p>${e([firm.accountNumber, firm.ifsc].filter(Boolean).join(' '))}</p>` : ''}${firm.upiId ? `<p>${e(firm.upiId)}</p>` : ''}</div>` : ''}${s.printQr && input.qr ? `<div class="qr-caption">${picture(input.qr, 'qr')}<p>${t('scanToPay')} ${money(doc.balance || doc.total)}<br>${e(firm.upiId)}</p></div>` : ''}${s.printSignature ? `<div>${picture(input.signature, 'signature')}<p>${t('signature')}</p></div>` : ''}</div>
    ${s.printReceivedBy || s.printDeliveredBy ? `<div class="boxes">${s.printReceivedBy ? `<div>${t('receivedBy')}</div>` : ''}${s.printDeliveredBy ? `<div>${t('deliveredBy')}</div>` : ''}</div>` : ''}${s.printAcknowledgement ? `<div class="boxes"><div>${t('acknowledgement')} · ${e(displayDocumentNumber(doc))} · ${money(c.total)}</div></div>` : ''}</footer></article>`,
  );
  return `<!doctype html><html lang="${e(labels.lang ?? 'en')}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${e(title)} ${e(displayDocumentNumber(doc))}</title><style>
  ${input.fontCss ?? ''}
  @page{size:${thermal ? `${width}mm 297mm` : `${s.printPaper === 'A5' ? 'A5' : 'A4'} ${s.printOrientation === 'landscape' ? 'landscape' : 'portrait'}`};margin:${thermal ? '3mm' : '10mm'}}
  *{box-sizing:border-box}body{margin:0;background:white;color:#0f172a;font:${Math.max(8, Math.min(18, Number(s.printFont) || 11))}pt BillSathiPrint,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:24px;margin:0 0 8px}h2{font-size:19px;margin:0 0 8px;color:${accent}}h3{font-size:12px}header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid ${accent};padding-bottom:15px}header>div:last-child{text-align:right}.invoice{padding-top:${Math.min(50, Math.max(0, Number(s.printTopSpace) || 0))}mm;break-after:page}.invoice:last-child{break-after:auto}.company{display:flex;gap:12px}.logo{width:64px;height:64px;object-fit:contain}.party{display:flex;justify-content:space-between;gap:20px;margin:16px 0}.party>div{width:48%}table{border-collapse:collapse;width:100%;table-layout:auto}th{white-space:nowrap;overflow-wrap:normal;min-width:32px;background:${accent};color:white;text-align:left;font-weight:600}.items td:first-child{min-width:${s.printPaper === 'A5' ? 55 : 85}px;width:20%}table{font-size:${s.printPaper === 'A5' ? Math.min(8, Number(s.printFont)) : Math.min(10, Number(s.printFont))}pt}td,th{padding:7px 5px;border:1px solid #e2e8f0;overflow-wrap:anywhere}.num{text-align:right;white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid}.blank{height:25px}.bottom{display:flex;justify-content:space-between;gap:20px;padding-top:12px}.bottom>div{width:48%}.sum{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.grand{border-top:2px solid ${accent};font-size:16px}.footer-grid{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-top:16px}.qr-caption{text-align:center;max-width:180px}.qr-caption p{font-size:9px}.qr{width:96px;height:96px}.signature{width:100px;height:48px;object-fit:contain}.boxes{display:flex;gap:16px;margin-top:18px}.boxes>div{border:1px solid #e2e8f0;padding:12px;min-height:55px;flex:1}footer{margin-top:18px;break-inside:avoid}
  .modern header{background:${accent};padding:20px;color:white;border-radius:12px}.modern h2{color:white}.modern th{background:#f5f7fb;color:#0f172a}.minimal th{background:white;color:#0f172a;border-width:0 0 1px}.minimal td{border-width:0 0 1px}.minimal header{border-width:1px}.bold header{border-top:12px solid ${accent};padding-top:20px}.bold h1{text-transform:uppercase;font-size:30px}.compact td,.compact th{padding:4px}.compact .blank{height:16px}.compact .party{margin:8px 0}.elegant{font-family:Georgia,BillSathiPrint,serif}.elegant header{border-bottom:double 4px ${accent}}.elegant h1{letter-spacing:1px}.elegant th{background:white;color:${accent};border-bottom:2px solid ${accent}}
  ${thermal ? `body{font-size:9px;width:${width - 6}mm}.items td:first-child{width:75%;min-width:0}.items td:last-child{width:25%;vertical-align:top}.invoice header,.party,.bottom,.footer-grid{display:block}.company{display:block}header>div:last-child{text-align:left}h1{font-size:16px}h2{font-size:13px}.party>div,.bottom>div{width:100%}td,th{padding:3px 1px;font-size:9px}td{white-space:normal}th{white-space:nowrap;min-width:0}.blank{display:none}th{background:white;color:#0f172a}.qr{display:block;margin:auto}.grand{font-size:13px}.logo{width:40px;height:40px}` : ''}
  .bottom{break-inside:avoid}.blank td{padding-top:0;padding-bottom:0}
  </style></head><body>${copies.join('')}</body></html>`;
}
