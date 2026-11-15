import { seedDemo } from './demo';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import type { Firm, FirmInput, Settings, SettingValue } from '../../shared/types';
import { categoryPresets, DEFAULT_SETTINGS, validSetting } from '../../shared/settings';
import { firmInputSchema } from '../../shared/validation';
export function repositories(context: DatabaseContext) {
  const { sqlite } = context;
  const db = new Proxy(context.db, {
    get(_target, property) {
      const value = Reflect.get(context.db, property);
      return typeof value === 'function' ? value.bind(context.db) : value;
    },
  });
  const audit = (
    firmId: number,
    entity: string,
    entityId: number,
    action: string,
    before: unknown,
    after: unknown,
  ) =>
    db
      .insert(s.auditLog)
      .values({
        firmId,
        entity,
        entityId,
        action,
        before: JSON.stringify(before),
        after: JSON.stringify(after),
        at: new Date().toISOString(),
      })
      .run();
  function get(id: number): Firm {
    const row = db
      .select()
      .from(s.firms)
      .where(and(eq(s.firms.id, id), isNull(s.firms.deletedAt)))
      .get();
    if (!row) throw new Error('notFound');
    return row as Firm;
  }
  const getSettings = (firmId: number): Settings => {
    get(firmId);
    return {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(
        db
          .select()
          .from(s.settings)
          .where(eq(s.settings.firmId, firmId))
          .all()
          .map((row) => [row.key, JSON.parse(row.value)]),
      ),
    };
  };
  function create(input: FirmInput): Firm {
    const data = firmInputSchema.parse(input);
    return sqlite.transaction(() => {
      const row = db
        .insert(s.firms)
        .values({
          ...data,
          pan: data.gstin ? data.gstin.slice(2, 12) : data.pan,
          createdAt: new Date().toISOString(),
        })
        .returning()
        .get();
      for (const [key, value] of Object.entries(categoryPresets(data.category)))
        db.insert(s.settings)
          .values({ firmId: row.id, key, value: JSON.stringify(value) })
          .run();
      const account = db
        .insert(s.paymentAccounts)
        .values({ firmId: row.id, name: 'Cash', type: 'cash' })
        .returning()
        .get();
      audit(row.id, 'payment_accounts', account.id, 'create', null, account);
      for (const name of ['rent', 'electricity', 'transport', 'salary', 'office', 'other']) {
        const category = db
          .insert(s.expenseCategories)
          .values({ firmId: row.id, name })
          .returning()
          .get();
        audit(row.id, 'expense_categories', category.id, 'create', null, category);
      }
      if (data.demo) seedDemo(context, row.id, data.stateCode, audit);
      audit(row.id, 'firms', row.id, 'create', null, row);
      return get(row.id);
    })();
  }
  function update(id: number, input: FirmInput): Firm {
    const data = firmInputSchema.parse(input);
    return sqlite.transaction(() => {
      const before = get(id);
      db.update(s.firms)
        .set({ ...data, demo: before.demo, pan: data.gstin ? data.gstin.slice(2, 12) : data.pan })
        .where(eq(s.firms.id, id))
        .run();
      const after = get(id);
      audit(id, 'firms', id, 'update', before, after);
      return after;
    })();
  }
  function set(firmId: number, key: string, value: SettingValue): Settings {
    if (!validSetting(key, value)) throw new Error('validation');
    return sqlite.transaction(() => {
      const before = getSettings(firmId)[key];
      db.insert(s.settings)
        .values({ firmId, key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: [s.settings.firmId, s.settings.key],
          set: { value: JSON.stringify(value) },
        })
        .run();
      // Screen preferences (tour seen, tips hidden, recent reports) are not business changes.
      if (!/^(tour|banner)\.|^reports\.recent$/.test(key))
        audit(firmId, 'settings', firmId, 'update', { key, value: before }, { key, value });
      return getSettings(firmId);
    })();
  }
  function clearDemo(firmId: number): Firm {
    return sqlite.transaction(() => {
      const before = get(firmId);
      if (!before.demo) throw new Error('validation');
      const markers = getSettings(firmId);
      // Only the exact seeded masters can be removed; referenced records stay intact.
      const at = new Date().toISOString();
      db.insert(s.settings)
        .values({ firmId, key: 'demo.clearedAt', value: JSON.stringify(at) })
        .onConflictDoUpdate({
          target: [s.settings.firmId, s.settings.key],
          set: { value: JSON.stringify(at) },
        })
        .run();
      for (const [key, table] of [
        ['demo.txnIds', s.txns],
        ['demo.accountIds', s.paymentAccounts],
        ['demo.loanIds', s.loans],
      ] as const) {
        const ids = markers[key] as unknown as number[];
        if (!Array.isArray(ids) || !ids.length) continue;
        for (const row of db
          .select()
          .from(table)
          .where(and(eq(table.firmId, firmId), inArray(table.id, ids), isNull(table.deletedAt)))
          .all()) {
          db.update(table).set({ deletedAt: at }).where(eq(table.id, row.id)).run();
          audit(firmId, key, row.id, 'delete', row, { deletedAt: at });
        }
      }
      for (const row of db
        .select()
        .from(s.items)
        .where(
          and(
            eq(s.items.firmId, firmId),
            inArray(
              s.items.id,
              Array.isArray(markers['demo.itemIds'])
                ? (markers['demo.itemIds'] as unknown as number[])
                : [Number(markers['demo.itemId'])],
            ),
            isNull(s.items.deletedAt),
          ),
        )
        .all()) {
        db.update(s.items).set({ deletedAt: at }).where(eq(s.items.id, row.id)).run();
        audit(firmId, 'items', row.id, 'delete', row, { deletedAt: at });
      }
      for (const row of db
        .select()
        .from(s.parties)
        .where(
          and(
            eq(s.parties.firmId, firmId),
            inArray(
              s.parties.id,
              Array.isArray(markers['demo.partyIds'])
                ? (markers['demo.partyIds'] as unknown as number[])
                : [Number(markers['demo.partyId'])],
            ),
            isNull(s.parties.deletedAt),
          ),
        )
        .all()) {
        db.update(s.parties).set({ deletedAt: at }).where(eq(s.parties.id, row.id)).run();
        audit(firmId, 'parties', row.id, 'delete', row, { deletedAt: at });
      }
      db.update(s.firms).set({ demo: false }).where(eq(s.firms.id, firmId)).run();
      audit(firmId, 'firms', firmId, 'update', before, get(firmId));
      return get(firmId);
    })();
  }
  function restoreDemo(firmId: number): Firm {
    return sqlite.transaction(() => {
      const before = get(firmId);
      const markers = getSettings(firmId);
      const at = markers['demo.clearedAt'];
      if (before.demo || typeof at !== 'string' || !at) throw new Error('validation');
      for (const [key, table] of [
        ['demo.txnIds', s.txns],
        ['demo.accountIds', s.paymentAccounts],
        ['demo.loanIds', s.loans],
      ] as const) {
        const ids = markers[key] as unknown as number[];
        if (!Array.isArray(ids) || !ids.length) continue;
        for (const row of db
          .select()
          .from(table)
          .where(and(eq(table.firmId, firmId), inArray(table.id, ids), eq(table.deletedAt, at)))
          .all()) {
          db.update(table).set({ deletedAt: null }).where(eq(table.id, row.id)).run();
          audit(firmId, key, row.id, 'restore', row, { deletedAt: null });
        }
      }
      for (const row of db
        .select()
        .from(s.items)
        .where(
          and(
            eq(s.items.firmId, firmId),
            inArray(
              s.items.id,
              Array.isArray(markers['demo.itemIds'])
                ? (markers['demo.itemIds'] as unknown as number[])
                : [Number(markers['demo.itemId'])],
            ),
            eq(s.items.deletedAt, at),
          ),
        )
        .all()) {
        db.update(s.items).set({ deletedAt: null }).where(eq(s.items.id, row.id)).run();
        audit(firmId, 'items', row.id, 'restore', row, { deletedAt: null });
      }
      for (const row of db
        .select()
        .from(s.parties)
        .where(
          and(
            eq(s.parties.firmId, firmId),
            inArray(
              s.parties.id,
              Array.isArray(markers['demo.partyIds'])
                ? (markers['demo.partyIds'] as unknown as number[])
                : [Number(markers['demo.partyId'])],
            ),
            eq(s.parties.deletedAt, at),
          ),
        )
        .all()) {
        db.update(s.parties).set({ deletedAt: null }).where(eq(s.parties.id, row.id)).run();
        audit(firmId, 'parties', row.id, 'restore', row, { deletedAt: null });
      }
      db.update(s.firms).set({ demo: true }).where(eq(s.firms.id, firmId)).run();
      db.delete(s.settings)
        .where(and(eq(s.settings.firmId, firmId), eq(s.settings.key, 'demo.clearedAt')))
        .run();
      audit(firmId, 'firms', firmId, 'restore', before, get(firmId));
      return get(firmId);
    })();
  }
  return {
    get,
    create,
    update,
    getSettings,
    set,
    audit,
    clearDemo,
    restoreDemo,
    list: () => db.select().from(s.firms).where(isNull(s.firms.deletedAt)).all() as Firm[],
    units: () => db.select().from(s.units).all(),
  };
}
