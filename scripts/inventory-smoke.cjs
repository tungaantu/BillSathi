// Inventory smoke: batches (FEFO), serial/IMEI, godowns + transfer, barcode labels PDF, POS sale
// with barcode-scanner input, POS summary, batch expiry report, Hindi. Secondary display, temp data.
const { _electron: electron } = require('playwright');
const { mkdtempSync, existsSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-inventory-'));
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
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.waitForFunction(() => Boolean(window.api));
    await app.evaluate(({ dialog }, directory) => {
      let next = 0;
      dialog.showSaveDialog = async (_w, options) => ({
        canceled: false,
        filePath: `${directory}/out-${++next}.${options.filters[0].extensions[0]}`,
      });
    }, userData);
    const seeded = await page.evaluate(async () => {
      let step = 'firm';
      const unwrap = (r) => {
        if (!r.ok) throw new Error(`${step}: ${r.error}`);
        return r.data;
      };
      const api = window.api;
      const firm = unwrap(
        await api.firm.create({
          name: 'Stock Demo',
          phone: '9876543210',
          category: 'pharmacy',
          stateCode: '29',
          gstin: '',
          pan: '',
          address: 'Bengaluru',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: 'stockdemo@upi',
          demo: true,
        }),
      );
      const f = firm.id;
      for (const k of ['batches', 'serials', 'godowns', 'barcode'])
        unwrap(await api.settings.set(f, k, true));
      for (const screen of [
        'home',
        'pos',
        'godowns',
        'stockTransfers',
        'serialLookup',
        'barcodeLabels',
        'batchExpiry',
        'reportPage',
        'invoices',
        'bills',
      ])
        unwrap(await api.settings.set(f, `tour.${screen}`, true));
      const items = unwrap(await api.masters.items(f));
      const base = items.find((i) => i.type === 'product');
      const clone = (name, code, extra) => {
        const copy = { ...base, name, code, openingQty: 0, ...extra };
        for (const k of ['id', 'firmId', 'qty', 'value', 'barcode', 'cessBps', 'deletedAt'])
          delete copy[k];
        return copy;
      };
      step = 'items';
      const syrup = unwrap(
        await api.masters.saveItem(
          f,
          null,
          clone('Cough Syrup', 'SYRUP100', { trackBatches: true }),
        ),
      );
      const phone = unwrap(
        await api.masters.saveItem(
          f,
          null,
          clone('Phone X', 'PHONEX', { trackSerials: true, salePrice: 1500000 }),
        ),
      );
      const source = unwrap(await api.sales.get(f, unwrap(await api.sales.list(f, 'sale'))[0].id));
      const doc = async (type, prefix, lines, extra = {}) => {
        const d = {
          ...source,
          type,
          prefix,
          payments: [],
          refTxnId: null,
          loyaltyRedeem: 0,
          loyaltyDiscount: 0,
          lines,
          ...extra,
        };
        for (const k of ['id', 'number', 'received', 'balance', 'status', 'deletedAt']) delete d[k];
        d.number = unwrap(await api.sales.next(f, type, prefix));
        return unwrap(await api.sales.save(f, null, d));
      };
      const line = (item, qty, extra = {}) => ({
        ...source.lines[0],
        itemId: item.id,
        name: item.name,
        unitId: item.unitId,
        qty,
        freeQty: 0,
        price: 10000,
        discountAmount: 0,
        discountBps: 0,
        ...extra,
      });
      step = 'purchase';
      await doc(
        'purchase',
        'PB-',
        [
          line(syrup, 6, {
            batch: { number: 'B-OLD', expDate: '2020-01-31', mfgDate: '', mrp: 15000 },
          }),
          line(syrup, 10, {
            batch: { number: 'B-NEW', expDate: '2099-12-31', mfgDate: '', mrp: 15000 },
          }),
          line(phone, 2, { serials: ['IMEI-111', 'IMEI-222'] }),
        ],
        { supplierBillNo: 'SUP-1', supplierBillDate: source.date },
      );
      step = 'sale';
      await doc('sale', source.prefix, [line(syrup, 3), line(phone, 1, { serials: ['IMEI-222'] })]);
      const batches = unwrap(await api.inventory.batches(f, syrup.id));
      step = 'godown';
      const back = unwrap(
        await api.inventory.saveGodown(f, null, { name: 'Back godown', address: '' }),
      );
      const main = unwrap(await api.inventory.godowns(f)).find((g) => g.main).id;
      unwrap(
        await api.inventory.saveTransfer(f, {
          date: source.date,
          fromId: main,
          toId: back,
          note: 'smoke',
          lines: [{ itemId: syrup.id, qty: 4, batchId: null }],
        }),
      );
      return {
        firm: f,
        syrup: syrup.id,
        batches: Object.fromEntries(batches.map((b) => [b.number, b.qty])),
        serials: unwrap(await api.inventory.serials(f, phone.id)).map((s) => s.serial),
        godownStock: unwrap(await api.inventory.godownStock(f, back)).find(
          (r) => r.itemId === syrup.id,
        )?.qty,
      };
    });
    // FEFO skipped the expired batch; the sold serial left stock; transfer landed in Back godown.
    assert.deepEqual(seeded.batches, { 'B-OLD': 6, 'B-NEW': 7 });
    assert.deepEqual(seeded.serials, ['IMEI-111']);
    assert.equal(seeded.godownStock, 4);
    await page.reload();
    const route = (v) =>
      page.evaluate((v) => {
        location.hash = v;
      }, v);
    const shot = (name) => page.screenshot({ path: join(userData, `7b-${name}.png`) });

    // Godowns & transfers render.
    await route('godowns');
    await page.getByRole('heading', { name: 'Godowns / stores', exact: true }).waitFor();
    await page.getByText('Back godown').first().waitFor();
    await shot('godowns');
    await route('stockTransfers');
    await page.getByRole('cell', { name: 'Back godown' }).waitFor();
    await page.getByRole('button', { name: 'Export PDF', exact: true }).first().click();
    await page.waitForTimeout(1500);

    // Batch expiry report & dashboard alert.
    await route('batchExpiry');
    await page.getByRole('heading', { name: 'Batch expiry', exact: true }).waitFor();
    await page.getByRole('cell', { name: 'B-OLD' }).waitFor();
    await shot('batch-expiry');
    await route('home');
    await page.getByRole('button', { name: /1 batch has expired/ }).waitFor();

    // Serial lookup.
    await route('serialLookup');
    await page.getByLabel('Serial or IMEI number').fill('IMEI-2');
    await page.getByText('Not in stock').waitFor();
    await shot('serials');

    // Barcode labels → PDF.
    await route('barcodeLabels');
    await page.getByLabel('Labels Cough Syrup').fill('3');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForTimeout(2500);
    await shot('labels');

    // POS: scan the syrup barcode (fast keystrokes + Enter), pay cash with change.
    await route('pos');
    await page.getByRole('heading', { name: /POS counter billing/ }).waitFor();
    await page.getByLabel('Search or scan item').focus();
    await page.keyboard.type('SYRUP100', { delay: 5 });
    await page.keyboard.press('Enter');
    await page.locator('.pos-line').first().waitFor();
    await page.locator('.pos-tile', { hasText: 'Cough Syrup' }).click(); // tap adds one more
    assert.equal(await page.getByLabel('Quantity Cough Syrup').inputValue(), '2');
    await shot('pos-cart');
    await page.keyboard.press('F8');
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('Cash given by customer (₹)').fill('1000');
    await page.getByText('Change to give back').waitFor();
    await shot('pos-pay');
    await page.getByRole('button', { name: 'Save bill', exact: true }).click();
    await page.getByText(/Bill \d+ saved\. Give back/).waitFor();
    // Split payment on a second bill.
    await page.locator('.pos-tile', { hasText: 'Cough Syrup' }).click();
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('UPI', { exact: true }).fill('50');
    await page.getByLabel('Cash', { exact: true }).fill('0');
    await page.locator('.pos-qr img').waitFor();
    const due = await page.evaluate(async (f) => {
      const day = (await window.api.inventory.posDay(f)).data;
      return day;
    }, seeded.firm);
    assert.equal(due.bills, 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Hold/ }).click();
    await page.getByRole('button', { name: 'Held bills (1)' }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('.pos-line').first().waitFor();
    await page.getByRole('button', { name: "Today's summary" }).click();
    await page.getByRole('dialog').getByText('Bills').waitFor();
    await shot('pos-summary');
    // First Escape may only close the Close button's tooltip; keep pressing until the dialog is gone.
    for (
      let i = 0;
      i < 3 && (await page.locator('[role="dialog"][data-state="open"]').count());
      i++
    )
      await page.keyboard.press('Escape');
    await page.locator('[role="dialog"][data-state="open"]').waitFor({ state: 'detached' });
    const stockAfter = await page.evaluate(
      async ([f, id]) => (await window.api.masters.items(f)).data.find((i) => i.id === id).qty,
      [seeded.firm, seeded.syrup],
    );
    assert.equal(stockAfter, 11); // 16 bought − 3 sold − 2 at POS
    await page.keyboard.press('Escape'); // leave POS
    await page.waitForFunction(() => location.hash === '#invoices');

    // Hindi: inventory group renders translated.
    await page.evaluate((f) => window.api.settings.set(f, 'language', 'hi'), seeded.firm);
    await page.reload();
    await route('godowns');
    await page.getByRole('heading', { name: 'गोदाम / स्टोर' }).waitFor();
    const files = ['out-1.pdf', 'out-2.pdf'].map((n) => join(userData, n));
    for (const file of files) assert.ok(existsSync(file) && statSync(file).size > 1000, file);
    const real = errors.filter((e) => !/DevTools/.test(e));
    assert.deepEqual(real, []);
    console.log(
      'PASS: batches FEFO (expired skipped), serial in/out, godown transfer, transfer PDF, batch expiry report + dashboard alert, serial lookup, barcode labels PDF, POS scan + tap + cash change + split UPI QR + hold/recall + day summary, Hindi, secondary display.',
    );
    console.log('Data and screenshots:', userData);
  } catch (e) {
    if (page) await page.screenshot({ path: join(userData, 'failure.png') }).catch(() => {});
    console.error('Errors:', errors);
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
