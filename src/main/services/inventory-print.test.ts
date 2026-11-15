import { expect, it } from 'vitest';
import { blankItem, type Item } from '../../shared/masters';
import { LABEL_LAYOUTS, labelValue, labelsHtml, transferHtml } from './inventory-print';

const item = (id: number, code: string, extra: Partial<Item> = {}): Item => ({
  ...blankItem(),
  id,
  firmId: 1,
  qty: 0,
  value: 0,
  name: `Item ${id}`,
  code,
  salePrice: 4500,
  ...extra,
});
const t = (k: string) => k;
const fields = { name: true, price: true, mrp: true, code: true, firm: true };

it('prints one label per copy with barcode, price and the chosen layout', () => {
  const html = labelsHtml(
    {
      items: [
        { itemId: 1, copies: 3 },
        { itemId: 2, copies: 2 },
      ],
      layout: 'a4-65',
      fields,
    },
    [item(1, 'SUGAR1KG', { mrp: 5000 }), item(2, 'X2', { barcode: '8901234567890' })],
    'Shree Stores',
    t,
  );
  expect(html.match(/class="label"/g)).toHaveLength(5);
  expect(html.match(/<svg/g)).toHaveLength(5);
  expect(html).toContain('8901234567890'); // barcode wins over item code
  expect(html).toContain('₹45.00');
  expect(html).toContain('grid-template-columns:repeat(5,38.1mm)');
  expect(labelValue({ code: 'ABC', barcode: '' })).toBe('ABC');
});
it('rejects unknown layouts, items without a code and silly copy counts', () => {
  const items = [item(1, ''), item(2, 'OK')];
  const request = (itemId: number, copies: number, layout = 'roll-50x25') => ({
    items: [{ itemId, copies }],
    layout,
    fields,
  });
  expect(() => labelsHtml(request(1, 1), items, 'S', t)).toThrow('validation');
  expect(() => labelsHtml(request(2, 0), items, 'S', t)).toThrow('validation');
  expect(() => labelsHtml(request(2, 1, 'a5-1'), items, 'S', t)).toThrow('validation');
  expect(labelsHtml(request(2, 2), items, 'S', t)).toContain('size:50mm 25mm');
  expect(Object.keys(LABEL_LAYOUTS)).toHaveLength(6);
});
it('prints a transfer slip with both godowns and escaped text', () => {
  const html = transferHtml(
    {
      id: 1,
      number: 7,
      date: '2026-11-14',
      fromId: 1,
      toId: 2,
      from: 'Main <store>',
      to: 'Shop',
      note: 'n',
      lines: [{ itemId: 1, qty: 2.5, batchId: null }],
    },
    [item(1, 'A')],
    'Shree Stores',
    t,
    (d) => d.split('-').reverse().join('/'),
  );
  expect(html).toContain('Main &lt;store&gt;');
  expect(html).toContain('14/11/2026');
  expect(html).toContain('>2.5<');
});
