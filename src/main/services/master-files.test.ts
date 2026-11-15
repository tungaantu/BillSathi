import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
const dialogs = vi.hoisted(() => ({ showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{}] }, dialog: dialogs }));
import { masterFiles } from './master-files';
import { openDatabase, type DatabaseContext } from '../db';
import { repositories } from '../db/repositories';
import { masterRepository } from '../db/masters';
import { blankItem } from '../../shared/masters';
const resources: { context: DatabaseContext; path: string }[] = [];
async function setup() {
  const path = mkdtempSync(join(tmpdir(), 'billsathi-files-')),
    context = await openDatabase(path);
  resources.push({ context, path });
  const firm = repositories(context).create({
    name: 'Shop',
    phone: '9876543210',
    category: 'grocery',
    stateCode: '29',
    gstin: '',
    pan: '',
    address: '',
    email: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    upiId: '',
    demo: false,
  });
  return { path, context, firm, files: masterFiles(context), masters: masterRepository(context) };
}
afterEach(() => {
  vi.clearAllMocks();
  for (const { context, path } of resources.splice(0)) {
    context.sqlite.close();
    if (!path.startsWith(join(tmpdir(), 'billsathi-files-'))) throw new Error('Unexpected path');
    rmSync(path, { recursive: true, force: true });
  }
});
it('reads CSV and XLSX, maps, previews and imports only valid rows', async () => {
  const { files, firm, path, masters } = await setup();
  const csv = join(path, 'parties.csv');
  writeFileSync(csv, 'Customer,Phone,Balance\nAsha,9876543210,-12.34\nBad,123,10\n');
  dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [csv] });
  const sheet = (await files.readImport())!;
  const mapping = { name: 'Customer', phone: 'Phone', openingBalance: 'Balance' };
  expect(files.preview(firm.id, 'parties', sheet, mapping)).toMatchObject({ valid: 1, invalid: 1 });
  expect(files.importRows(firm.id, 'parties', sheet, mapping)).toEqual({ imported: 1, skipped: 1 });
  expect(masters.parties(firm.id)[0]).toMatchObject({ name: 'Asha', openingBalance: -1234 });
  const xlsx = join(path, 'items.xlsx'),
    book = new ExcelJS.Workbook();
  const ws = book.addWorksheet('Items');
  ws.addRow(['name', 'salePrice', 'openingQty']);
  ws.addRow(['Notebook', '12.34', '2.5']);
  await book.xlsx.writeFile(xlsx);
  dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [xlsx] });
  const itemSheet = (await files.readImport())!;
  expect(
    files.importRows(firm.id, 'items', itemSheet, {
      name: 'name',
      salePrice: 'salePrice',
      openingQty: 'openingQty',
    }),
  ).toEqual({ imported: 1, skipped: 0 });
  expect(masters.items(firm.id)[0]).toMatchObject({ salePrice: 1234, openingQty: 2.5 });
});
it('exports rupee strings and headers, exports samples, and preserves existing stock when importing copies', async () => {
  const { files, masters, firm, path } = await setup();
  masters.saveItem(firm.id, null, {
    ...blankItem(),
    name: 'Pencil',
    salePrice: 29,
    openingQty: 3,
    openingPrice: 20,
  });
  const exported = join(path, 'export.xlsx');
  dialogs.showSaveDialog.mockResolvedValue({ canceled: false, filePath: exported });
  expect(await files.exportRows(firm.id, 'items')).toBe(true);
  dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [exported] });
  const sheet = (await files.readImport())!;
  expect(sheet.rows[0][sheet.headers.indexOf('salePrice')]).toBe('0.29');
  files.importRows(firm.id, 'items', sheet, Object.fromEntries(sheet.headers.map((h) => [h, h])));
  expect(masters.items(firm.id)).toHaveLength(2);
  expect(masters.items(firm.id)[1]).toMatchObject({ qty: 3, value: 60 });
  const template = join(path, 'sample.xlsx');
  dialogs.showSaveDialog.mockResolvedValue({ canceled: false, filePath: template });
  await files.exportRows(firm.id, 'parties', true);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(template);
  expect(book.worksheets[0].rowCount).toBe(1);
  expect(book.worksheets[0].getRow(1).getCell(1).text).toBe('name');
});
it('rolls back the entire import if a storage failure happens after validation', async () => {
  const { files, firm, path, masters } = await setup();
  // A directory at the atomic-write path simulates disk failure after all SQL writes.
  const { mkdirSync, rmdirSync } = await import('node:fs');
  mkdirSync(join(path, 'billsathi.db.tmp'));
  expect(() =>
    files.importRows(
      firm.id,
      'parties',
      { headers: ['name'], rows: [['Asha'], ['Meera']] },
      { name: 'name' },
    ),
  ).toThrow();
  expect(masters.parties(firm.id)).toHaveLength(0);
  rmdirSync(join(path, 'billsathi.db.tmp'));
  expect(
    files.importRows(
      firm.id,
      'parties',
      { headers: ['name'], rows: [['Asha'], ['Meera']] },
      { name: 'name' },
    ).imported,
  ).toBe(2);
});
it('rejects formula cells and handles file-dialog cancellation', async () => {
  const { files, firm, path } = await setup();
  dialogs.showOpenDialog.mockResolvedValue({ canceled: true });
  expect(await files.readImport()).toBeNull();
  dialogs.showSaveDialog.mockResolvedValue({ canceled: true });
  expect(await files.exportRows(firm.id, 'items')).toBe(false);
  const file = join(path, 'formula.xlsx'),
    book = new ExcelJS.Workbook();
  const ws = book.addWorksheet('Items');
  ws.addRow(['name']);
  ws.getCell('A2').value = { formula: '1+1', result: 2 };
  await book.xlsx.writeFile(file);
  dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] });
  await expect(files.readImport()).rejects.toThrow('validation');
});
