import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type DatabaseContext } from './index';
import { repositories } from './repositories';
import { masterRepository } from './masters';
import { blankItem, blankParty } from '../../shared/masters';
import { dashboard } from '../services/dashboard';
import * as s from './schema';
const contexts: { context: DatabaseContext; path: string }[] = [];
async function setup(demo = false) {
  const path = mkdtempSync(join(tmpdir(), 'billsathi-masters-')),
    context = await openDatabase(path);
  contexts.push({ context, path });
  const repo = repositories(context),
    masters = masterRepository(context);
  const input = {
    name: 'Asha Stores',
    phone: '9876543210',
    category: 'grocery' as const,
    stateCode: '29',
    gstin: '',
    pan: '',
    address: '',
    email: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    upiId: '',
    demo,
  };
  const firm = repo.create(input);
  return { context, path, repo, masters, firm, input };
}
afterEach(() => {
  for (const { context, path } of contexts.splice(0)) {
    context.sqlite.close();
    if (!path.startsWith(join(tmpdir(), 'billsathi-masters-'))) throw new Error('Unexpected path');
    rmSync(path, { recursive: true, force: true });
  }
});
it('persists signed balances, fills GST state and restores soft-deleted parties', async () => {
  const { masters, firm, context, path } = await setup();
  const party = masters.saveParty(firm.id, null, {
    ...blankParty('29'),
    name: 'Asha',
    openingBalance: -123400,
    gstin: '27AAPFU0939F1ZV',
  });
  expect(party).toMatchObject({ balance: -123400, stateCode: '27' });
  expect(dashboard(context, firm.id)).toMatchObject({ pay: 123400, receive: 0 });
  masters.remove(firm.id, 'parties', party.id);
  expect(masters.parties(firm.id)).toHaveLength(0);
  masters.remove(firm.id, 'parties', party.id, true);
  expect(masters.parties(firm.id)[0].balance).toBe(-123400);
  const reopened = await openDatabase(path);
  contexts.push({ context: reopened, path: mkdtempSync(join(tmpdir(), 'billsathi-masters-')) });
  expect(masterRepository(reopened).parties(firm.id)[0].balance).toBe(-123400);
});
it('derives stock from opening and converted adjustments; editing opening stock keeps adjustments', async () => {
  const { masters, firm, context } = await setup();
  const lookup = masters.lookups(firm.id),
    pcs = lookup.units.find((u) => u.symbol === 'Pcs')!.id,
    box = lookup.units.find((u) => u.symbol === 'Box')!.id;
  const item = masters.saveItem(firm.id, null, {
    ...blankItem(),
    name: 'Pencils',
    code: 'P1',
    unitId: pcs,
    secondaryUnitId: box,
    conversion: 12,
    openingQty: 10,
    openingPrice: 100,
    purchasePrice: 100,
  });
  masters.adjust(firm.id, item.id, {
    direction: 'add',
    qty: 2,
    unitId: box,
    price: 1200,
    date: '2026-11-10',
    reason: 'Count correction',
  });
  masters.adjust(firm.id, item.id, {
    direction: 'reduce',
    qty: 1,
    unitId: pcs,
    price: 100,
    date: '2026-11-10',
    reason: 'Damaged',
  });
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 33, value: 3300 });
  masters.saveItem(firm.id, item.id, { ...item, openingQty: 5 });
  expect(masters.items(firm.id)[0]).toMatchObject({ qty: 28, value: 2800 });
  expect(masters.movements(firm.id, item.id)).toHaveLength(3);
  expect(() =>
    masters.adjust(firm.id, item.id, {
      direction: 'reduce',
      qty: 100,
      unitId: pcs,
      price: 100,
      date: '2026-11-10',
      reason: 'Too many',
    }),
  ).toThrow();
  expect(dashboard(context, firm.id).stock).toBe(2800);
  masters.remove(firm.id, 'items', item.id);
  expect(dashboard(context, firm.id).stock).toBe(0);
  masters.remove(firm.id, 'items', item.id, true);
  expect(dashboard(context, firm.id).stock).toBe(2800);
});
it('rejects cross-firm references and duplicate codes atomically, including audits and stock', async () => {
  const { masters, repo, firm, input, context } = await setup();
  const second = repo.create(input),
    category = masters.saveLookup(second.id, 'categories', null, 'Other business');
  expect(() =>
    masters.saveItem(firm.id, null, {
      ...blankItem(),
      name: 'Wrong category',
      categoryId: category.id,
    }),
  ).toThrow();
  const item = masters.saveItem(firm.id, null, {
    ...blankItem(),
    name: 'First',
    code: 'A',
    openingQty: 2,
    openingPrice: 500,
  });
  const auditCount = context.db.select().from(s.auditLog).all().length;
  expect(() =>
    context.sqlite.transaction(() => {
      masters.saveItemRaw(firm.id, null, {
        ...blankItem(),
        name: 'Temporary',
        code: 'B',
        openingQty: 5,
        openingPrice: 100,
      });
      masters.saveItemRaw(firm.id, null, { ...blankItem(), name: 'Duplicate', code: 'A' });
    })(),
  ).toThrow();
  expect(masters.items(firm.id)).toHaveLength(1);
  expect(context.db.select().from(s.auditLog).all()).toHaveLength(auditCount);
  expect(masters.movements(firm.id, item.id)).toHaveLength(1);
  expect(() => masters.remove(second.id, 'items', item.id)).toThrow();
  expect(() => masters.saveItem(second.id, item.id, { ...blankItem(), name: 'Hijack' })).toThrow();
  masters.saveItem(firm.id, null, { ...blankItem(), name: 'Valid after rollback' });
  expect(masters.items(firm.id)).toHaveLength(2);
});
it('counts categories, protects linked entries and standard units, manages conversions', async () => {
  const { masters, firm } = await setup();
  const category = masters.saveLookup(firm.id, 'categories', null, 'Stationery');
  masters.saveItem(firm.id, null, { ...blankItem(), name: 'Notebook', categoryId: category.id });
  expect(masters.lookups(firm.id).categories[0].count).toBe(1);
  expect(() => masters.deleteLookup(firm.id, 'categories', category.id)).toThrow();
  const standard = masters.lookups(firm.id).units[0];
  expect(() => masters.deleteLookup(firm.id, 'units', standard.id)).toThrow();
  const unit = masters.saveLookup(firm.id, 'units', null, 'Crates', 'Cr');
  masters.saveConversion(firm.id, null, unit.id, standard.id, 12);
  expect(masters.lookups(firm.id).conversions[0].factor).toBe(12);
  masters.deleteConversion(firm.id, masters.lookups(firm.id).conversions[0].id);
  masters.deleteLookup(firm.id, 'units', unit.id);
});
it('seeds ten Indian parties and 25 items, removes only seed IDs, and restores their stock', async () => {
  const { masters, repo, firm, context } = await setup(true);
  expect(masters.parties(firm.id)).toHaveLength(10);
  expect(masters.items(firm.id)).toHaveLength(25);
  expect(masters.lookups(firm.id).categories.length).toBeGreaterThanOrEqual(3);
  const value = dashboard(context, firm.id).stock;
  expect(value).toBeGreaterThan(0);
  masters.saveItem(firm.id, null, { ...blankItem(), name: 'My own item' });
  repo.clearDemo(firm.id);
  expect(masters.items(firm.id).map((i) => i.name)).toEqual(['My own item']);
  expect(masters.parties(firm.id)).toHaveLength(0);
  expect(dashboard(context, firm.id).stock).toBe(0);
  repo.restoreDemo(firm.id);
  expect(masters.items(firm.id)).toHaveLength(26);
  expect(dashboard(context, firm.id).stock).toBe(value);
});
