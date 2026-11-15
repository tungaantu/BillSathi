// Smoke test: backup -> change -> restore, recycle bin, audit trail, verify data and the PIN lock.
// Runs against a throw-away profile on the secondary display. Usage: npm run build && npm run smoke:safety
const { _electron: electron } = require('playwright');
const { existsSync, mkdirSync, mkdtempSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-safety-'));
  const documents = mkdtempSync(join(tmpdir(), 'billsathi-safety-docs-'));
  const shots = process.env.SMOKE_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const errors = [];
  let app, page;
  const shot = async (name) =>
    shots && (await page.screenshot({ path: join(shots, `${name}.png`) }));
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
    await app.evaluate(({ app, dialog }, folder) => {
      app.setPath('documents', folder);
      app.relaunch = () => {}; // the test relaunches by hand
      globalThis.nextOpen = null;
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.nextOpen,
        filePaths: globalThis.nextOpen ? [globalThis.nextOpen] : [],
      });
    }, documents);
  }
  const route = (value) => page.evaluate((v) => (location.hash = v), value);
  const call = (fn, ...args) =>
    page.evaluate(
      async ({ fn, args }) => {
        const parts = fn.split('.');
        const target = parts.slice(0, -1).reduce((o, k) => o[k], window.api);
        const r = await target[parts.at(-1)](...args);
        if (!r.ok) throw new Error(r.error);
        return r.data;
      },
      { fn, args },
    );
  try {
    await launch();
    const firm = await call('firm.create', {
      name: 'Smoke Store',
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
      upiId: '',
      demo: true,
    });
    for (const screen of [
      'home',
      'backup',
      'recycleBin',
      'auditTrail',
      'verifyData',
      'settings-lock',
    ])
      await call('settings.set', firm.id, `tour.${screen}`, true);
    const parties = await call('masters.parties', firm.id);
    const items = await call('masters.items', firm.id);
    const doc = {
      type: 'sale',
      partyId: parties[0].id,
      cash: false,
      partyName: parties[0].name,
      phone: '',
      billingAddress: '',
      shippingAddress: '',
      prefix: 'INV-',
      number: Math.max(0, ...(await call('sales.list', firm.id, 'sale')).map((r) => r.number)) + 1,
      date: '2026-11-10',
      dueDate: '',
      paymentTerms: 0,
      placeOfSupply: '29',
      refTxnId: null,
      lines: [
        {
          itemId: items[0].id,
          name: items[0].name,
          hsn: '',
          qty: 1,
          freeQty: 0,
          unitId: items[0].unitId,
          price: 10000,
          inclusive: false,
          discountBps: 0,
          discountAmount: 0,
          taxBps: 0,
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
    };
    const sale = await call('sales.save', firm.id, null, doc);
    const baseline = (await call('sales.list', firm.id)).length;
    await page.reload();
    await page.waitForFunction(() => Boolean(window.api));

    // Backup now
    await route('backup');
    await page.getByRole('button', { name: 'Back up now' }).first().click();
    await page.getByText('Backup saved.').waitFor();
    const folder = join(documents, 'BillSathi Backups');
    const backups = readdirSync(folder).filter((f) => f.endsWith('.bsbk'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^BillSathi-Smoke-Store-\d{4}-\d{2}-\d{2}-\d{4}\.bsbk$/);
    await page.getByText(backups[0]).waitFor();
    await shot('backup');

    // Recycle bin: delete -> listed -> restore
    await call('sales.action', firm.id, sale.id, 'delete');
    await route('recycleBin');
    await page
      .getByRole('cell', { name: 'INV-' + String(doc.number).padStart(4, '0') + '' })
      .waitFor();
    await shot('recycle');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByText('The recycle bin is empty').waitFor();
    assert.equal((await call('sales.list', firm.id)).length, baseline);

    // Audit trail
    await route('auditTrail');
    await page.getByRole('button', { name: 'Details' }).first().click();
    await page.getByText('What changed').waitFor();
    await shot('audit');
    await page.keyboard.press('Escape');

    // Verify my data
    await route('verifyData');
    await page.getByRole('button', { name: 'Check my data' }).click();
    await page.getByText('Everything looks good').waitFor();
    await shot('verify');

    // PIN lock
    const set = await call('safety.lock.setPin', '4821');
    assert.match(set.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await page.reload();
    await page.getByText('BillSathi is locked').waitFor();
    for (const d of '1111') await page.keyboard.press(d);
    await page.keyboard.press('Enter');
    await page.getByText(/Wrong PIN/).waitFor();
    await shot('locked');
    for (const d of '4821') await page.keyboard.press(d);
    await page.keyboard.press('Enter');
    await page.getByText('BillSathi is locked').waitFor({ state: 'hidden' });
    await call('safety.lock.removePin', '4821');

    // Change data, then restore the backup
    await call('firm.update', firm.id, { ...firm, name: 'Changed Name' });
    await route('backup');
    await app.evaluate((_, file) => (globalThis.nextOpen = file), join(folder, backups[0]));
    await page.getByRole('button', { name: 'Restore from file…' }).click();
    await page.getByText('Restore this backup?').waitFor();
    await page.getByText('Smoke Store').first().waitFor();
    await shot('restore');
    const closed = app.waitForEvent('close');
    await page.getByRole('button', { name: 'Replace my data and restart' }).click();
    await closed;
    assert.ok(
      readdirSync(folder).some((f) => f.includes('-prerestore-')),
      'safety backup made',
    );

    // Relaunch: the old data is back
    await launch();
    const firms = await call('firm.list');
    assert.equal(firms[0].name, 'Smoke Store');
    assert.equal((await call('sales.list', firms[0].id)).length, baseline);
    assert.ok(existsSync(join(userData, 'billsathi.db')));
    const unexpected = errors.filter((e) => !/Autofill|DevTools/.test(e));
    assert.deepEqual(unexpected, []);
    console.log('safety smoke ok');
  } finally {
    await app?.close().catch(() => {});
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
