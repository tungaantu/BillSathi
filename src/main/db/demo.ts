import { eq } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { stockAmount, today } from '../../shared/masters';
import { seedFinanceDemo } from './demo-finance';
// Fresh produce headings and nil rates: https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html
const produce: [string, string, number, string][] = [
  ['Potato (Aloo)', '0701', 3000, 'Root vegetables'],
  ['Tomato (Tamatar)', '0702', 4000, 'Fresh vegetables'],
  ['Onion (Pyaz)', '0703', 3500, 'Root vegetables'],
  ['Garlic (Lahsun)', '0703', 18000, 'Root vegetables'],
  ['Cabbage (Patta gobhi)', '0704', 2500, 'Fresh vegetables'],
  ['Cauliflower (Phool gobhi)', '0704', 5000, 'Fresh vegetables'],
  ['Carrot (Gajar)', '0706', 6000, 'Root vegetables'],
  ['Radish (Mooli)', '0706', 2500, 'Root vegetables'],
  ['Beetroot (Chukandar)', '0706', 7000, 'Root vegetables'],
  ['Cucumber (Kheera)', '0707', 3500, 'Fresh vegetables'],
  ['Green peas (Matar)', '0708', 10000, 'Fresh vegetables'],
  ['French beans (Phali)', '0708', 8000, 'Fresh vegetables'],
  ['Brinjal (Baingan)', '0709', 4500, 'Fresh vegetables'],
  ['Okra (Bhindi)', '0709', 6500, 'Fresh vegetables'],
  ['Spinach (Palak)', '0709', 4000, 'Leafy vegetables'],
  ['Fenugreek leaves (Methi)', '0709', 6000, 'Leafy vegetables'],
  ['Banana (Kela)', '0803', 5000, 'Fresh fruit'],
  ['Mango (Aam)', '0804', 12000, 'Fresh fruit'],
  ['Guava (Amrood)', '0804', 8000, 'Fresh fruit'],
  ['Pineapple (Ananas)', '0804', 7000, 'Fresh fruit'],
  ['Orange (Santra)', '0805', 9000, 'Fresh fruit'],
  ['Lemon (Nimbu)', '0805', 10000, 'Fresh fruit'],
  ['Grapes (Angoor)', '0806', 12000, 'Fresh fruit'],
  ['Papaya (Papita)', '0807', 4500, 'Fresh fruit'],
  ['Apple (Seb)', '0808', 16000, 'Fresh fruit'],
];
export function seedDemo(
  context: DatabaseContext,
  firmId: number,
  stateCode: string,
  audit: (
    firm: number,
    entity: string,
    id: number,
    action: string,
    before: unknown,
    after: unknown,
  ) => unknown,
) {
  const { db } = context,
    partyIds: number[] = [],
    itemIds: number[] = [];
  const group = db.insert(s.partyGroups).values({ firmId, name: 'Local trade' }).returning().get();
  audit(firmId, 'party_groups', group.id, 'create', null, group);
  for (const [n, name] of [
    'Asha Kirana Store',
    'Rajesh Sharma',
    'Meera Tiffin Centre',
    'Patel Fresh Mart',
    'Kavita Joshi',
    'Shree Ganesh Traders',
    'Iqbal Fruit Suppliers',
    'Lakshmi Vegetable Mandi',
    'Anita Deshmukh',
    'Suresh Wholesale',
  ].entries()) {
    const row = db
      .insert(s.parties)
      .values({
        firmId,
        name,
        phone: `98${String(76543200 + n)}`,
        stateCode,
        groupId: group.id,
        openingBalance: n < 5 ? (n + 1) * 10000 : -(n + 1) * 5000,
        openingDate: today(),
        billingAddress: `${n + 1}, Market Road`,
        active: true,
      })
      .returning()
      .get();
    partyIds.push(row.id);
    audit(firmId, 'parties', row.id, 'create', null, row);
  }
  const categories = new Map<string, number>();
  const kg = db.select().from(s.units).where(eq(s.units.symbol, 'Kg')).get()!.id;
  const tax = db.select().from(s.taxRates).where(eq(s.taxRates.name, 'GST 0%')).get()!.id;
  for (const [n, [name, hsn, price, category]] of produce.entries()) {
    if (!categories.has(category)) {
      const row = db.insert(s.itemCategories).values({ firmId, name: category }).returning().get();
      categories.set(category, row.id);
      audit(firmId, 'item_categories', row.id, 'create', null, row);
    }
    const purchasePrice = price - 500;
    const row = db
      .insert(s.items)
      .values({
        firmId,
        name,
        code: `DEMO-${String(n + 1).padStart(3, '0')}`,
        hsn,
        categoryId: categories.get(category),
        unitId: kg,
        taxRateId: tax,
        salePrice: price,
        purchasePrice,
        minStock: 5,
        location: `Rack ${(n % 4) + 1}`,
        customFields: JSON.stringify({ openingPrice: purchasePrice }),
      })
      .returning()
      .get();
    itemIds.push(row.id);
    audit(firmId, 'items', row.id, 'create', null, row);
    const stock = db
      .insert(s.stockLedger)
      .values({
        firmId,
        itemId: row.id,
        date: today(),
        qty: n % 5 === 0 ? 3 : 20,
        value: stockAmount(n % 5 === 0 ? 3 : 20, purchasePrice),
        reason: 'opening',
      })
      .returning()
      .get();
    audit(firmId, 'stock_ledger', stock.id, 'create', null, stock);
  }
  for (const [key, value] of Object.entries({
    'demo.partyIds': partyIds,
    'demo.itemIds': itemIds,
    'demo.partyId': partyIds[0],
    'demo.itemId': itemIds[0],
  }))
    db.insert(s.settings)
      .values({ firmId, key, value: JSON.stringify(value) })
      .run();
  seedFinanceDemo(context, firmId);
}
