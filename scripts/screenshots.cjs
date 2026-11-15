// Capture real app screens using a disposable demo business. Never opens the owner's data.
const { _electron: electron } = require('playwright');
const { mkdirSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const directory = join(__dirname, '..', 'assets', 'github');
  mkdirSync(directory, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'billsathi-screenshots-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      BILLSATHI_DISPLAY: 'secondary',
      BILLSATHI_SHOW_WINDOW: '0',
      BILLSATHI_USER_DATA: profile,
    },
    timeout: 60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const placement = await app.evaluate(({ screen, BrowserWindow }) => {
      const displays = screen.getAllDisplays();
      const secondary = displays.find((d) => d.id !== screen.getPrimaryDisplay().id);
      const actual = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds());
      return { displays: displays.length, secondary: secondary?.id, actual: actual.id };
    });
    if (placement.secondary) assert.equal(placement.secondary, placement.actual);
    console.log('Display:', placement);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForFunction(() => Boolean(window.api));
    const seed = await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Sathi Fresh Mart (Demo)',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '29',
          gstin: '29ABCDE1234F1ZW',
          pan: 'ABCDE1234F',
          address: '12, Market Road, Bengaluru, Karnataka',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: 'demo@upi',
          demo: true,
        }),
      ).id;
      const settings = {
        orders: true,
        challan: true,
        proforma: true,
        otherIncome: true,
        batches: true,
        serials: true,
        godowns: true,
        barcode: true,
        partyRates: true,
        loyalty: true,
        messages: true,
        reminders: true,
        partyGroups: true,
        backupReminder: false,
        negativeStock: false,
        'banner.demo': true,
        'reports.favourites': 'profitLoss,gstr1,stockSummary',
        printTheme: 'modern',
      };
      for (const route of [
        'home',
        'invoices',
        'items',
        'pos',
        'reports',
        'reportPage',
        'backup',
        'settings',
        'sales',
      ])
        settings[`tour.${route}`] = true;
      for (const [key, value] of Object.entries(settings))
        unwrap(await window.api.settings.set(firm, key, value));
      const parties = unwrap(await window.api.masters.parties(firm));
      const items = unwrap(await window.api.masters.items(firm));
      let invoice;
      for (let n = 0; n < 14; n++) {
        const customer = parties[n % 5];
        const date = new Date();
        date.setDate(date.getDate() - (n % 14));
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const lines = [
          items[n % items.length],
          items[(n + 7) % items.length],
          items[(n + 13) % items.length],
        ].map((item) => ({
          itemId: item.id,
          name: item.name,
          hsn: item.hsn,
          qty: 1,
          freeQty: 0,
          unitId: item.unitId,
          price: item.salePrice,
          inclusive: false,
          discountBps: 0,
          discountAmount: 0,
          taxBps: 0,
          cessBps: 0,
        }));
        invoice = unwrap(
          await window.api.sales.save(firm, null, {
            type: 'sale',
            loyaltyRedeem: 0,
            loyaltyDiscount: 0,
            supplierBillNo: '',
            supplierBillDate: '',
            itcEligible: true,
            categoryId: null,
            godownId: null,
            expenseMode: 'itemised',
            partyId: customer.id,
            cash: false,
            partyName: customer.name,
            phone: customer.phone,
            billingAddress: customer.billingAddress,
            shippingAddress: '',
            prefix: 'INV-',
            number: n + 100,
            date: day,
            dueDate: '',
            paymentTerms: 0,
            placeOfSupply: '29',
            refTxnId: null,
            lines,
            charges: [],
            discount: 0,
            discountBps: 0,
            roundMode: 'off',
            roundStep: 100,
            description: 'Fresh produce, packed with care.',
            terms: 'Thank you for shopping local.',
            payments: [],
            attachmentIds: [],
          }),
        );
      }
      return { firm, invoice: invoice.id };
    });
    await page.reload();
    async function capture(route, filename) {
      await page.evaluate((value) => {
        location.hash = value;
      }, route);
      await page.getByRole('heading').first().waitFor();
      if (route.includes('preview')) await page.locator('.invoice-page').waitFor();
      if (route === 'pos') {
        await page.locator('.pos-tile').nth(1).click();
        await page.locator('.pos-tile').nth(4).click();
        await page.locator('.pos-tile').nth(7).click();
      }
      await page.waitForTimeout(1800);
      const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.screenshot({ path: join(directory, filename), type: 'png' });
      console.log('Captured', filename);
    }
    await capture('home', 'dashboard.png');
    await capture('invoices', 'invoices.png');
    await capture(`invoices/preview/${seed.invoice}`, 'invoice-preview.png');
    await capture('items', 'inventory.png');
    await capture('reports', 'reports.png');
    await capture('pos', 'pos.png');
    await page.keyboard.press('Escape');
    await page.evaluate(async (firm) => {
      await window.api.settings.set(firm, 'language', 'hi');
      await window.api.settings.set(firm, 'theme', 'dark');
    }, seed.firm);
    await page.reload();
    await capture('home', 'hindi-dark.png');
    assert.deepEqual(errors, []);
    console.log('Screenshots ready. No renderer errors. Demo profile:', profile);
  } finally {
    await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
