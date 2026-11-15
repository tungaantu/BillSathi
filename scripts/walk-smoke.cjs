// UX walk: opens every screen and every report with demo data (all features switched on),
// in English, then Hindi + dark mode. Fails on renderer errors, missing headings or raw i18n keys
// on screen. Secondary display, temp data. Screenshots of a few key screens in the temp folder.
const { _electron: electron } = require('playwright');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const registry = readFileSync(join(__dirname, '../src/main/services/reports/registry.ts'), 'utf8');
const block = registry.slice(
  registry.indexOf('RUNNERS'),
  registry.indexOf('};', registry.indexOf('RUNNERS')),
);
const REPORT_IDS = [...block.matchAll(/^\s+([a-zA-Z0-9]+)[,:]/gm)].map((m) => m[1]);
const SCREENS = [
  'home', 'parties', 'items', 'invoices', 'recurring', 'reminders', 'estimates', 'proforma',
  'paymentIn', 'saleOrders', 'challans', 'saleReturns', 'godowns', 'stockTransfers', 'batchExpiry',
  'serialLookup', 'barcodeLabels', 'bills', 'paymentOut', 'expenses', 'purchaseOrders',
  'purchaseReturns', 'otherIncome', 'bankAccounts', 'cashHand', 'cheques', 'loans', 'bankMatch',
  'reports', 'backup', 'recycleBin', 'auditTrail', 'verifyData', 'utilities', 'closeYear', 'bulkItems', 'help',
  'profile', 'invoices/new', 'bills/new', 'settings/general', 'settings/transaction',
  'settings/print', 'settings/tax', 'settings/messages', 'settings/party', 'settings/item',
  'settings/backup', 'settings/payments', 'pos',
]; // prettier-ignore
const SHOTS = ['home', 'godowns', 'closeYear', 'help', 'reports', 'pos', 'invoices/new'];
// Raw i18n keys look like "inventory.godown.new" — words joined by dots with a lowercase start.
const RAW_KEY = /\b(?:[a-z][a-zA-Z0-9]*\.){1,4}[a-z][a-zA-Z0-9-]*\b/g;
const ALLOWED =
  /^(e\.g|i\.e|wa\.me|example\.(in|com)|bank\.[a-z]+)$|@|\.(pdf|xlsx|json|bsbk|xml|csv|png)$/;

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-walk-'));
  const errors = [];
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_DISPLAY: 'secondary', BILLSATHI_USER_DATA: userData },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${page.url()} ${m.text()}`);
  });
  try {
    await page.waitForFunction(() => Boolean(window.api));
    const firm = await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const f = unwrap(
        await window.api.firm.create({
          name: 'Walk Demo',
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
          upiId: 'walk@upi',
          demo: true,
        }),
      ).id;
      for (const k of [
        'orders',
        'challan',
        'proforma',
        'otherIncome',
        'batches',
        'serials',
        'godowns',
        'barcode',
        'partyRates',
        'loyalty',
        'messages',
        'reminders',
        'partyGroups',
      ])
        unwrap(await window.api.settings.set(f, k, true));
      return f;
    });
    // Tours would cover the screen on first visit; mark them seen so every page is checked bare.
    await page.evaluate(
      async ([f, screens]) => {
        for (const s of [...screens, 'reportPage', 'settings/print', 'settings'])
          await window.api.settings.set(f, `tour.${s.split('/')[0]}`, true);
        await window.api.settings.set(f, 'tour.settings/print', true);
      },
      [firm, SCREENS],
    );
    await page.reload();
    const visit = async (route, label) => {
      await page.evaluate((r) => (location.hash = r), route);
      await page.waitForTimeout(450);
      const info = await page.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent?.trim() ?? '',
        text: document.body.innerText.replace(/\S+@\S+/g, ' ').replace(/https?:\/\/\S+/g, ' '),
      }));
      assert.ok(info.h1, `${label}: no page heading`);
      const raw = [...new Set(info.text.match(RAW_KEY) ?? [])].filter((k) => !ALLOWED.test(k));
      assert.deepEqual(raw, [], `${label}: untranslated keys on screen`);
      if (route === 'pos') await page.keyboard.press('Escape');
    };
    // Close financial year end to end: backup → close → old dates locked.
    await page.reload();
    await page.evaluate(() => (location.hash = 'closeYear'));
    await page.getByRole('button', { name: 'Take backup now' }).click();
    await page.getByText(/Backup saved:/).waitFor();
    await page.getByRole('button', { name: /^Close \d{4}-\d{2}$/ }).click();
    await page.getByRole('button', { name: 'Yes, continue', exact: true }).click();
    await page.getByText(/Books closed up to/).waitFor();
    const locked = await page.evaluate(async (f) => {
      const list = (await window.api.sales.list(f, 'sale')).data;
      const doc = (await window.api.sales.get(f, list[0].id)).data;
      const copy = { ...doc, number: 9999, date: '2025-05-01', payments: [], refTxnId: null };
      for (const k of ['id', 'received', 'balance', 'status', 'deletedAt']) delete copy[k];
      return (await window.api.sales.save(f, null, copy)).error;
    }, firm);
    assert.equal(locked, 'closedYear');
    // Calculator popup (Alt+C) with shop-style percentages.
    await page.keyboard.press('Alt+c');
    await page.getByLabel('Calculation').fill('200 + 18%');
    await page.locator('.calc-result', { hasText: '= 236' }).waitFor();
    await page.keyboard.press('Escape');
    // Bulk update: change one sale price and save.
    await page.evaluate(() => (location.hash = 'bulkItems'));
    const price = page.getByLabel(/^Sale price \(₹\) /).first();
    await price.fill('99');
    await page.getByRole('button', { name: 'Save 1 change' }).click();
    await page.getByText('1 item updated.').waitFor();
    for (const lang of ['en', 'hi']) {
      if (lang === 'hi')
        await page.evaluate(async (f) => {
          await window.api.settings.set(f, 'language', 'hi');
          await window.api.settings.set(f, 'theme', 'dark');
        }, firm);
      await page.reload();
      for (const route of SCREENS) {
        await visit(route, `${lang} ${route}`);
        if (lang === 'en' && SHOTS.includes(route))
          await page.screenshot({ path: join(userData, `walk-${route.replace('/', '-')}.png`) });
      }
      for (const id of REPORT_IDS) await visit(`reports/${id}`, `${lang} report ${id}`);
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS: ${SCREENS.length} screens + ${REPORT_IDS.length} reports in English and Hindi/dark — headings present, no raw keys, no renderer errors; close financial year locks old dates; calculator; bulk item update.`,
    );
    console.log('Screenshots:', userData);
  } catch (e) {
    await page.screenshot({ path: join(userData, 'failure.png') }).catch(() => {});
    console.error('Errors:', errors.slice(0, 20));
    console.error('Screenshot:', join(userData, 'failure.png'));
    throw e;
  } finally {
    await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
