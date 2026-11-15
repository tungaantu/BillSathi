import { app, BrowserWindow, dialog, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseContext } from './db';
import { reportService } from './services/reports';
import { gstr1Workbook } from './services/reports/gstr1-excel';
import { gstr1Json } from './services/reports/gstr1-json';
import { reportWorkbook } from './services/reports/excel';
import { reportHtml } from './services/reports/html';
import { translator } from './services/reports/labels';
import { reportDef, type ReportFilters, type ReportOutputResult } from '../shared/reports';

const font = (file: string, range: string) =>
  `@font-face{font-family:BillSathiPrint;src:url(data:font/woff2;base64,${readFileSync(require.resolve(file)).toString('base64')}) format('woff2');font-weight:100 900;unicode-range:${range}}`;
export const fontCss = () =>
  font(
    '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
    'U+0000-00FF,U+2000-206F,U+20A0-20CF',
  ) +
  font(
    '@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2',
    'U+0900-097F,U+1CD0-1CFF,U+A8E0-A8FF',
  );
const safeName = (text: string) => text.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');

/** Writing reports to disk and to the printer. Saving asks where; cancelling returns `path: null`. */
export function reportOutput(context: DatabaseContext) {
  const service = reportService(context);
  async function pickFile(name: string, extension: string, title: string) {
    const parent = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(parent, {
      title,
      defaultPath: `${name}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  }
  async function exportExcel(
    firm: number,
    id: string,
    filters: ReportFilters,
  ): Promise<ReportOutputResult> {
    if (!reportDef(id)) throw new Error('notFound');
    const settings = service.settings(firm),
      tr = translator(settings.language);
    const result = service.run(firm, id, filters);
    const header = service.header(firm, id, filters, settings);
    const path = await pickFile(`BillSathi-${safeName(header.title)}`, 'xlsx', header.title);
    if (!path) return { path: null };
    await reportWorkbook(result, header, tr, settings).xlsx.writeFile(path);
    return { path };
  }
  async function page(firm: number, id: string, filters: ReportFilters) {
    const settings = service.settings(firm);
    const header = service.header(firm, id, filters, settings);
    const html = reportHtml(service.run(firm, id, filters), header, translator(settings.language), {
      settings,
      landscape: Boolean(reportDef(id)?.wide),
      fontCss: fontCss(),
      language: String(settings.language ?? 'en'),
    });
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
    const file = join(app.getPath('temp'), `billsathi-report-${randomUUID()}.html`);
    writeFileSync(file, html);
    await window.loadFile(file);
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return {
      window,
      title: header.title,
      landscape: Boolean(reportDef(id)?.wide),
      done: () => {
        window.destroy();
        unlinkSync(file);
      },
    };
  }
  async function exportPdf(
    firm: number,
    id: string,
    filters: ReportFilters,
  ): Promise<ReportOutputResult> {
    const out = await page(firm, id, filters);
    try {
      const path = await pickFile(`BillSathi-${safeName(out.title)}`, 'pdf', out.title);
      if (!path) return { path: null };
      writeFileSync(
        path,
        await out.window.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          landscape: out.landscape,
        }),
      );
      return { path };
    } finally {
      out.done();
    }
  }
  async function print(
    firm: number,
    id: string,
    filters: ReportFilters,
  ): Promise<ReportOutputResult> {
    const out = await page(firm, id, filters);
    try {
      await new Promise<void>((resolve, reject) =>
        out.window.webContents.print(
          { silent: false, printBackground: true, landscape: out.landscape, pageSize: 'A4' },
          (success, reason) =>
            success || /cancel/i.test(reason) ? resolve() : reject(new Error('storage')),
        ),
      );
      return { path: null };
    } finally {
      out.done();
    }
  }
  async function gstr1(
    firm: number,
    filters: ReportFilters,
    kind: 'json' | 'xlsx',
  ): Promise<ReportOutputResult> {
    const settings = service.settings(firm);
    const data = service.gstr1(firm, filters);
    // The portal rejects a file without a valid GSTIN of the seller.
    if (data.issues.some((i) => i.severity === 'error')) throw new Error('validation');
    const path = await pickFile(`GSTR1-${data.fp}`, kind === 'json' ? 'json' : 'xlsx', 'GSTR-1');
    if (!path) return { path: null };
    if (kind === 'json') writeFileSync(path, JSON.stringify(gstr1Json(data), null, 2));
    else await (await gstr1Workbook(data, settings)).xlsx.writeFile(path);
    return { path };
  }
  return { exportExcel, exportPdf, print, gstr1 };
}
