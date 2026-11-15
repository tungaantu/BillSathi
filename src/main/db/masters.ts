import { z } from 'zod';
import { lookupRepository } from './master-lookups';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { itemPatchSchema } from '../../shared/masters';
import { yearLock } from './fy-lock';
import { repositories } from './repositories';
import {
  adjustmentSchema,
  baseQuantity,
  itemSchema,
  partyLedger,
  partySchema,
  stockAmount,
  today,
  type Adjustment,
  type Item,
  type ItemInput,
  type Party,
  type PartyInput,
} from '../../shared/masters';
export function masterRepository(context: DatabaseContext) {
  const repo = repositories(context);
  const db = new Proxy(context.db, {
    get(_t, p) {
      const v = Reflect.get(context.db, p);
      return typeof v === 'function' ? v.bind(context.db) : v;
    },
  });
  const { reference, lookups, saveLookup, deleteLookup, saveConversion, deleteConversion } =
    lookupRepository(context);
  const ensure = (firm: number) => repo.get(firm);
  const parties = (firm: number): Party[] => {
    ensure(firm);
    const balances = context.sqlite
      .prepare('SELECT id,balance FROM party_balances WHERE firm_id=?')
      .all(firm);
    const balanceOf = new Map(balances.map((b) => [Number(b.id), b.balance]));
    return db
      .select()
      .from(s.parties)
      .where(and(eq(s.parties.firmId, firm), isNull(s.parties.deletedAt)))
      .all()
      .map((r) => ({
        ...r,
        phone: r.phone ?? '',
        email: r.email ?? '',
        gstType: r.gstType as Party['gstType'],
        gstin: r.gstin ?? '',
        stateCode: r.stateCode ?? '',
        billingAddress: r.billingAddress ?? '',
        shippingAddress: r.shippingAddress ?? '',
        openingDate: r.openingDate ?? today(),
        active: Boolean(r.active),
        customFields: JSON.parse(r.customFields ?? '{}'),
        balance: Number(balanceOf.get(r.id) ?? 0),
      }));
  };
  const items = (firm: number): Item[] => {
    ensure(firm);
    // One query each for stock and opening rows, looked up by item id (no per-item queries).
    const stock = new Map(
      context.sqlite
        .prepare(
          'SELECT item_id,SUM(qty) qty,SUM(value) value FROM stock_balances WHERE firm_id=? GROUP BY item_id',
        )
        .all(firm)
        .map((b) => [Number(b.item_id), b]),
    );
    const openings = new Map<number, typeof s.stockLedger.$inferSelect>();
    for (const o of db
      .select()
      .from(s.stockLedger)
      .where(
        and(
          eq(s.stockLedger.firmId, firm),
          eq(s.stockLedger.reason, 'opening'),
          isNull(s.stockLedger.deletedAt),
        ),
      )
      .all())
      if (!openings.has(o.itemId)) openings.set(o.itemId, o);
    return db
      .select()
      .from(s.items)
      .where(and(eq(s.items.firmId, firm), isNull(s.items.deletedAt)))
      .all()
      .map((r) => {
        const meta = JSON.parse(r.customFields ?? '{}');
        const opening = openings.get(r.id);
        const b = stock.get(r.id);
        return {
          ...r,
          type: r.type as Item['type'],
          code: r.code ?? '',
          hsn: r.hsn ?? '',
          conversion: meta.conversion ?? 1,
          purchaseInclusive: meta.purchaseInclusive ?? false,
          serviceReminderDays: meta.serviceReminderDays ?? 0,
          trackBatches: Boolean(meta.trackBatches),
          trackSerials: Boolean(meta.trackSerials),
          discountType: meta.discountType ?? 'percent',
          discountAmount: meta.discountAmount ?? 0,
          customFields: meta.values ?? {},
          inclusive: Boolean(r.inclusive),
          discountBps: r.discountBps ?? 0,
          wholesaleQty: r.wholesaleQty ?? 0,
          minStock: r.minStock ?? 0,
          location: r.location ?? '',
          openingQty: opening?.qty ?? 0,
          openingPrice: meta.openingPrice ?? r.purchasePrice,
          openingDate: opening?.date ?? today(),
          qty: Number(b?.qty ?? 0),
          value: Number(b?.value ?? 0),
        };
      });
  };
  function own(firm: number, kind: 'parties' | 'items', id: number) {
    ensure(firm);
    const row =
      kind === 'parties'
        ? db
            .select()
            .from(s.parties)
            .where(and(eq(s.parties.id, id), eq(s.parties.firmId, firm)))
            .get()
        : db
            .select()
            .from(s.items)
            .where(and(eq(s.items.id, id), eq(s.items.firmId, firm)))
            .get();
    if (!row) throw new Error('notFound');
    return row;
  }
  function savePartyRaw(firm: number, id: number | null, input: PartyInput) {
    ensure(firm);
    const data = partySchema.parse(input);
    reference(firm, 'groups', data.groupId);
    const before = id === null ? null : own(firm, 'parties', id);
    if (before?.deletedAt) throw new Error('notFound');
    const values = { ...data, customFields: JSON.stringify(data.customFields) };
    const row =
      id === null
        ? db
            .insert(s.parties)
            .values({ ...values, firmId: firm })
            .returning()
            .get()
        : db.update(s.parties).set(values).where(eq(s.parties.id, id)).returning().get();
    repo.audit(firm, 'parties', row.id, before ? 'update' : 'create', before, row);
    return row.id;
  }
  function saveItemRaw(firm: number, id: number | null, input: ItemInput) {
    ensure(firm);
    const data = itemSchema.parse(input);
    reference(firm, 'categories', data.categoryId);
    for (const unit of [data.unitId, data.secondaryUnitId])
      if (unit !== null && !db.select().from(s.units).where(eq(s.units.id, unit)).get())
        throw new Error('validation');
    if (
      data.taxRateId !== null &&
      !db.select().from(s.taxRates).where(eq(s.taxRates.id, data.taxRateId)).get()
    )
      throw new Error('validation');
    if (
      data.code &&
      db
        .select()
        .from(s.items)
        .where(
          and(
            eq(s.items.firmId, firm),
            eq(s.items.code, data.code),
            ...(id === null ? [] : [ne(s.items.id, id)]),
          ),
        )
        .get()
    )
      throw new Error('validation');
    const before = id === null ? null : own(firm, 'items', id);
    if (before?.deletedAt) throw new Error('notFound');
    if (
      before &&
      'type' in before &&
      before.type !== data.type &&
      db
        .select()
        .from(s.stockLedger)
        .where(eq(s.stockLedger.itemId, id!))
        .all()
        .some((r) => r.reason !== 'opening' && !r.deletedAt)
    )
      throw new Error('validation');
    const {
      openingQty,
      openingDate,
      openingPrice,
      conversion,
      purchaseInclusive,
      serviceReminderDays,
      trackBatches,
      trackSerials,
      discountAmount,
      discountType,
      customFields,
      ...base
    } = data;
    const values = {
      ...base,
      code: data.code || null,
      customFields: JSON.stringify({
        values: customFields,
        conversion,
        purchaseInclusive,
        serviceReminderDays,
        trackBatches,
        trackSerials,
        discountAmount,
        discountType,
        openingPrice,
      }),
    };
    const row =
      id === null
        ? db
            .insert(s.items)
            .values({ ...values, firmId: firm })
            .returning()
            .get()
        : db.update(s.items).set(values).where(eq(s.items.id, id)).returning().get();
    const previous = db
      .select()
      .from(s.stockLedger)
      .where(
        and(
          eq(s.stockLedger.itemId, row.id),
          eq(s.stockLedger.reason, 'opening'),
          isNull(s.stockLedger.deletedAt),
        ),
      )
      .get();
    if (
      !previous ||
      previous.qty !== openingQty ||
      previous.date !== openingDate ||
      previous.value !== stockAmount(openingQty, openingPrice)
    ) {
      if (previous) {
        db.update(s.stockLedger)
          .set({ deletedAt: new Date().toISOString() })
          .where(eq(s.stockLedger.id, previous.id))
          .run();
        repo.audit(firm, 'stock_ledger', previous.id, 'delete', previous, null);
      }
      if (data.type === 'product' && openingQty) {
        const movement = db
          .insert(s.stockLedger)
          .values({
            firmId: firm,
            itemId: row.id,
            date: openingDate,
            qty: openingQty,
            value: stockAmount(openingQty, openingPrice),
            reason: 'opening',
          })
          .returning()
          .get();
        repo.audit(firm, 'stock_ledger', movement.id, 'create', null, movement);
      }
    }
    repo.audit(firm, 'items', row.id, before ? 'update' : 'create', before, row);
    return row.id;
  }
  function remove(firm: number, kind: 'parties' | 'items', id: number, restore = false) {
    context.sqlite.transaction(() => {
      const before = own(firm, kind, id),
        table = kind === 'parties' ? s.parties : s.items;
      db.update(table)
        .set({ deletedAt: restore ? null : new Date().toISOString() })
        .where(eq(table.id, id))
        .run();
      repo.audit(firm, kind, id, restore ? 'restore' : 'delete', before, own(firm, kind, id));
    })();
  }
  function ledger(firm: number, id: number, from: string, to: string) {
    const p = parties(firm).find((p) => p.id === id);
    if (!p) throw new Error('notFound');
    const rows = context.sqlite
      .prepare(
        `SELECT t.id,t.date,t.type,t.prefix||t.number number,t.total,
      CASE t.type WHEN 'other_income' THEN t.total WHEN 'expense' THEN -t.total WHEN 'sale' THEN t.total WHEN 'purchase_return' THEN t.total WHEN 'payment_out' THEN t.total WHEN 'purchase' THEN -t.total WHEN 'sale_return' THEN -t.total WHEN 'payment_in' THEN -t.total ELSE 0 END
      - COALESCE((SELECT SUM(CASE t.type WHEN 'other_income' THEN pay.amount WHEN 'expense' THEN -pay.amount WHEN 'sale' THEN pay.amount WHEN 'purchase_return' THEN pay.amount WHEN 'purchase' THEN -pay.amount WHEN 'sale_return' THEN -pay.amount ELSE 0 END) FROM txn_payments pay WHERE pay.txn_id=t.id AND pay.reversed=0),0) AS change
      FROM txns t WHERE t.firm_id=? AND t.party_id=? AND t.status='posted' AND t.deleted_at IS NULL ORDER BY t.date,t.id`,
      )
      .all(firm, id) as unknown as Parameters<typeof partyLedger>[2];
    return partyLedger(p.openingBalance, p.openingDate, rows, from, to || undefined);
  }
  function movements(firm: number, id: number) {
    own(firm, 'items', id);
    return db
      .select()
      .from(s.stockLedger)
      .where(
        and(
          eq(s.stockLedger.firmId, firm),
          eq(s.stockLedger.itemId, id),
          isNull(s.stockLedger.deletedAt),
        ),
      )
      .all()
      .filter(
        (r) =>
          !r.txnId ||
          db
            .select()
            .from(s.txns)
            .where(
              and(eq(s.txns.id, r.txnId), eq(s.txns.status, 'posted'), isNull(s.txns.deletedAt)),
            )
            .get(),
      );
  }
  function adjust(firm: number, id: number, input: Adjustment) {
    context.sqlite.transaction(() => {
      const a = adjustmentSchema.parse(input),
        item = items(firm).find((i) => i.id === id);
      yearLock(context)(firm, a.date);
      if (!item || item.type === 'service' || !repo.getSettings(firm).stock)
        throw new Error('validation');
      if (a.unitId !== item.unitId && a.unitId !== item.secondaryUnitId)
        throw new Error('validation');
      const qty = baseQuantity(
        a.qty,
        a.unitId && a.unitId === item.secondaryUnitId ? item.conversion : 1,
      );
      if (a.direction === 'reduce' && repo.getSettings(firm).negativeStock && qty > item.qty)
        throw new Error('validation');
      const sign = a.direction === 'add' ? 1 : -1;
      const row = db
        .insert(s.stockLedger)
        .values({
          firmId: firm,
          itemId: id,
          qty: qty * sign,
          value: stockAmount(a.qty, a.price) * sign,
          date: a.date,
          reason: `adjust:${a.reason}`,
        })
        .returning()
        .get();
      repo.audit(firm, 'stock_ledger', row.id, 'create', null, row);
    })();
  }
  const code = (firm: number) => {
    ensure(firm);
    let n = 1;
    const codes = db
      .select()
      .from(s.items)
      .where(eq(s.items.firmId, firm))
      .all()
      .map((i) => i.code);
    while (codes.includes(`BS-${String(n).padStart(5, '0')}`)) n++;
    return `BS-${String(n).padStart(5, '0')}`;
  };
  return {
    parties,
    items,
    remove,
    ledger,
    movements,
    adjust,
    lookups,
    saveLookup,
    deleteLookup,
    saveConversion,
    deleteConversion,
    code,
    savePartyRaw,
    saveItemRaw,
    saveParty: (firm: number, id: number | null, input: PartyInput) => {
      const key = context.sqlite.transaction(() => savePartyRaw(firm, id, input))();
      return parties(firm).find((p) => p.id === key)!;
    },
    saveItem: (firm: number, id: number | null, input: ItemInput) => {
      const key = context.sqlite.transaction(() => saveItemRaw(firm, id, input))();
      return items(firm).find((p) => p.id === key)!;
    },
    /** Bulk update: every changed item goes through the normal item checks, all in one save. */
    bulkUpdate: (firm: number, input: unknown) => {
      const patches = z.array(itemPatchSchema).max(5000).parse(input);
      return context.sqlite.transaction(() => {
        const current = new Map(items(firm).map((i) => [i.id, i]));
        for (const { id, ...patch } of patches) {
          const item = current.get(id);
          if (!item) throw new Error('notFound');
          saveItemRaw(firm, id, { ...item, ...patch });
        }
        return patches.length;
      })();
    },
  };
}
