/* Drives the built app (run `npm run build` first): seeds a business, party, item and invoice, then
 * exercises the e-way bill / e-invoice dialogs and the Tally export dialog.
 * Screenshots go to SHOTS (default: a temp folder).   npm run smoke:compliance */
const { _electron: electron } = require('playwright');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function closeDialog(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
const GSTIN = '27AAPFU0939F1ZV';
async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-compliance-'));
  const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'billsathi-shots-'));
  mkdirSync(shots, { recursive: true });
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
    timeout: 60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.getByRole('heading', { name: 'Let’s meet your business' }).waitFor();
    const seeded = await page.evaluate(async (gstin) => {
      const ok = (r) => {
        if (!r.ok) throw new Error(JSON.stringify(r));
        return r.data;
      };
      const api = window.api;
      const firm = ok(
        await api.firm.create({
          name: 'Asha & Sons',
          phone: '9876543210',
          category: 'grocery',
          stateCode: '27',
          gstin,
          pan: '',
          address: 'Plot 9, Andheri East, Mumbai 400069',
          email: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          upiId: '',
          demo: false,
        }),
      );
      const lookups = ok(await api.masters.lookups(firm.id));
      const party = ok(
        await api.masters.saveParty(firm.id, null, {
          name: 'Ravi Stores',
          phone: '9123456789',
          email: '',
          gstType: 'regular',
          gstin: '29AAPFU0939F1ZR',
          stateCode: '29',
          billingAddress: '12 MG Road, Indiranagar, Bengaluru 560001',
          shippingAddress: '',
          openingBalance: 0,
          openingDate: '2026-04-01',
          creditLimit: null,
          groupId: null,
          customFields: {},
          active: true,
        }),
      );
      const tax = lookups.taxes.find((t) => t.rateBps === 1800);
      const item = ok(
        await api.masters.saveItem(firm.id, null, {
          name: 'Basmati Rice',
          type: 'product',
          code: 'RICE',
          hsn: '1006',
          categoryId: null,
          unitId: lookups.units.find((u) => u.symbol === 'Kg').id,
          secondaryUnitId: null,
          conversion: 1,
          taxRateId: tax.id,
          salePrice: 100000,
          purchasePrice: 80000,
          wholesalePrice: 0,
          mrp: 0,
          inclusive: false,
          purchaseInclusive: false,
          discountBps: 0,
          discountAmount: 0,
          discountType: 'percent',
          wholesaleQty: 0,
          openingQty: 500,
          openingPrice: 80000,
          openingDate: '2026-04-01',
          minStock: 0,
          location: '',
          image: null,
          customFields: {},
        }),
      );
      const invoice = ok(
        await api.sales.save(firm.id, null, {
          type: 'sale',
          partyId: party.id,
          cash: false,
          partyName: party.name,
          phone: '9123456789',
          billingAddress: party.billingAddress,
          shippingAddress: '',
          prefix: 'INV-',
          number: 1,
          date: '2026-11-10',
          dueDate: '',
          paymentTerms: 0,
          placeOfSupply: '29',
          refTxnId: null,
          lines: [
            {
              itemId: item.id,
              name: item.name,
              hsn: '1006',
              qty: 100,
              freeQty: 0,
              unitId: item.unitId,
              price: 100000,
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
      return { firm: firm.id, invoice: invoice.id };
    }, GSTIN);
    await page.reload();
    await page.getByRole('heading', { name: /Welcome/ }).waitFor();
    const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    // --- Invoice preview: e-way bill dialog ---
    await page.evaluate((id) => {
      location.hash = `#invoices/preview/${id}`;
    }, seeded.invoice);
    await page.getByRole('button', { name: 'E-way bill JSON' }).waitFor();
    await page.getByRole('button', { name: 'E-way bill JSON' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'E-way bill JSON' }).waitFor();
    const skipGuide = dialog.getByRole('button', { name: 'Skip guide' });
    if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
    await dialog.getByLabel('Vehicle number', { exact: true }).fill('XX');
    await dialog.getByText('The vehicle number looks wrong').first().waitFor();
    await dialog.getByLabel('Vehicle number', { exact: true }).fill('ka01ab1234');
    await dialog.getByLabel('Distance (km)', { exact: true }).fill('150');
    await dialog.getByText('Everything needed is filled in.').waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Save JSON file' }).isEnabled(), true);
    await page.screenshot({ path: join(shots, 'eway-dialog.png') });
    await dialog
      .getByLabel('E-way bill number from the portal', { exact: true })
      .fill('341001234567');
    await dialog.getByRole('button', { name: 'Save number' }).click();
    await page.getByText('E-way bill number saved with this invoice.').waitFor();
    await closeDialog(page);
    await page.getByText('E-way bill 341001234567').waitFor();

    // --- e-invoice: ack paste-back prints on the invoice ---
    await page.getByRole('button', { name: 'E-invoice JSON' }).click();
    const einv = page.getByRole('dialog');
    await einv.getByRole('heading', { name: 'E-invoice JSON' }).waitFor();
    const skipGuide2 = einv.getByRole('button', { name: 'Skip guide' });
    if (await skipGuide2.isVisible().catch(() => false)) await skipGuide2.click();
    await einv.getByText('Everything needed is filled in.').waitFor();
    await page.screenshot({ path: join(shots, 'einvoice-dialog.png') });
    await einv.getByLabel('IRN (64 characters)', { exact: true }).fill('ab'.repeat(32));
    await einv.getByLabel('Acknowledgement number', { exact: true }).fill('112010012345678');
    await einv.getByLabel('Acknowledgement date', { exact: true }).fill('2026-11-10 12:30:00');
    await einv
      .getByLabel('Signed QR code text', { exact: true })
      .fill('eyJhbGciOiJSUzI1NiJ9.eyJpcm4iOiJhYiJ9.c2ln');
    await einv.getByRole('button', { name: 'Save IRN details' }).click();
    await page.getByText('IRN details saved. They will print on this invoice.').waitFor();
    await closeDialog(page);
    const html = await page.evaluate(
      async ({ firm, invoice }) => (await window.api.sales.preview(firm, invoice)).data,
      { firm: seeded.firm, invoice: seeded.invoice },
    );
    assert.match(html, new RegExp('ab'.repeat(32)));
    assert.match(html, /112010012345678/);
    await page.screenshot({ path: join(shots, 'invoice-with-irn.png') });

    // --- Utilities: Tally + bulk e-way ---
    await page.evaluate(() => {
      location.hash = '#utilities';
    });
    await page.getByRole('button', { name: 'Export to Tally' }).click();
    const tally = page.getByRole('dialog');
    await tally.getByRole('heading', { name: 'Export to Tally' }).waitFor();
    await tally.getByText(/ledgers · .* stock items/).waitFor();
    await page.screenshot({ path: join(shots, 'tally-dialog.png') });
    const counts = await page.evaluate(
      async ({ firm }) =>
        (
          await window.api.compliance.tallyCount(firm, {
            from: '2026-04-01',
            to: '2027-03-31',
            masters: true,
            vouchers: true,
            voucherKinds: ['sale'],
            openingBalances: false,
            companyName: 'Asha & Sons',
            ledgers: {
              sales: 'Sales',
              purchase: 'Purchase',
              outputCgst: 'Output CGST',
              outputSgst: 'Output SGST',
              outputIgst: 'Output IGST',
              outputCess: 'Output Cess',
              inputCgst: 'Input CGST',
              inputSgst: 'Input SGST',
              inputIgst: 'Input IGST',
              inputCess: 'Input Cess',
              roundOff: 'Round Off',
              discount: 'Discount Allowed',
              cash: 'Cash',
            },
          })
        ).data,
      { firm: seeded.firm },
    );
    assert.equal(counts.vouchers, 1);
    assert.equal(counts.stockItems, 1);
    await closeDialog(page);
    await page.getByRole('button', { name: 'E-way bill JSON for many invoices' }).click();
    await page
      .getByRole('dialog')
      .getByRole('heading', { name: 'E-way bill JSON for many invoices' })
      .waitFor();
    await page.screenshot({ path: join(shots, 'bulk-eway-dialog.png') });
    await closeDialog(page);
    assert.deepEqual(errors, []);
    console.log(`Compliance UI OK. Screenshots: ${shots}`);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
