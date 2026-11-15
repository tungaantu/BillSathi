import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from './sales-fixture.test-helper';
import { inventoryRepository } from './inventory';
import { blankItem } from '../../shared/masters';
import { documentLineFromItem, type SaleDocument } from '../../shared/sales';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
async function setup() {
  const f = await setupSales();
  fixtures.push(f);
  for (const k of ['batches', 'serials', 'godowns']) f.repo.set(f.firm.id, k, true);
  const inventory = inventoryRepository(f.context);
  const unit = f.masters.lookups(f.firm.id).units[0].id;
  const syrup = f.masters.saveItem(f.firm.id, null, {
    ...blankItem(),
    name: 'Cough Syrup',
    code: 'SYR',
    unitId: unit,
    salePrice: 12000,
    purchasePrice: 8000,
    trackBatches: true,
  });
  const phone = f.masters.saveItem(f.firm.id, null, {
    ...blankItem(),
    name: 'Phone',
    code: 'PH',
    unitId: unit,
    salePrice: 1000000,
    purchasePrice: 800000,
    trackSerials: true,
  });
  let n = 0;
  const doc = (type: SaleDocument['type'], lines: SaleDocument['lines'], extra = {}) =>
    f.sales.save(f.firm.id, null, {
      ...f.document(),
      type,
      prefix: `${type.toUpperCase()}-`,
      number: ++n,
      date: '2026-11-14',
      lines,
      ...extra,
    });
  const line = (item: typeof syrup, qty: number, extra = {}) => ({
    ...documentLineFromItem('sale', item, 0, qty),
    ...extra,
  });
  const qty = (id: number) => f.masters.items(f.firm.id).find((i) => i.id === id)!.qty;
  return { ...f, inventory, syrup, phone, doc, line, qty };
}
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});

it('receives batches on purchase, sells FEFO skipping expired, and returns to the same batch', async () => {
  const { inventory, firm, syrup, doc, line, qty } = await setup();
  const batch = (number: string, expDate: string) => ({ number, expDate, mfgDate: '', mrp: 15000 });
  doc('purchase', [
    line(syrup, 5, { batch: batch('OLD', '2026-11-01') }), // already expired on 14 Nov
    line(syrup, 4, { batch: batch('SOON', '2026-12-15') }),
    line(syrup, 10, { batch: batch('LATE', '2027-06-30') }),
  ]);
  expect(qty(syrup.id)).toBe(19);
  const sale = doc('sale', [line(syrup, 6)]);
  const byNumber = () =>
    Object.fromEntries(inventory.batchStock(firm.id, syrup.id).map((b) => [b.number, b.qty]));
  expect(byNumber()).toEqual({ OLD: 5, SOON: 0, LATE: 8 });
  expect(qty(syrup.id)).toBe(13);
  // A chosen batch wins (even expired — the editor warns first).
  const old = inventory.batchStock(firm.id, syrup.id).find((b) => b.number === 'OLD')!;
  doc('sale', [line(syrup, 2, { batchId: old.id })]);
  expect(byNumber().OLD).toBe(3);
  // Returning the first sale puts stock back into SOON and LATE.
  doc('sale_return', [line(syrup, 6)], { refTxnId: sale.id });
  expect(byNumber()).toEqual({ OLD: 3, SOON: 4, LATE: 10 });
  expect(
    inventory
      .expiry(firm.id, '2026-11-14')
      .map((r) => [r.number, r.status])
      .sort(),
  ).toEqual([
    ['LATE', 'ok'],
    ['OLD', 'expired'],
    ['SOON', 'expiring60'],
  ]);
});

it('tracks serial numbers through purchase, sale, return and blocks impossible moves', async () => {
  const { inventory, firm, phone, doc, line, sales } = await setup();
  doc('purchase', [line(phone, 3, { serials: ['IMEI-1', 'IMEI-2', 'IMEI-3'] })]);
  expect(inventory.serials(firm.id, phone.id).map((s) => s.serial)).toEqual([
    'IMEI-1',
    'IMEI-2',
    'IMEI-3',
  ]);
  // Count must match quantity; a serial already in stock cannot be bought again.
  expect(() => doc('purchase', [line(phone, 2, { serials: ['IMEI-9'] })])).toThrow('serials');
  expect(() => doc('purchase', [line(phone, 1, { serials: ['imei-2'] })])).toThrow('serials');
  const sale = doc('sale', [line(phone, 2, { serials: ['IMEI-1', 'IMEI-3'] })]);
  expect(inventory.serials(firm.id, phone.id).map((s) => s.serial)).toEqual(['IMEI-2']);
  expect(() => doc('sale', [line(phone, 1, { serials: ['IMEI-1'] })])).toThrow('serials');
  expect(() => doc('sale', [line(phone, 1, { serials: ['NOPE'] })])).toThrow('serials');
  doc('sale_return', [line(phone, 1, { serials: ['IMEI-3'] })], { refTxnId: sale.id });
  expect(inventory.serials(firm.id, phone.id).map((s) => s.serial)).toEqual(['IMEI-2', 'IMEI-3']);
  const history = inventory.serialHistory(firm.id, 'imei-3');
  expect(history[0].events.map((e) => [e.type, e.direction])).toEqual([
    ['purchase', 1],
    ['sale', -1],
    ['sale_return', 1],
  ]);
  // Cancelling a sale releases its serials again (moves follow the document's status).
  const second = doc('sale', [line(phone, 1, { serials: ['IMEI-2'] })]);
  expect(inventory.serials(firm.id, phone.id).map((s) => s.serial)).toEqual(['IMEI-3']);
  sales.action(firm.id, second.id, 'cancel');
  expect(inventory.serials(firm.id, phone.id).map((s) => s.serial)).toEqual(['IMEI-2', 'IMEI-3']);
});

it('moves stock between godowns without changing the total and undoes on delete', async () => {
  const { inventory, firm, masters, qty } = await setup();
  const book = masters.items(firm.id).find((i) => i.name === 'Book')!;
  const main = inventory.mainGodown(firm.id);
  const shop = inventory.saveGodown(firm.id, null, { name: 'Shop counter', address: '' });
  expect(() => inventory.saveGodown(firm.id, null, { name: 'shop COUNTER', address: '' })).toThrow(
    'duplicate',
  );
  const id = inventory.saveTransfer(
    firm.id,
    {
      date: '2026-11-14',
      fromId: main,
      toId: shop,
      note: '',
      lines: [{ itemId: book.id, qty: 7.5, batchId: null }],
    },
    masters.items(firm.id),
  );
  const at = (g: number) =>
    inventory.godownStock(firm.id, g).find((r) => r.itemId === book.id)?.qty;
  expect(at(main)).toBe(12.5);
  expect(at(shop)).toBe(7.5);
  expect(qty(book.id)).toBe(20);
  expect(inventory.godowns(firm.id).find((g) => g.id === shop)).toMatchObject({
    items: 1,
    qty: 7.5,
  });
  // Not enough stock in the source godown.
  expect(() =>
    inventory.saveTransfer(
      firm.id,
      {
        date: '2026-11-14',
        fromId: shop,
        toId: main,
        note: '',
        lines: [{ itemId: book.id, qty: 8, batchId: null }],
      },
      masters.items(firm.id),
    ),
  ).toThrow('negativeStock');
  expect(() => inventory.deleteGodown(firm.id, shop)).toThrow('linked');
  expect(() => inventory.deleteGodown(firm.id, main)).toThrow('validation');
  inventory.deleteTransfer(firm.id, id);
  expect(at(shop) ?? 0).toBe(0);
  expect(at(main)).toBe(20);
  inventory.deleteGodown(firm.id, shop);
  expect(inventory.godowns(firm.id).map((g) => g.name)).toEqual(['Main store']);
});
