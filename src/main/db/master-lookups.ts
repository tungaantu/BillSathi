import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { repositories } from './repositories';
import type { LookupKind, Lookups } from '../../shared/masters';
export function lookupRepository(context: DatabaseContext) {
  const repo = repositories(context);
  const db = new Proxy(context.db, {
    get(_t, p) {
      const v = Reflect.get(context.db, p);
      return typeof v === 'function' ? v.bind(context.db) : v;
    },
  });
  const tables = { groups: s.partyGroups, categories: s.itemCategories, units: s.units };
  const ensure = (firm: number) => repo.get(firm);
  function reference(firm: number, kind: 'groups' | 'categories', id: number | null) {
    if (id === null) return;
    const table = tables[kind];
    if (
      !db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.firmId, firm), isNull(table.deletedAt)))
        .get()
    )
      throw new Error('validation');
  }
  function lookups(firm: number): Lookups {
    ensure(firm);
    return {
      groups: db
        .select()
        .from(s.partyGroups)
        .where(and(eq(s.partyGroups.firmId, firm), isNull(s.partyGroups.deletedAt)))
        .all()
        .map((r) => ({
          ...r,
          count: Number(
            context.sqlite
              .prepare(
                'SELECT COUNT(*) n FROM parties WHERE firm_id=? AND group_id=? AND deleted_at IS NULL',
              )
              .get(firm, r.id)?.n ?? 0,
          ),
        })),
      categories: db
        .select()
        .from(s.itemCategories)
        .where(and(eq(s.itemCategories.firmId, firm), isNull(s.itemCategories.deletedAt)))
        .all()
        .map((r) => ({
          ...r,
          count: Number(
            context.sqlite
              .prepare(
                'SELECT COUNT(*) n FROM items WHERE firm_id=? AND category_id=? AND deleted_at IS NULL',
              )
              .get(firm, r.id)?.n ?? 0,
          ),
        })),
      units: db.select().from(s.units).all(),
      conversions: db
        .select()
        .from(s.unitConversions)
        .where(eq(s.unitConversions.firmId, firm))
        .all(),
      taxes: db.select().from(s.taxRates).all(),
    };
  }
  function saveLookup(
    firm: number,
    kind: LookupKind,
    id: number | null,
    name: string,
    symbol?: string,
  ) {
    return context.sqlite.transaction(() => {
      ensure(firm);
      name = z.string().trim().min(1).max(100).parse(name);
      let row;
      if (kind === 'units') {
        const before =
          id === null ? null : db.select().from(s.units).where(eq(s.units.id, id)).get();
        if (id !== null && (!before || before.standard)) throw new Error('validation');
        const values = {
          name,
          symbol: z.string().trim().min(1).max(20).parse(symbol),
          standard: false,
        };
        row =
          id === null
            ? db.insert(s.units).values(values).returning().get()
            : db.update(s.units).set(values).where(eq(s.units.id, id)).returning().get();
        repo.audit(firm, kind, row.id, before ? 'update' : 'create', before, row);
      } else {
        const table = tables[kind];
        reference(firm, kind, id);
        const before = id === null ? null : db.select().from(table).where(eq(table.id, id)).get();
        if (
          db
            .select()
            .from(table)
            .where(
              and(
                eq(table.firmId, firm),
                eq(table.name, name),
                isNull(table.deletedAt),
                ...(id ? [ne(table.id, id)] : []),
              ),
            )
            .get()
        )
          throw new Error('validation');
        row =
          id === null
            ? db.insert(table).values({ firmId: firm, name }).returning().get()
            : db.update(table).set({ name }).where(eq(table.id, id)).returning().get();
        repo.audit(firm, kind, row.id, before ? 'update' : 'create', before, row);
      }
      return { id: row.id, name: row.name, count: 0 };
    })();
  }
  function deleteLookup(firm: number, kind: LookupKind, id: number) {
    context.sqlite.transaction(() => {
      ensure(firm);
      if (kind === 'units') {
        const before = db.select().from(s.units).where(eq(s.units.id, id)).get();
        if (
          !before ||
          before.standard ||
          db
            .select()
            .from(s.items)
            .all()
            .some((i) => i.unitId === id || i.secondaryUnitId === id) ||
          db
            .select()
            .from(s.unitConversions)
            .all()
            .some((c) => c.fromUnit === id || c.toUnit === id) ||
          db
            .select()
            .from(s.txnLines)
            .all()
            .some((l) => l.unitId === id)
        )
          throw new Error('validation');
        db.delete(s.units).where(eq(s.units.id, id)).run();
        repo.audit(firm, kind, id, 'delete', before, null);
      } else {
        reference(firm, kind, id);
        const table = tables[kind];
        const before = db.select().from(table).where(eq(table.id, id)).get();
        const used =
          kind === 'groups'
            ? db
                .select()
                .from(s.parties)
                .all()
                .some((p) => p.groupId === id)
            : db
                .select()
                .from(s.items)
                .all()
                .some((i) => i.categoryId === id);
        if (used) throw new Error('validation');
        db.update(table).set({ deletedAt: new Date().toISOString() }).where(eq(table.id, id)).run();
        repo.audit(firm, kind, id, 'delete', before, null);
      }
    })();
  }
  function saveConversion(
    firm: number,
    id: number | null,
    fromUnit: number,
    toUnit: number,
    factor: number,
  ) {
    context.sqlite.transaction(() => {
      ensure(firm);
      z.number().finite().positive().max(1e6).parse(factor);
      const units = lookups(firm).units;
      if (
        fromUnit === toUnit ||
        !units.some((u) => u.id === fromUnit) ||
        !units.some((u) => u.id === toUnit)
      )
        throw new Error('validation');
      const before =
        id === null
          ? null
          : db
              .select()
              .from(s.unitConversions)
              .where(and(eq(s.unitConversions.id, id), eq(s.unitConversions.firmId, firm)))
              .get();
      if (id !== null && !before) throw new Error('notFound');
      const row =
        id === null
          ? db
              .insert(s.unitConversions)
              .values({ firmId: firm, fromUnit, toUnit, factor })
              .returning()
              .get()
          : db
              .update(s.unitConversions)
              .set({ fromUnit, toUnit, factor })
              .where(eq(s.unitConversions.id, id))
              .returning()
              .get();
      repo.audit(firm, 'unit_conversions', row.id, before ? 'update' : 'create', before, row);
    })();
  }
  const deleteConversion = (firm: number, id: number) =>
    context.sqlite.transaction(() => {
      ensure(firm);
      const before = db
        .select()
        .from(s.unitConversions)
        .where(and(eq(s.unitConversions.firmId, firm), eq(s.unitConversions.id, id)))
        .get();
      if (!before) throw new Error('notFound');
      db.delete(s.unitConversions).where(eq(s.unitConversions.id, id)).run();
      repo.audit(firm, 'unit_conversions', id, 'delete', before, null);
    })();
  return { reference, lookups, saveLookup, deleteLookup, saveConversion, deleteConversion };
}
