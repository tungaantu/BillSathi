// Orders smoke: sale order → partial challan → invoice, proforma, recurring, party prices,
// loyalty tab, reminders → WhatsApp link (mocked, no network), Hindi. Secondary display, temp data.
const { _electron: electron } = require('playwright');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-orders-'));
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
    // Capture external links instead of opening a browser.
    await app.evaluate(({ shell }) => {
      globalThis.__opened = [];
      shell.openExternal = async (url) => {
        globalThis.__opened.push(url);
      };
    });
    const flow = await page.evaluate(async () => {
      let step = 'start';
      const unwrap = (r) => {
        if (!r.ok) throw new Error(`${step}: ${r.error}`);
        return r.data;
      };
      const firm = unwrap(
        await window.api.firm.create({
          name: 'Orders Demo',
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
      for (const [k, v] of Object.entries({
        orders: true,
        challan: true,
        proforma: true,
        partyRates: true,
        loyalty: true,
      }))
        unwrap(await window.api.settings.set(firm.id, k, v));
      for (const screen of [
        'home',
        'invoices',
        'saleOrders',
        'challans',
        'proforma',
        'recurring',
        'reminders',
        'parties',
        'settings',
      ])
        unwrap(await window.api.settings.set(firm.id, `tour.${screen}`, true));
      const invoices = unwrap(await window.api.sales.list(firm.id, 'sale'));
      const source = unwrap(await window.api.sales.get(firm.id, invoices[0].id));
      const pick = (doc, type, prefix) => {
        const copy = {
          ...doc,
          type,
          prefix,
          payments: [],
          refTxnId: null,
          loyaltyRedeem: 0,
          loyaltyDiscount: 0,
        };
        for (const k of ['id', 'number', 'received', 'balance', 'status', 'deletedAt'])
          delete copy[k];
        return copy;
      };
      const number = async (type, prefix) =>
        unwrap(await window.api.sales.next(firm.id, type, prefix));
      step = 'save order';
      const order = unwrap(
        await window.api.sales.save(firm.id, null, {
          ...pick(source, 'sale_order', 'SO-'),
          number: await number('sale_order', 'SO-'),
          lines: source.lines.map((l) => ({ ...l, qty: 4 })),
        }),
      );
      step = 'order → challan';
      const challan = unwrap(
        await window.api.sales.convert(
          firm.id,
          order.id,
          'delivery_challan',
          order.lines.map(() => 1),
        ),
      );
      const orderAfter = unwrap(await window.api.sales.get(firm.id, order.id));
      step = 'challan → invoice';
      const invoice = unwrap(await window.api.sales.convert(firm.id, challan.id, 'sale'));
      step = 'save proforma';
      const proforma = unwrap(
        await window.api.sales.save(firm.id, null, {
          ...pick(source, 'proforma', 'PRO-'),
          number: await number('proforma', 'PRO-'),
        }),
      );
      step = 'proforma → invoice';
      const fromProforma = unwrap(await window.api.sales.convert(firm.id, proforma.id, 'sale'));
      unwrap(
        await window.api.customers.recur(firm.id, {
          sourceId: invoices[0].id,
          frequency: 'monthly',
          day: 1,
          start: '2026-01-01',
          end: '',
          mode: 'draft',
        }),
      );
      const recurring = unwrap(await window.api.customers.recurring(firm.id));
      step = 'overdue invoice';
      const debtor = unwrap(await window.api.masters.parties(firm.id)).find((p) => p.balance > 0);
      unwrap(
        await window.api.sales.save(firm.id, null, {
          ...pick(source, 'sale', source.prefix),
          number: await number('sale', source.prefix),
          cash: false,
          date: '2026-09-01',
          dueDate: '2026-09-15',
          partyId: debtor.id,
          partyName: debtor.name,
          phone: debtor.phone,
        }),
      );
      return {
        firm: firm.id,
        partyId: source.partyId,
        orderStatus: orderAfter.status,
        invoiceType: invoice.type,
        proformaInvoice: fromProforma.type,
        recurring: recurring.length,
        reminders: unwrap(await window.api.customers.reminders(firm.id)).length,
      };
    });
    assert.ok(flow.reminders > 0, 'an overdue invoice should create a payment reminder');
    assert.equal(flow.orderStatus, 'partially_delivered');
    assert.equal(flow.invoiceType, 'sale');
    assert.equal(flow.proformaInvoice, 'sale');
    assert.equal(flow.recurring, 1);
    await page.reload();
    const route = (v) =>
      page.evaluate((v) => {
        location.hash = v;
      }, v);
    for (const [path, heading] of [
      ['saleOrders', /Sale Order/i],
      ['challans', /Delivery Challan/i],
      ['proforma', /Proforma/i],
      ['recurring', /Recurring invoices/i],
      ['reminders', /Payment & service reminders/i],
    ]) {
      await route(path);
      await page.locator('h1').filter({ hasText: heading }).first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(userData, `7a-${path}.png`), scale: 'css' });
    }
    await route('reminders');
    await page.screenshot({ path: join(userData, '7a-reminders.png'), scale: 'css' });
    // Recurring list shows the schedule made above (catch-up already ran on app start).
    await route('recurring');
    await page
      .getByRole('button', { name: /Pause|Resume/ })
      .first()
      .waitFor();
    // Party detail: Special prices + points ledger tabs render.
    await route(`parties/${flow.partyId}`);
    await page.getByRole('tab', { name: /price/i }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Points ledger/ }).click();
    await page.waitForTimeout(300);
    // Reminders → message → WhatsApp (link captured, nothing sent).
    await route('reminders');
    await page.getByRole('button', { name: 'Message', exact: true }).first().click();
    await page.screenshot({ path: join(userData, '7a-reminder-message.png'), scale: 'css' });
    await page.getByRole('button', { name: 'Send via WhatsApp', exact: true }).click();
    await page.waitForTimeout(500);
    const opened = await app.evaluate(() => globalThis.__opened);
    assert.ok(
      opened.some((u) => /^https:\/\/wa\.me\/91\d{10}\?text=/.test(u)),
      JSON.stringify(opened),
    );
    // Message templates settings and Hindi.
    await route('settings/messages');
    await page.waitForTimeout(400);
    await page.evaluate(async (firm) => window.api.settings.set(firm, 'language', 'hi'), flow.firm);
    await page.reload();
    await route('recurring');
    await page.locator('h1').filter({ hasText: 'नियमित चालान' }).waitFor();
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    assert.deepEqual(real, []);
    console.log(
      'PASS: sale order → partial challan → invoice, proforma → invoice, recurring list, party prices & points tabs, reminders → wa.me link, templates, Hindi, secondary display.',
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
