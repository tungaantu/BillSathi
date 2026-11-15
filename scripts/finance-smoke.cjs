const { _electron: electron } = require('playwright');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('node:fs').mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true });
const assert = require('node:assert/strict');
async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'billsathi-finance-')),
    errors = [];
  let app, page;
  const route = async (value) => {
    await page.evaluate((v) => (location.hash = v), value);
    await page.waitForTimeout(200);
  };
  const choose = async (name, option) => {
    await page.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: option }).first().click();
  };
  try {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, BILLSATHI_DISPLAY: 'secondary', BILLSATHI_USER_DATA: profile },
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) errors.push(m.text());
    });
    await page.waitForFunction(() => Boolean(window.api));
    const placement = await app.evaluate(({ BrowserWindow, screen }) => ({
      secondary: screen.getAllDisplays().find((d) => d.id !== screen.getPrimaryDisplay().id)?.id,
      actual: screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id,
    }));
    if (placement.secondary) assert.equal(placement.actual, placement.secondary);
    await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Finance Demo Store',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '29',
          gstin: '',
          pan: '',
          address: 'Market Road',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: '',
          demo: true,
        }),
      );
      for (const screen of [
        'home',
        'bills',
        'purchaseOrders',
        'purchaseReturns',
        'paymentOut',
        'expenses',
        'otherIncome',
        'bankAccounts',
        'cashHand',
        'cheques',
        'loans',
        'invoices',
        'paymentIn',
      ])
        unwrap(await window.api.settings.set(firm.id, `tour.${screen}`, true));
      unwrap(await window.api.settings.set(firm.id, 'otherIncome', true));
    });
    await page.reload();
    await page.getByRole('heading', { name: /Finance Demo Store/ }).waitFor();
    const initial = await page.evaluate(async () => ({
      accounts: await window.api.finance.accounts(1),
      txns: await window.api.sales.list(1),
      dashboard: await window.api.dashboard.get(1),
    }));
    assert.equal(initial.accounts.data.filter((a) => a.type === 'bank').length, 2);
    assert.equal(initial.txns.data.filter((t) => t.type === 'purchase').length, 8);
    assert.ok(initial.dashboard.data.chequesDue >= 2);
    for (const [path, title] of [
      ['bills', 'Purchase Bills'],
      ['paymentOut', 'Payment-Out'],
      ['purchaseOrders', 'Purchase Orders'],
      ['purchaseReturns', 'Purchase Returns / Debit Notes'],
      ['expenses', 'Expenses'],
      ['bankAccounts', 'Bank Accounts'],
      ['cashHand', 'Cash in Hand'],
      ['cheques', 'Cheques'],
      ['loans', 'Loan Accounts'],
    ]) {
      await route(path);
      await page.locator('h1').waitFor();
      assert.ok((await page.locator('h1').textContent()).trim(), title);
      await page.waitForTimeout(300);
      assert.equal(await page.getByText(/help\.(finance|sale)-/).count(), 0);
      if (['expenses', 'bankAccounts', 'cheques'].includes(path))
        await page.screenshot({ path: `test-results/finance-${path}.png` });
    }
    await route('bills/new');
    await page.getByLabel('Supplier bill number', { exact: true }).fill('SUP-UI-100');
    await page.getByLabel('Supplier bill date', { exact: true }).fill('09/11/2026');
    await choose('Party', 'Shree Ganesh Traders');
    await choose('Search / add item', 'Potato');
    assert.equal(
      await page.getByLabel('Price / unit (₹) 1', { exact: true }).inputValue(),
      '25.00',
    );
    await page.getByLabel('Qty 1', { exact: true }).fill('2');
    // Let the qty → price recalculation re-render settle before pressing Enter (was flaky).
    await page.waitForTimeout(250);
    await page.getByLabel('Qty 1', { exact: true }).press('Enter');
    // Enter moves focus to the Unit cell (poll: focus moves after a render tick).
    await page
      .waitForFunction(
        () => document.activeElement?.getAttribute('aria-label') === 'Unit 1',
        null,
        { timeout: 5000 },
      )
      .catch(async (e) => {
        console.log(
          'Focused:',
          await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200)),
        );
        throw e;
      });
    await page.keyboard.press('Control+s');
    await page.locator('.invoice-page').waitFor();
    const bill = await page.evaluate(async () => {
      const r = await window.api.sales.list(1, 'purchase');
      return r.data.find((t) => t.number === 9);
    });
    assert.equal(bill.total, 5000);
    const html = await page.evaluate(
      async (id) => (await window.api.sales.preview(1, id)).data,
      bill.id,
    );
    assert.ok(html.includes('Purchase Bill'));
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    assert.ok(html.includes(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`)); // bill dated today, Indian format
    assert.ok(!html.includes('GSTIN: </p>'));
    assert.ok(html.includes('Scan to pay ₹50.00'));
    assert.ok(html.includes('demo@upi'));
    const pdf = join(profile, 'purchase.pdf');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, pdf);
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'PDF saved on this device' }).waitFor();
    assert.equal(readFileSync(pdf).subarray(0, 4).toString(), '%PDF');
    writeFileSync('test-results/finance-purchase.pdf', readFileSync(pdf));
    await page.screenshot({ path: 'test-results/finance-preview.png' });
    await route('expenses/new');
    await choose('Category', 'Rent');
    await page.getByLabel('Amount (₹)', { exact: true }).fill('100');
    await page.keyboard.press('Control+s');
    await page.locator('.invoice-page').waitFor();
    await route('bankAccounts');
    await page.getByRole('button', { name: 'Transfer money', exact: true }).click();
    await choose('From', 'Market current account');
    await choose('To', 'Cash in Hand');
    await page.getByLabel('Amount (₹)', { exact: true }).fill('100');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await route('cheques');
    await page.getByRole('button', { name: 'Mark bounced', exact: true }).first().click();
    await page
      .getByRole('checkbox', { name: 'I confirm this cheque was returned unpaid.', exact: true })
      .check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await route('loans');
    await page.getByRole('button', { name: 'Record EMI / payment', exact: true }).first().click();
    await page.getByLabel('Principal repaid (₹)', { exact: true }).fill('100');
    await page.getByLabel('Interest paid (₹)', { exact: true }).fill('10');
    await choose('Cash or bank account', 'Market current account');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await route('purchaseOrders');
    await page.getByRole('button', { name: 'Actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Convert to Bill', exact: true }).click();
    await page.getByRole('dialog').locator('input[type=number]').fill('2');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Convert to Bill', exact: true })
      .click();
    await page.locator('.invoice-page').waitFor();
    await route('paymentOut');
    await page.getByRole('button', { name: 'Actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Paid now', { exact: true }).fill('15');
    await page
      .getByRole('checkbox', { name: 'Auto allocate oldest invoices first', exact: true })
      .check();
    await page.keyboard.press('Control+s');
    await page.locator('.sales-table').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Finance secondary-display UI, demo data, purchase pricing/date/save/PDF, expenses, transfer, cheque bounce, EMI, partial order and payment-out edit.',
      placement,
    );
  } catch (error) {
    if (page) await page.screenshot({ path: 'test-results/finance-failure.png' }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
