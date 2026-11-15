const { _electron: electron } = require('playwright');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('node:fs').mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true });
const assert = require('node:assert/strict');
async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-smoke-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
    timeout: 60000,
  });
  const errors = [];
  app.process().stderr.on('data', (chunk) => {
    const value = chunk.toString();
    if (/Startup failed|Error:|Unable to load preload/.test(value)) errors.push(value);
  });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('heading', { name: 'Let’s meet your business' }).waitFor();
    await page.screenshot({ path: 'test-results/onboarding.png' });
    await page.getByLabel('Business name', { exact: true }).fill('Sathi Stores');
    await page.getByLabel('Phone number', { exact: true }).fill('9876543210');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('GSTIN · Optional', { exact: true }).fill('27AAPFU0939F1ZV');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome, Sathi Stores' }).waitFor();
    await page.waitForTimeout(900);
    const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
    if (await skip.isVisible()) await skip.click();
    await page.screenshot({ path: 'test-results/dashboard-1366.png' });
    const fresh = await page.evaluate(() => window.api.dashboard.get(1));
    assert.equal(fresh.ok, true);
    assert.equal(fresh.data.receive, 0);
    assert.equal(fresh.data.cash, 0);
    assert.equal(fresh.data.todaySale, 0);
    const units = await page.evaluate(() => window.api.units.list());
    assert.equal(units.data.length, 30);
    const firm = await page.evaluate(() => window.api.firm.get(1));
    assert.equal(firm.data.stateCode, '27');
    assert.equal(firm.data.pan, 'AAPFU0939F');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Search anything…' }).fill('Business Profile');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Business Profile', exact: true }).waitFor();
    await page.waitForTimeout(750);
    if (await skip.isVisible()) await skip.click();
    await page.getByLabel('Business name', { exact: true }).fill('Sathi Corner Store');
    await page.keyboard.press('Control+s');
    await page.getByRole('status').filter({ hasText: 'Changes saved' }).waitFor();
    await page.screenshot({ path: 'test-results/profile.png' });
    // Exercise every route through the hash router, including disabled module routes.
    const routeIds = [
      'parties',
      'items',
      'invoices',
      'estimates',
      'proforma',
      'paymentIn',
      'saleOrders',
      'challans',
      'saleReturns',
      'pos',
      'bills',
      'paymentOut',
      'expenses',
      'purchaseOrders',
      'purchaseReturns',
      'bankAccounts',
      'cashHand',
      'cheques',
      'loans',
      'reports',
      'backup',
      'utilities',
    ];
    for (const route of routeIds) {
      await page.evaluate((route) => {
        location.hash = route;
      }, route);
      await page.getByRole('heading').first().waitFor();
    }
    await page.evaluate(() => {
      location.hash = 'settings/general';
    });
    await page.getByRole('heading', { name: 'Workspace preferences', exact: true }).waitFor();
    await page.waitForTimeout(750);
    if (await skip.isVisible()) await skip.click();
    await page.getByRole('combobox', { name: 'Amount decimal places', exact: true }).click();
    await page.getByRole('option', { name: '1', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Changes saved' }).first().waitFor();
    await page.getByRole('switch', { name: 'Stop sale on negative stock', exact: true }).click();
    await page.waitForTimeout(300);
    const settings = await page.evaluate(() => window.api.settings.get(1));
    assert.equal(settings.data.decimals, 1);
    assert.equal(settings.data.negativeStock, false);
    await page.getByRole('button', { name: 'Change theme', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.getByRole('button', { name: 'Change language', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.lang === 'hi');
    await page.screenshot({ path: 'test-results/settings-hindi-dark.png' });
    await page.evaluate(() => {
      location.hash = 'home';
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('heading', { name: 'स्वागत है, Sathi Corner Store' }).waitFor();
    await page.screenshot({ path: 'test-results/dashboard-1920-hindi-dark.png' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    const file = readFileSync(join(userData, 'billsathi.db'));
    assert.equal(file.subarray(0, 15).toString(), 'SQLite format 3');
    console.log(
      'PASS: wizard, GSTIN autofill, dashboard, profile save, 22 routes, settings, Hindi, dark theme, 1366×768 and 1920×1080. No renderer errors.',
    );
  } finally {
    await app.close();
  }
  const reopened = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
  });
  try {
    const page = await reopened.firstWindow();
    await page.getByRole('heading', { name: 'स्वागत है, Sathi Corner Store' }).waitFor();
    console.log('PASS: persisted business, settings and language survive a full desktop restart.');
  } finally {
    await reopened.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
