import ExcelJS from 'exceljs';
import { statSync } from 'node:fs';
import { extname } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import type { DatabaseContext } from '../db';
import { masterRepository } from '../db/masters';
import {
  importFields,
  validateImport,
  type ImportKind,
  type ImportSheet,
} from '../../shared/master-import';
import { paiseToDecimal } from '../../shared/money';
import type { ItemInput, PartyInput } from '../../shared/masters';
import en from '../../renderer/i18n/en.json';
import hi from '../../renderer/i18n/hi.json';
const sheetSchema = z.object({
  headers: z.array(z.string().max(200)).min(1).max(100),
  rows: z.array(z.array(z.string().max(5000)).max(100)).max(10000),
});
export function masterFiles(context: DatabaseContext) {
  const repo = masterRepository(context);
  function preview(
    firm: number,
    kind: ImportKind,
    sheet: ImportSheet,
    mapping: Record<string, string>,
  ) {
    sheet = sheetSchema.parse(sheet);
    mapping = z.record(z.string(), z.string().max(200)).parse(mapping);
    const lookups = repo.lookups(firm);
    return validateImport(kind, sheet, mapping, {
      codes: repo.items(firm).map((i) => i.code),
      taxes: lookups.taxes,
      units: lookups.units,
      categories: lookups.categories,
    });
  }
  async function readImport(): Promise<ImportSheet | null> {
    const selected = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0], {
      properties: ['openFile'],
      filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
    });
    if (selected.canceled) return null;
    const path = selected.filePaths[0];
    if (statSync(path).size > 10 * 1024 * 1024) throw new Error('validation');
    const book = new ExcelJS.Workbook();
    if (extname(path).toLowerCase() === '.csv') await book.csv.readFile(path);
    else await book.xlsx.readFile(path);
    const worksheet = book.worksheets[0];
    if (!worksheet || worksheet.rowCount > 10001 || worksheet.columnCount > 100)
      throw new Error('validation');
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= worksheet.columnCount; c++) {
        const cell = row.getCell(c);
        if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error)
          throw new Error('validation');
        cells.push(
          cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text.trim(),
        );
      }
      rows.push(cells);
    });
    const headers = rows.shift() ?? [];
    if (new Set(headers).size !== headers.length || headers.some((h) => !h))
      throw new Error('validation');
    return sheetSchema.parse({ headers, rows: rows.filter((r) => r.some(Boolean)) });
  }
  function importRows(
    firm: number,
    kind: ImportKind,
    sheet: ImportSheet,
    mapping: Record<string, string>,
  ) {
    return context.sqlite.transaction(() => {
      const checked = preview(firm, kind, sheet, mapping);
      for (const row of checked.rows)
        if (row.data) {
          if (kind === 'parties') repo.savePartyRaw(firm, null, row.data as PartyInput);
          else repo.saveItemRaw(firm, null, row.data as ItemInput);
        }
      return { imported: checked.valid, skipped: checked.invalid };
    })();
  }
  async function exportRows(firm: number, kind: ImportKind, sample = false) {
    const lookups = repo.lookups(firm);
    const settings = context.sqlite
      .prepare("SELECT value FROM settings WHERE firm_id=? AND key='language'")
      .get(firm);
    const strings = settings?.value === '"hi"' ? hi : en;
    const selected = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0], {
      title: strings[sample ? 'masters.sample' : 'masters.export'],
      defaultPath: `BillSathi-${kind}${sample ? '-template' : ''}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (selected.canceled || !selected.filePath) return false;
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet(kind);
    const fields = [...importFields[kind]];
    sheet.columns = fields.map((key) => ({ header: key, key, width: 23 }));
    const moneyFields = [
      'openingBalance',
      'creditLimit',
      'salePrice',
      'purchasePrice',
      'openingPrice',
      'wholesalePrice',
      'mrp',
      'discountAmount',
    ];
    const rows = sample ? [] : kind === 'parties' ? repo.parties(firm) : repo.items(firm);
    for (const entry of rows) {
      const data: Record<string, unknown> = { ...entry };
      if ('qty' in entry) {
        data.discountPercent = paiseToDecimal(entry.discountBps);
        data.unit = lookups.units.find((u) => u.id === entry.unitId)?.symbol ?? '';
        data.secondaryUnit =
          lookups.units.find((u) => u.id === entry.secondaryUnitId)?.symbol ?? '';
        data.category = lookups.categories.find((c) => c.id === entry.categoryId)?.name ?? '';
        data.taxRate = entry.taxRateId
          ? (lookups.taxes.find((t) => t.id === entry.taxRateId)?.rateBps ?? 0) / 100
          : '';
      }
      for (const key of moneyFields)
        if (typeof data[key] === 'number') data[key] = paiseToDecimal(data[key] as number);
      sheet.addRow(data);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: 'A1',
      to: { row: Math.max(1, sheet.rowCount), column: fields.length },
    };
    await book.xlsx.writeFile(selected.filePath);
    return true;
  }
  return { preview, readImport, importRows, exportRows };
}
