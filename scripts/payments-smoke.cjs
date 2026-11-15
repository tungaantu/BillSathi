/* Smoke test: invoice -> Collect via UPI -> manual UTR -> payment recorded -> badge -> statement match. */
const { _electron: electron } = require('playwright');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-payments-'));
  const out = process.env.SMOKE_OUT || userData;
  mkdirSync(out, { recursive: true });
  const errors = [];
  let app, page;
  try {
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
    const list = () => page.evaluate(async () => (await window.api.sales.list(1)).data);
    const route = (value) =>
      page.evaluate((v) => {
        location.hash = v;
      }, value);

    const invoiceId = await page.evaluate(async () => {
      const unwrap = (r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Payments Store',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '29',
          gstin: '',
          pan: '',
          address: 'Bengaluru',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: 'store@okhdfcbank',
          demo: false,
        }),
      );
      for (const key of [
        'home',
        'invoices',
        'paymentIn',
        'settings',
        'bankMatch',
        'payments-collect',
      ])
        unwrap(await window.api.settings.set(firm.id, `tour.${key}`, true));
      unwrap(await window.api.settings.set(firm.id, 'roundOff', false));
      const party = unwrap(
        await window.api.masters.saveParty(firm.id, null, {
          name: 'Asha Retail',
          phone: '9876543210',
          email: '',
          gstType: 'consumer',
          gstin: '',
          stateCode: '29',
          billingAddress: 'Bengaluru',
          shippingAddress: '',
          openingBalance: 0,
          openingDate: '2026-11-10',
          creditLimit: 1000000,
          groupId: null,
          customFields: {},
          active: true,
        }),
      );
      const lookups = unwrap(await window.api.masters.lookups(firm.id));
      const unit = lookups.units.find((u) => u.symbol === 'Pcs');
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const saved = unwrap(
        await window.api.sales.save(firm.id, null, {
          type: 'sale',
          partyId: party.id,
          cash: false,
          partyName: 'Asha Retail',
          phone: '9876543210',
          billingAddress: '',
          shippingAddress: '',
          prefix: 'INV-',
          number: 1,
          date,
          dueDate: '',
          paymentTerms: 0,
          placeOfSupply: '29',
          refTxnId: null,
          lines: [
            {
              itemId: null,
              name: 'Notebook',
              hsn: '4820',
              qty: 2,
              freeQty: 0,
              unitId: unit.id,
              price: 10000,
              inclusive: false,
              discountBps: 0,
              discountAmount: 0,
              taxBps: 1800,
              cessBps: 0,
            },
          ],
          charges: [],
          discount: 0,
          discountBps: 0,
          roundMode: 'off',
          roundStep: 100,
          description: '',
          terms: '',
          payments: [],
          attachmentIds: [],
        }),
      );
      return saved.id;
    });
    await page.reload();
    await route(`invoices/preview/${invoiceId}`);
    await page.locator('.invoice-page').waitFor();

    // 1. Open the Collect dialog from the invoice preview.
    await page.getByRole('button', { name: 'Collect via UPI', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Collect payment by UPI' });
    await dialog.waitFor();
    await dialog.locator('.collect-qr img').waitFor();
    assert.match(await dialog.locator('.collect-amount').innerText(), /₹236\.00/);
    assert.equal(await dialog.getByText('store@okhdfcbank').first().isVisible(), true);
    await page.screenshot({ path: join(out, 'collect-dialog.png') });

    // 2. Second screen opens on the non-primary display (or the primary when there is only one).
    await dialog.getByRole('button', { name: 'Open on second screen' }).click();
    await page.getByRole('status').filter({ hasText: 'customer screen' }).waitFor();
    const placement = await app.evaluate(({ BrowserWindow, screen }) => {
      const windows = BrowserWindow.getAllWindows();
      const primary = screen.getPrimaryDisplay().id;
      const others = screen.getAllDisplays().filter((d) => d.id !== primary);
      const customer = windows.find((w) => w.getTitle() === 'Pay by UPI');
      return {
        count: windows.length,
        found: Boolean(customer),
        onSecondary: customer
          ? screen.getDisplayMatching(customer.getBounds()).id !== primary
          : null,
        hasSecondary: others.length > 0,
      };
    });
    assert.equal(placement.found, true);
    assert.equal(placement.count, 2);
    if (placement.hasSecondary) assert.equal(placement.onSecondary, true);
    await dialog.getByRole('button', { name: 'Close second screen' }).click();

    // 3. Manual confirmation with a 12-digit UTR.
    await dialog.getByRole('button', { name: 'Customer says paid?' }).click();
    await dialog.getByLabel('UTR (12-digit reference)').fill('12345');
    await dialog.getByRole('button', { name: 'Record payment', exact: true }).click();
    await dialog.getByText(/12-digit number in the customer/).waitFor();
    await dialog.getByLabel('UTR (12-digit reference)').fill('401537805904');
    await dialog.getByLabel("Payer's last 4 digits (optional)").fill('4821');
    await dialog.getByRole('button', { name: 'Record payment', exact: true }).click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Payment recorded against the invoice' })
      .waitFor();
    await dialog.waitFor({ state: 'detached' });
    const state = await page.evaluate(async (id) => {
      const sales = await window.api.sales.list(1);
      const badges = await window.api.payments.badges(1);
      return { rows: sales.data, badges: badges.data, id };
    }, invoiceId);
    const invoice = state.rows.find((r) => r.id === invoiceId);
    assert.equal(invoice.received, 23600);
    assert.equal(invoice.balance, 0);
    assert.equal(state.badges.invoices[invoiceId], 'upi');
    const receiptId = state.rows.find((r) => r.type === 'payment_in').id;
    assert.equal(state.badges.payments[receiptId], 'upi');

    // 4. Badges in the lists, settings tab and statement matching.
    await route('invoices');
    await page.locator('.sales-table .badge-row .badge', { hasText: 'UPI' }).first().waitFor();
    await page.screenshot({ path: join(out, 'invoice-list-badge.png') });
    await route('paymentIn');
    await page.locator('.sales-table .badge-row .badge', { hasText: 'UPI' }).first().waitFor();

    await route('settings/payments');
    await page.getByRole('heading', { name: 'UPI payments' }).waitFor();
    await page.getByRole('switch', { name: 'Use YouPI to watch for payments' }).click();
    await page.getByRole('textbox', { name: 'Gateway address' }).waitFor();
    await page.screenshot({ path: join(out, 'settings-payments.png') });
    await page.getByRole('switch', { name: 'Use YouPI to watch for payments' }).click();

    const csv = join(userData, 'statement.csv');
    writeFileSync(
      csv,
      [
        'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance',
        `${new Date().toLocaleDateString('en-GB').replace(/\//g, '/')},"UPI-ASHA-asha@ybl-HDFC0001234-401537805904-PAY","",,236.00,236.00`,
        '01/01/2026,"CASH DEPOSIT","",,500.00,736.00',
      ].join('\n'),
    );
    await app.evaluate(({ dialog: d }, path) => {
      d.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, csv);
    await route('bankMatch');
    await page.getByRole('heading', { name: 'Match bank statement' }).waitFor();
    await page.getByRole('button', { name: 'Choose statement file', exact: true }).first().click();
    await page.getByText('statement.csv').waitFor();
    await page.getByRole('button', { name: 'Find matches', exact: true }).click();
    await page.locator('.match-row input[type=checkbox]').waitFor();
    await page.screenshot({ path: join(out, 'statement-match.png') });
    await page.getByRole('button', { name: /Confirm 1 selected/ }).click();
    await page.getByRole('status').filter({ hasText: '1 payment confirmed' }).waitFor();
    const confirmed = await page.evaluate(async () => (await window.api.payments.badges(1)).data);
    assert.equal(confirmed.invoices[invoiceId], 'confirmed');
    await route('invoices');
    await page
      .locator('.sales-table .badge-row .badge', { hasText: 'Confirmed' })
      .first()
      .waitFor();

    // 5. YouPI-PG against a local mock gateway: connect, create order, see the alert, record as Seen,
    //    then Confirmed after reconciliation. Keys are stored with Electron safeStorage.
    let remote = { status: 'ACTIVE', settlementState: 'NOT_APPLICABLE' };
    const seenRequests = [];
    let orderPaise = '0';
    const gateway = http.createServer((req, res) => {
      seenRequests.push(`${req.method} ${req.url}`);
      const json = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.url === '/api/v1/checkout/server-health')
          return json(200, { tier: 'GREEN', smsHealthy: true, gmailHealthy: true });
        if (req.method === 'POST' && req.url === '/api/v1/payments') {
          if (req.headers['x-merchant-key'] !== 'smoke-key') return json(401, { error: 'bad key' });
          const parsed = JSON.parse(body || '{}');
          if (!parsed.orderId)
            return json(400, { error: 'Missing required fields: orderId and amount.' });
          orderPaise = String(Math.round(Number(parsed.amount) * 100));
          return json(201, {
            paymentId: 'pay-smoke',
            orderId: parsed.orderId,
            amount: parsed.amount,
            amountPaise: String(Math.round(Number(parsed.amount) * 100)),
            status: 'INITIATED',
            checkoutUrl: 'http://localhost:7000/checkout/pay-smoke',
          });
        }
        if (req.url === '/api/v1/checkout/pay-smoke/state')
          return json(200, { payeeVpa: 'gateway@okaxis', payeeName: 'Gateway Shop' });
        if (req.url === '/api/v1/payments/pay-smoke')
          return json(200, {
            paymentId: 'pay-smoke',
            orderId: 'x',
            amountPaise: orderPaise,
            method: 'UPI',
            utr: remote.status === 'ACTIVE' ? undefined : '412345678901',
            ...remote,
          });
        json(404, { error: 'not found' });
      });
    });
    await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${gateway.address().port}`;
    try {
      const wired = await page.evaluate(async (url) => {
        const save = await window.api.payments.saveConfig(1, {
          payeeName: '',
          youpiEnabled: true,
          baseUrl: url,
          merchantId: 'm-smoke',
          apiKey: 'smoke-key',
          webhookEnabled: false,
          webhookPort: 6390,
        });
        const test = await window.api.payments.testYoupi(1, {
          payeeName: '',
          youpiEnabled: true,
          baseUrl: url,
          merchantId: 'm-smoke',
          webhookEnabled: false,
          webhookPort: 6390,
        });
        const wrong = await window.api.payments.testYoupi(1, {
          payeeName: '',
          youpiEnabled: true,
          baseUrl: url,
          merchantId: 'm-smoke',
          apiKey: 'wrong',
          webhookEnabled: false,
          webhookPort: 6390,
        });
        return { save, test, wrong };
      }, baseUrl);
      assert.equal(wired.save.data.hasApiKey, true);
      assert.equal(wired.save.data.secureStorage, true);
      assert.deepEqual(wired.test.data, {
        ok: true,
        tier: 'green',
        smsHealthy: true,
        gmailHealthy: true,
        credentials: 'ok',
      });
      assert.deepEqual(wired.wrong.data, { ok: false, problem: 'auth' });
      // The key must not be stored readable in the database file.
      const dbFile = require('node:fs').readFileSync(join(userData, 'billsathi.db'));
      assert.equal(dbFile.includes(require('node:buffer').Buffer.from('smoke-key')), false);

      const second = await page.evaluate(async () => {
        const unwrap = (r) => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        };
        const first = unwrap(await window.api.sales.get(1, 1));
        const saved = unwrap(
          await window.api.sales.save(1, null, {
            ...first,
            number: 2,
            payments: [],
            attachmentIds: [],
            lines: [{ ...first.lines[0], qty: 1, price: 10000, taxBps: 1800 }],
          }),
        );
        return { id: saved.id, balance: saved.balance };
      });
      assert.equal(second.balance, 11800);
      await page.reload();
      await route(`invoices/preview/${second.id}`);
      await page.locator('.invoice-page').waitFor();
      await page.getByRole('button', { name: 'Collect via UPI', exact: true }).click();
      const yd = page.getByRole('dialog', { name: 'Collect payment by UPI' });
      await yd.getByText('YouPI gateway connected').waitFor();
      await yd.getByText('gateway@okaxis').first().waitFor();
      await page.screenshot({ path: join(out, 'collect-youpi-waiting.png') });
      remote = { status: 'OBSERVED_SUCCESS', settlementState: 'NOT_RECONCILED' };
      await yd.getByText('Payment seen (not yet confirmed by bank)').waitFor({ timeout: 10000 });
      await yd.getByText(/seen from bank alert · UTR 412345678901/).waitFor();
      await page.screenshot({ path: join(out, 'collect-youpi-seen.png') });
      // Nothing is recorded until the owner clicks.
      assert.equal((await list()).find((r) => r.id === second.id).received, 0);
      await yd.getByRole('button', { name: 'Record payment', exact: true }).click();
      await yd.waitFor({ state: 'detached' });
      const seenState = await page.evaluate(async () => ({
        badges: (await window.api.payments.badges(1)).data,
        alert: (await window.api.payments.alert(1)).data,
      }));
      assert.equal(seenState.badges.invoices[second.id], 'seen');
      assert.equal(seenState.alert.seenRecorded, 1);
      await route('home');
      await page.getByText('1 UPI payment seen but not confirmed').waitFor();
      await page.screenshot({ path: join(out, 'dashboard-alert.png') });
      remote = { status: 'RECONCILED', settlementState: 'RECONCILED' };
      await page.getByRole('button', { name: 'Check now', exact: true }).click();
      await page
        .getByRole('status')
        .filter({ hasText: '1 payment confirmed by bank statement' })
        .waitFor();
      assert.equal(
        (await page.evaluate(async () => (await window.api.payments.badges(1)).data)).invoices[
          second.id
        ],
        'confirmed',
      );
      assert.ok(seenRequests.every((r) => !r.includes('/admin/')));
    } finally {
      await new Promise((resolve) => gateway.close(resolve));
      await page.evaluate(async () => {
        await window.api.payments.saveConfig(1, {
          payeeName: '',
          youpiEnabled: false,
          baseUrl: 'http://localhost:6100',
          merchantId: '',
          webhookEnabled: false,
          webhookPort: 6390,
        });
      });
    }

    // 6. Hindi strings render and the page does not scroll sideways.
    await page.evaluate(() => window.api.settings.set(1, 'language', 'hi'));
    await page.reload();
    await route('settings/payments');
    await page.getByRole('heading', { name: 'UPI भुगतान' }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Collect via UPI dialog (QR, amount, second screen), manual UTR validation and recording, UPI badge, settings tab, statement match to Confirmed, YouPI mock gateway (connect test, Seen alert, record, reconcile to Confirmed), Hindi.',
    );
    console.log('Data:', userData, 'Screens:', out);
  } finally {
    if (app) await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
