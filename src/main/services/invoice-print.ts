import { formatDate } from '../../shared/dates';
import { app, BrowserWindow, dialog, screen, shell } from 'electron';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { DatabaseContext } from '../db';
import { salesRepository } from '../db/sales';
import { masterRepository } from '../db/masters';
import { attachments } from '../db/schema';
import { escapeHtml, invoiceHtml } from '../../shared/invoice-html';
import { displayDocumentNumber } from '../../shared/numbering';
import { formatINR, paiseToDecimal } from '../../shared/money';
import { en as ordersEn, hi as ordersHi } from '../../renderer/i18n/modules/orders';
import en from '../../renderer/i18n/en.json';
import hi from '../../renderer/i18n/hi.json';
import { financeRepository } from '../db/finance';
import { complianceStore } from './compliance/store';
import { en as complianceEn, hi as complianceHi } from '../../renderer/i18n/modules/compliance';
export function invoicePrint(context: DatabaseContext) {
  const sales = salesRepository(context),
    masters = masterRepository(context),
    compliance = complianceStore(context);
  const printFont = (file: string, range: string) =>
    `@font-face{font-family:BillSathiPrint;src:url(data:font/woff2;base64,${readFileSync(require.resolve(file)).toString('base64')}) format('woff2');font-weight:100 900;unicode-range:${range}}`;
  const fontCss =
    printFont(
      '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
      'U+0000-00FF,U+2000-206F,U+20A0-20CF',
    ) +
    printFont(
      '@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2',
      'U+0900-097F,U+1CD0-1CFF,U+A8E0-A8FF',
    );
  const image = (filename: string | null) => {
    if (!filename) return null;
    const bytes = readFileSync(join(app.getPath('userData'), 'images', basename(filename)));
    return `data:image/${extname(filename) === '.png' ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  };
  async function einvoiceBlock(firm: number, id: number, hindi: boolean) {
    const block = await compliance.printBlock(firm, id);
    const text = hindi ? complianceHi : complianceEn;
    return block
      ? {
          ...block,
          labels: {
            irn: text['compliance.print.irn'],
            ackNo: text['compliance.print.ackNo'],
            ackDate: text['compliance.print.ackDate'],
          },
        }
      : undefined;
  }
  async function preview(firm: number, id: number, theme?: string) {
    const doc = sales.get(firm, id),
      company = { ...sales.repo.get(firm) },
      settings = sales.repo.getSettings(firm);
    const bank = financeRepository(context)
      .accounts(firm)
      .filter((a) => a.type === 'bank' && a.printOnInvoice)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
    if (bank)
      Object.assign(company, {
        bankName: bank.bankName || bank.name,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        upiId: bank.upiId,
      });
    const strings: Record<string, string> =
      settings.language === 'hi' ? { ...hi, ...ordersHi } : { ...en, ...ordersEn };
    const labels = Object.fromEntries(
      Object.entries(strings)
        .filter(([k]) => k.startsWith('print.'))
        .map(([k, v]) => [k.slice(6), v]),
    );
    const units = Object.fromEntries(masters.lookups(firm).units.map((u) => [u.id, u.symbol]));
    const uri = new URLSearchParams({
      pa: company.upiId,
      pn: company.name,
      am: paiseToDecimal(doc.balance || doc.total),
      cu: 'INR',
    });
    const qr =
      company.upiId && settings.printQr
        ? await QRCode.toDataURL(`upi://pay?${uri.toString()}`, { width: 200, margin: 1 })
        : undefined;
    return invoiceHtml({
      firm: company,
      doc,
      settings,
      theme,
      labels,
      units,
      qr,
      fontCss,
      einvoice: await einvoiceBlock(firm, id, settings.language === 'hi'),
      logo: settings.printLogo ? image(company.logo) : null,
      signature: settings.printSignature ? image(company.signature) : null,
      partyBalance: masters.parties(firm).find((p) => p.id === doc.partyId)?.balance ?? 0,
    });
  }
  async function output(
    firm: number,
    id: number,
    action: 'pdf' | 'print' | 'thermal' | 'whatsapp' | 'email',
    theme?: string,
  ) {
    const settings = sales.repo.getSettings(firm),
      doc = sales.get(firm, id),
      company = sales.repo.get(firm);
    if (action === 'whatsapp' && !/^\d{10}$/.test(doc.phone)) throw new Error('phone');
    const thermal =
      action === 'thermal' || String(theme ?? settings.printTheme).startsWith('thermal');
    const html = await preview(
      firm,
      id,
      action === 'thermal' ? (theme === 'thermal58' ? 'thermal58' : 'thermal80') : theme,
    );
    const repeat = Boolean(settings.printRepeatHeader) && !thermal;
    const headerText = [
      settings.printHeader ? company.name : '',
      displayDocumentNumber(doc),
      formatDate(doc.date, settings),
      settings.printGstin ? company.gstin : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const primary = screen.getPrimaryDisplay(),
      target = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
    const window = new BrowserWindow({
      show: false,
      x: target.workArea.x,
      y: target.workArea.y,
      width: 900,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const temporary = join(app.getPath('temp'), `billsathi-${randomUUID()}.html`);
    writeFileSync(temporary, html);
    try {
      await window.loadFile(temporary);
      await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
      if (action === 'print' || action === 'thermal') {
        await new Promise<void>((resolve, reject) =>
          window.webContents.print(
            {
              silent: false,
              printBackground: true,
              header: repeat ? headerText : '',
              landscape: !thermal && settings.printOrientation === 'landscape',
              pageSize: thermal
                ? { width: theme === 'thermal58' ? 58000 : 80000, height: 297000 }
                : settings.printPaper === 'A5'
                  ? 'A5'
                  : 'A4',
            },
            (success, reason) =>
              success || /cancel/i.test(reason) ? resolve() : reject(new Error('storage')),
          ),
        );
        return null;
      }
      const bytes = await window.webContents.printToPDF({
        printBackground: true,
        displayHeaderFooter: repeat,
        headerTemplate: `<div style="font:8px Arial,sans-serif;width:100%;text-align:center;color:#64748b">${escapeHtml(headerText)}</div>`,
        footerTemplate: '<span></span>',
        preferCSSPageSize: true,
        landscape: !thermal && settings.printOrientation === 'landscape',
      });
      const number = displayDocumentNumber(doc),
        filename = `${number.replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
      let path: string;
      if (action === 'pdf') {
        const result = await dialog.showSaveDialog({
          defaultPath: filename,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (result.canceled || !result.filePath) return null;
        path = result.filePath;
      } else {
        const directory = join(app.getPath('documents'), 'BillSathi', String(firm));
        mkdirSync(directory, { recursive: true });
        path = join(directory, filename);
      }
      writeFileSync(path, bytes);
      if (action !== 'pdf') {
        const strings: Record<string, string> =
          settings.language === 'hi' ? { ...hi, ...ordersHi } : { ...en, ...ordersEn };
        const message = (String(settings.shareMessage) || strings['sales.shareDefault']).replace(
          /\{\{(firm|number|amount|balance)\}\}/g,
          (_m, k: string) =>
            ({
              firm: company.name,
              number,
              amount: formatINR(doc.total),
              balance: formatINR(doc.balance),
            })[k]!,
        );
        if (action === 'whatsapp') {
          if (!/^\d{10}$/.test(doc.phone)) throw new Error('phone');
          await shell.openExternal(
            `https://wa.me/91${doc.phone}?text=${encodeURIComponent(message)}`,
          );
        } else {
          const email = masters.parties(firm).find((p) => p.id === doc.partyId)?.email ?? '';
          await shell.openExternal(
            `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${company.name} ${number}`)}&body=${encodeURIComponent(message)}`,
          );
        }
        shell.showItemInFolder(path);
      }
      return path;
    } finally {
      window.destroy();
      unlinkSync(temporary);
    }
  }
  async function attach(firm: number) {
    sales.repo.get(firm);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF / PNG / JPEG', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }],
    });
    if (result.canceled) return null;
    const source = result.filePaths[0],
      ext = extname(source).toLowerCase();
    if (
      !['.pdf', '.png', '.jpg', '.jpeg'].includes(ext) ||
      statSync(source).size > 20 * 1024 * 1024
    )
      throw new Error('validation');
    const directory = join(app.getPath('userData'), 'attachments');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${randomUUID()}${ext}`);
    copyFileSync(source, path);
    try {
      return context.sqlite.transaction(() => {
        const row = context.db
          .insert(attachments)
          .values({ firmId: firm, path, name: basename(source) })
          .returning()
          .get();
        sales.repo.audit(firm, 'attachments', row.id, 'create', null, row);
        return { id: row.id, name: row.name };
      })();
    } catch (e) {
      unlinkSync(path);
      throw e;
    }
  }
  async function attachment(firm: number, id: number) {
    const row = context.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.firmId, firm), eq(attachments.id, id)))
      .get();
    if (!row) throw new Error('notFound');
    shell.showItemInFolder(row.path);
  }
  return { preview, output, attach, attachment };
}
