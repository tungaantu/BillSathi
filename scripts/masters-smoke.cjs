const { _electron: electron } = require('playwright');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('node:fs').mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true });
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-masters-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
    timeout: 60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) errors.push(m.text());
    });
    await page.waitForTimeout(800);
    const placement = await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0],
        primary = screen.getPrimaryDisplay(),
        secondary = screen.getAllDisplays().find((d) => d.id !== primary.id);
      return {
        secondary: secondary?.id,
        actual: screen.getDisplayMatching(window.getBounds()).id,
        maximized: window.isMaximized(),
      };
    });
    console.log('Window placement:', placement);
    if (placement.secondary) {
      assert.equal(placement.actual, placement.secondary);
      assert.equal(placement.maximized, true);
    }
    await page.waitForFunction(() => Boolean(window.api));
    const firm = await page.evaluate(async () => {
      const response = await window.api.firm.create({
        name: 'Masters Demo Store',
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
      if (!response.ok) throw new Error(response.error);
      for (const screen of ['home', 'parties', 'items', 'utilities', 'settings'])
        await window.api.settings.set(response.data.id, `tour.${screen}`, true);
      return response.data;
    });
    await page.reload();
    const route = async (value) => {
      await page.evaluate((value) => {
        location.hash = value;
      }, value);
    };
    const choose = async (name, value) => {
      await page.getByRole('combobox', { name, exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
    };
    const masterItems = () => page.evaluate(async () => (await window.api.masters.items(1)).data);
    const masterParties = () =>
      page.evaluate(async () => (await window.api.masters.parties(1)).data);
    await route('parties');
    await page.getByRole('button', { name: 'New Party', exact: true }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Asha Retail');
    await page.getByLabel('Phone number', { exact: true }).fill('123');
    await page.keyboard.press('Control+s');
    await page.getByRole('alert').filter({ hasText: '10-digit' }).waitFor();
    await page.getByLabel('Phone number', { exact: true }).fill('9876543210');
    await page.getByLabel('GSTIN', { exact: true }).fill('27AAPFU0939F1ZV');
    await page.getByRole('tab', { name: 'Credit & Balance', exact: true }).click();
    await choose('Balance direction', 'To Pay');
    await page.getByLabel('Opening balance (₹)', { exact: true }).fill('1234.56');
    await page.keyboard.press('Control+s');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await masterParties())[0].balance, -123456);
    assert.equal((await masterParties())[0].stateCode, '27');
    await page.getByRole('button', { name: 'Statement', exact: true }).click();
    await page.screenshot({ path: 'test-results/masters-parties.png' });
    // Print / PDF now opens the printable Party statement report (Reports).
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await page.getByRole('heading', { name: 'Party statement', exact: true }).waitFor();
    await route('parties');
    await page
      .getByRole('button', { name: /Asha Retail/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, continue', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('heading', { name: 'Asha Retail', exact: true }).waitFor();
    await route('items');
    await page.getByRole('button', { name: 'New Item', exact: true }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Notebook');
    await page.getByRole('button', { name: 'Assign Code', exact: true }).click();
    await page.getByLabel('HSN / SAC', { exact: true }).fill('4820');
    await page.getByLabel('New category name', { exact: true }).fill('Stationery');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await choose('Base unit', 'Pcs');
    await choose('Secondary unit', 'Box');
    await page.getByLabel('Base units in one secondary unit', { exact: true }).fill('12');
    await page.getByLabel('Sale price (₹)', { exact: true }).fill('15.25');
    await page.getByLabel('Purchase price (₹)', { exact: true }).fill('10.00');
    await page.getByRole('tab', { name: 'Stock', exact: true }).click();
    await page.getByLabel('Opening stock quantity', { exact: true }).fill('10');
    await page.getByLabel('Opening price per base unit (₹)', { exact: true }).fill('10');
    await page.keyboard.press('Control+s');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await masterItems())[0].qty, 10);
    assert.equal((await masterItems())[0].salePrice, 1525);
    await page.getByRole('button', { name: 'Adjust Stock', exact: true }).click();
    await choose('Base unit', 'Box');
    await page.getByLabel('Quantity', { exact: true }).fill('2');
    await page.getByLabel('Reason', { exact: true }).fill('Stock count');
    await page.keyboard.press('Control+s');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await masterItems())[0].qty, 34);
    assert.equal((await masterItems())[0].value, 34000);
    await page.screenshot({ path: 'test-results/masters-items.png' });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('tab', { name: 'Stock', exact: true }).click();
    assert.equal(
      await page.getByLabel('Opening stock quantity', { exact: true }).inputValue(),
      '10',
    );
    await page.getByLabel('Opening stock quantity', { exact: true }).fill('5');
    await page.keyboard.press('Control+s');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await masterItems())[0].qty, 29);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Save & New', exact: true }).click();
    await page.getByRole('dialog', { name: 'New Item', exact: true }).waitFor();
    await choose('Type', 'Service');
    assert.equal(await page.getByRole('tab', { name: 'Stock', exact: true }).count(), 0);
    await page.getByLabel('Name', { exact: true }).fill('Consultation');
    await page.getByLabel('Sale price (₹)', { exact: true }).fill('500');
    await page.keyboard.press('Control+s');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await masterItems()).length, 2);
    assert.equal((await masterItems()).find((i) => i.type === 'product').name, 'Notebook');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Search anything…', exact: true }).fill('Asha Retail');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Asha Retail', exact: true }).waitFor();
    await route('utilities');
    const csv = join(userData, 'import.csv');
    writeFileSync(
      csv,
      'name,code,salePrice,openingQty,openingPrice\nPen,PEN,12.34,20,10\nBad,BAD,12.345,1,1\n',
    );
    await app.evaluate(({ dialog }, csv) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [csv] });
    }, csv);
    await page.getByRole('button', { name: 'Choose .xlsx / .csv', exact: true }).first().click();
    await page.getByRole('button', { name: 'Validate & Preview', exact: true }).click();
    await page.getByRole('heading', { name: '1 ready · 1 need correction', exact: true }).waitFor();
    await page.screenshot({ path: 'test-results/masters-import.png' });
    await page.getByRole('button', { name: 'Import 1 valid rows', exact: true }).click();
    await page
      .getByText('Imported 1 records; skipped 1 invalid rows.', { exact: true })
      .first()
      .waitFor();
    assert.equal((await masterItems()).length, 3);
    const target = join(userData, 'export.xlsx');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, target);
    await page.getByRole('button', { name: 'Export to Excel', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Excel file saved' }).waitFor();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(target);
    assert.equal(book.worksheets[0].rowCount, 4);
    const dashboard = await page.evaluate(async () => (await window.api.dashboard.get(1)).data);
    assert.equal(dashboard.stock, 49000);
    assert.equal(dashboard.checklist.party, true);
    assert.equal(dashboard.checklist.item, true);
    await route('settings/party');
    await page
      .getByRole('switch', { name: 'Party active / inactive status', exact: true })
      .waitFor();
    await page.getByLabel('Custom field 1 name', { exact: true }).fill('Delivery route');
    await page.getByLabel('Custom field 1 name', { exact: true }).blur();
    await page.getByRole('button', { name: 'Change language', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.lang === 'hi');
    await route('items');
    await page
      .getByRole('heading', {
        name: require('../src/renderer/i18n/hi.json')['nav.items'],
        exact: true,
      })
      .waitFor();
    await page.screenshot({ path: 'test-results/masters-hindi.png' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: secondary placement, parties, GST state, payable opening, ledger, delete/undo, item sheets, current draft save, unit conversion, opening edits, palette search, import preview, valid-row import, XLSX export, dashboard, settings, Hindi.',
    );
    console.log('Data directory:', userData, 'Firm:', firm.id);
  } finally {
    await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
