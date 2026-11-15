import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSales } from './sales-fixture.test-helper';
import { blankItem } from '../../shared/masters';

const fixtures: Awaited<ReturnType<typeof setupSales>>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.context.sqlite.close();
    if (!f.path.startsWith(join(tmpdir(), 'billsathi-sales-'))) throw new Error('Unexpected path');
    rmSync(f.path, { recursive: true, force: true });
  }
});

it('updates prices, GST, HSN and low-stock level of many items in one save', async () => {
  const f = await setupSales();
  fixtures.push(f);
  const { masters, firm } = f;
  const pen = masters.saveItem(firm.id, null, {
    ...blankItem(),
    name: 'Pen',
    code: 'PEN',
    unitId: masters.lookups(firm.id).units[0].id,
    salePrice: 1000,
  });
  const book = masters.items(firm.id).find((i) => i.code === 'BOOK')!;
  const tax = masters.lookups(firm.id).taxes.find((t) => t.rateBps === 1200)!.id;
  expect(
    masters.bulkUpdate(firm.id, [
      { id: pen.id, salePrice: 1200, hsn: '9608', minStock: 5 },
      { id: book.id, taxRateId: tax, mrp: 15000 },
    ]),
  ).toBe(2);
  const after = new Map(masters.items(firm.id).map((i) => [i.id, i]));
  expect(after.get(pen.id)).toMatchObject({ salePrice: 1200, hsn: '9608', minStock: 5 });
  expect(after.get(book.id)).toMatchObject({ taxRateId: tax, mrp: 15000, qty: 20 }); // stock untouched
  // One bad row stops the whole save (nothing half-done); unknown fields are refused.
  expect(() =>
    masters.bulkUpdate(firm.id, [
      { id: pen.id, salePrice: 1500 },
      { id: book.id, hsn: 'ABC' },
    ]),
  ).toThrow();
  expect(masters.items(firm.id).find((i) => i.id === pen.id)!.salePrice).toBe(1200);
  expect(() => masters.bulkUpdate(firm.id, [{ id: pen.id, name: 'Hacked' }])).toThrow();
});
