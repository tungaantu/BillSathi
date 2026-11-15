const { _electron: electron } = require('playwright');
const { mkdtempSync, existsSync, statSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-reports-'));
  const errors = [];
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_DISPLAY: 'secondary', BILLSATHI_USER_DATA: userData },
    timeout: 60000,
  });
  let page;
  try {
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
    if (placement.secondary) assert.equal(placement.actual, placement.secondary);
    await app.evaluate(({ dialog }, directory) => {
      let next = 0;
      dialog.showSaveDialog = async (_window, options) => ({
        canceled: false,
        filePath: `${directory}/export-${++next}.${options.filters[0].extensions[0]}`,
      });
    }, userData);
    await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Reports Demo',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '29',
          gstin: '29ABCDE1234F1ZW',
          pan: 'ABCDE1234F',
          address: 'Bengaluru',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: '',
          demo: true,
        }),
      );
      for (const screen of ['home', 'reports', 'reportPage', 'invoices'])
        unwrap(await window.api.settings.set(firm.id, `tour.${screen}`, true));
      unwrap(await window.api.settings.set(firm.id, 'orders', true));
      // Persisted preferences are shared with the dashboard shortcuts.
      unwrap(await window.api.settings.set(firm.id, 'reports.favourites', 'profitLoss,gstr1'));
    });
    await page.reload();
    const route = async (value) =>
      page.evaluate((v) => {
        location.hash = v;
      }, value);
    await route('reports');
    await page.getByRole('heading', { name: 'Reports', exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Search reports' }).fill('profit');
    await page
      .getByRole('button', { name: /Profit & Loss/ })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Profit & Loss', exact: true }).waitFor();
    await page.getByText('Net sales before GST', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Report saved' }).waitFor();
    assert.ok(existsSync(join(userData, 'export-1.xlsx')));
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-tour="report-export"] button:disabled'),
    );
    assert.ok(existsSync(join(userData, 'export-2.pdf')));
    assert.ok(statSync(join(userData, 'export-2.pdf')).size > 1000);
    await page.screenshot({ path: join(userData, 'profit-loss.png') });
    await route('reports/gstr1');
    await page.getByRole('heading', { name: 'GSTR-1', exact: true }).waitFor();
    await page.getByRole('tab', { name: /B2C Small/ }).click();
    await page.getByRole('button', { name: 'Export GSTR-1 JSON', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-tour="report-export"] button:disabled'),
    );
    const jsonFile = join(userData, 'export-3.json');
    assert.ok(existsSync(jsonFile));
    const json = JSON.parse(readFileSync(jsonFile, 'utf8'));
    assert.equal(json.gstin, '29ABCDE1234F1ZW');
    assert.ok(json.doc_issue);
    await page.getByRole('button', { name: 'GST offline-tool Excel', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-tour="report-export"] button:disabled'),
    );
    assert.ok(existsSync(join(userData, 'export-4.xlsx')));
    await page.screenshot({ path: join(userData, 'gstr1.png') });
    await route('reports/partyStatement?partyId=1');
    await page.getByRole('heading', { name: 'Party statement', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Party statement', exact: true }).waitFor();
    // Check linked rows and a representative document preview.
    const link = page.locator('.report-row-link').first();
    if (await link.count()) {
      await link.click();
      await page.locator('.report-table').waitFor({ state: 'detached' });
    }
    await route('home');
    await page.getByRole('heading', { name: 'Sales vs purchases', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    await page.getByRole('heading', { name: 'Top customers', exact: true }).waitFor();
    await page.screenshot({ path: join(userData, 'dashboard.png') });
    await page.evaluate(() => window.api.settings.set(1, 'language', 'hi'));
    await page.reload();
    await route('reports');
    await page.getByRole('heading', { name: 'रिपोर्ट', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Reports search, P&L, GSTR-1 tabs, Excel/PDF/JSON exports, linked rows, dashboard, Hindi, secondary display.',
    );
    console.log('Data, files and screenshots:', userData);
  } catch (e) {
    console.error('Renderer errors:', errors);
    if (page) {
      console.error(
        'Route and headings:',
        await page.evaluate(() => ({
          route: location.hash,
          headings: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent),
        })),
      );
      await page.screenshot({ path: join(userData, 'failure.png') });
      console.error('Screenshot:', join(userData, 'failure.png'));
    }
    throw e;
  } finally {
    await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
