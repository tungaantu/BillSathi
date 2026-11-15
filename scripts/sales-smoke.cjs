const { _electron: electron } = require('playwright');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('node:fs').mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true });
const assert = require('node:assert/strict');
async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-sales-'));
  const errors = [];
  let app, page;
  async function launch() {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) errors.push(m.text());
    });
    await page.waitForFunction(() => Boolean(window.api));
    const placement = await app.evaluate(({ BrowserWindow, screen }) => {
      const secondary = screen.getAllDisplays().find((d) => d.id !== screen.getPrimaryDisplay().id);
      return {
        secondary: secondary?.id,
        actual: screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id,
      };
    });
    if (placement.secondary) assert.equal(placement.secondary, placement.actual);
    await app.evaluate(({ app, shell }, directory) => {
      app.setPath('documents', directory);
      globalThis.salesExternal = [];
      globalThis.salesPrint = [];
      shell.openExternal = async (url) => {
        globalThis.salesExternal.push(url);
      };
      shell.showItemInFolder = () => {};
      app.on('browser-window-created', (_event, window) => {
        window.webContents.print = (options, callback) => {
          globalThis.salesPrint.push(options);
          callback(true);
        };
      });
    }, userData);
  }
  const route = async (value) => {
    await page.evaluate((v) => {
      location.hash = v;
    }, value);
  };
  const choose = async (name, option) => {
    await page.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: option }).click();
  };
  const list = () =>
    page.evaluate(async () => {
      const r = await window.api.sales.list(1);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    });
  try {
    await launch();
    await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Sample Store',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '29',
          gstin: '',
          pan: '',
          address: 'Bengaluru',
          email: '',
          bankName: 'Test Bank',
          accountNumber: '123456789',
          ifsc: 'TEST0000001',
          upiId: 'store@upi',
          demo: false,
        }),
      );
      for (const screen of [
        'home',
        'invoices',
        'estimates',
        'saleReturns',
        'paymentIn',
        'saleOrders',
        'settings',
      ])
        unwrap(await window.api.settings.set(firm.id, `tour.${screen}`, true));
      unwrap(await window.api.settings.set(firm.id, 'roundOff', false));
      unwrap(
        await window.api.masters.saveParty(firm.id, null, {
          name: 'Asha Retail',
          phone: '9876543210',
          email: 'asha@example.com',
          gstType: 'consumer',
          gstin: '',
          stateCode: '29',
          billingAddress: 'Bengaluru',
          shippingAddress: 'Mysuru',
          openingBalance: 0,
          openingDate: '2026-11-10',
          creditLimit: 10000,
          groupId: null,
          customFields: {},
          active: true,
        }),
      );
      const lookups = unwrap(await window.api.masters.lookups(firm.id));
      unwrap(
        await window.api.masters.saveItem(firm.id, null, {
          name: 'Notebook',
          type: 'product',
          code: 'BOOK',
          hsn: '4820',
          categoryId: null,
          unitId: lookups.units.find((u) => u.symbol === 'Pcs').id,
          secondaryUnitId: null,
          conversion: 1,
          taxRateId: lookups.taxes.find((r) => r.rateBps === 1800).id,
          salePrice: 10000,
          purchasePrice: 6000,
          wholesalePrice: 9000,
          mrp: 0,
          inclusive: false,
          purchaseInclusive: false,
          discountBps: 0,
          discountAmount: 0,
          discountType: 'percent',
          wholesaleQty: 10,
          openingQty: 20,
          openingPrice: 6000,
          openingDate: '2026-11-10',
          minStock: 2,
          location: '',
          image: null,
          customFields: {},
        }),
      );
    });
    await page.reload();
    await page.getByRole('button', { name: 'New Sale', exact: true }).first().click();
    await choose('Party', 'Asha Retail');
    await choose('Search / add item', 'Notebook');
    await page.getByLabel('Qty 1', { exact: true }).fill('2');
    await page.getByLabel('Qty 1', { exact: true }).press('Enter');
    assert.equal(
      await page
        .getByLabel('Unit 1', { exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: 'Add charge', exact: true }).click();
    await page.getByLabel('Charge amount (₹) 1', { exact: true }).fill('50');
    await page.getByLabel('GST % 1', { exact: true }).last().fill('18');
    await page.getByLabel('Bill discount (%)', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Add / split payment', exact: true }).click();
    await page.getByLabel('Received now (₹) 1', { exact: true }).fill('50');
    await page.getByRole('button', { name: 'Add / split payment', exact: true }).click();
    await choose('Payment account 2', 'UPI');
    await page.getByLabel('Received now (₹) 2', { exact: true }).fill('25');
    await page.getByRole('checkbox', { name: 'Live preview', exact: true }).check();
    await page.getByRole('button', { name: 'New document', exact: true }).click();
    await page.getByLabel('Customer name (optional)', { exact: true }).count();
    assert.equal(await page.locator('.draft-tabs>div').count(), 2);
    await page.screenshot({ path: 'test-results/sales-drafts.png' });
    await app.close();
    app = null;
    await launch();
    await route('invoices');
    await page
      .locator('.draft-tabs')
      .getByRole('button', { name: /INV-0001/ })
      .click();
    assert.equal(await page.getByLabel('Qty 1', { exact: true }).inputValue(), '2');
    assert.equal(await page.getByLabel('Bill discount (%)', { exact: true }).inputValue(), '10');
    await page.keyboard.press('Control+s');
    await page
      .getByRole('dialog', { name: 'This bill exceeds the credit limit', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Yes, continue', exact: true }).click();
    await page.locator('.invoice-page').waitFor();
    const invoice = (await list()).find((t) => t.type === 'sale');
    assert.equal(invoice.total, 26550);
    assert.equal(invoice.received, 7500);
    assert.equal(invoice.balance, 19050);
    const pdf = join(userData, 'invoice.pdf');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, pdf);
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'PDF saved on this device' }).waitFor();
    assert.equal(readFileSync(pdf).subarray(0, 4).toString(), '%PDF');
    writeFileSync('test-results/sales-invoice.pdf', readFileSync(pdf));
    await page.getByRole('button', { name: 'Modern Blue', exact: true }).click();
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await page.getByRole('button', { name: 'Print Thermal', exact: true }).click();
    await page.getByRole('button', { name: 'WhatsApp', exact: true }).click();
    await page
      .getByRole('status')
      .filter({ hasText: /PDF saved/ })
      .waitFor();
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('.invoice-preview-layout aside:last-child button[disabled]'),
    );
    const external = await app.evaluate(() => ({
      urls: globalThis.salesExternal,
      print: globalThis.salesPrint,
    }));
    assert.equal(external.urls.length, 2);
    assert.match(external.urls[0], /^https:\/\/wa.me\/919876543210\?text=/);
    assert.match(external.urls[1], /^mailto:/);
    assert.equal(external.print.length, 2);
    await page.locator('.page-content').evaluate((e) => e.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/sales-preview.png' });
    await route('paymentIn/new');
    await choose('Party', 'Asha Retail');
    await page.getByLabel('Received now (₹)', { exact: true }).fill('180');
    await page.getByLabel('Payment discount (₹)', { exact: true }).fill('10.50');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => location.hash === '#paymentIn');
    assert.equal((await list()).find((t) => t.id === invoice.id).paymentStatus, 'paid');
    await route('invoices');
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Create sale return', exact: true }).click();
    await page.getByLabel('Qty 1', { exact: true }).fill('1');
    await page.keyboard.press('Control+s');
    await page.locator('.invoice-page').waitFor();
    assert.equal((await list()).filter((t) => t.type === 'sale_return').length, 1);
    await route('estimates/new');
    await choose('Party', 'Asha Retail');
    await choose('Search / add item', 'Notebook');
    await page.keyboard.press('Control+s');
    await page.locator('.invoice-page').waitFor();
    await route('estimates');
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Convert to sale invoice', exact: true }).click();
    await page.locator('.invoice-page').waitFor();
    assert.equal((await list()).find((t) => t.type === 'estimate').status, 'converted');
    await route('settings/print');
    await choose('Paper size', 'A5');
    await page.getByRole('switch', { name: 'Received-by box', exact: true }).click();
    await page.getByRole('button', { name: 'Change language', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.lang === 'hi');
    await route(`invoices/preview/${invoice.id}`);
    await page.locator('.invoice-page').waitFor();
    await page.frameLocator('.invoice-page').getByText('टैक्स इनवॉइस', { exact: true }).waitFor();
    await page.locator('.page-content').evaluate((e) => e.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/sales-hindi.png' });
    const hiPdf = join(userData, 'invoice-hindi.pdf');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, hiPdf);
    const hiResult = await page.evaluate(
      async (id) => window.api.sales.output(1, id, 'pdf', 'classic'),
      invoice.id,
    );
    assert.equal(hiResult.ok, true);
    writeFileSync('test-results/sales-hindi.pdf', readFileSync(hiPdf));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: secondary display, keyboard grid, tax/charges/discount, split payments, draft process restart, credit warning, PDF, mocked print dialogs and external sharing, payment allocation, return, estimate conversion, print settings, Hindi.',
    );
    console.log('Data:', userData);
  } finally {
    if (app) await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
