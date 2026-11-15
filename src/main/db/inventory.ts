import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { repositories } from './repositories';
import { yearLock } from './fy-lock';
import {
  allocateFefo,
  batchInputSchema,
  duplicateSerials,
  posSummary,
  type PosPart,
  expiryStatus,
  serialCountMatches,
  splitValue,
  transferMovements,
  transferSchema,
  type BatchStock,
  type TransferInput,
} from '../../shared/inventory';
import type { Item } from '../../shared/masters';
import { stockAmount, today } from '../../shared/masters';
import type { SaleLine } from '../../shared/sales';
import type {
  ExpiryRow,
  Godown,
  GodownStock,
  SerialHistory,
  StockTransfer,
} from '../../shared/inventory-api';

/** A ledger row only counts when its document is live (same rule as the stock_balances view). */
const LIVE = `(t.id IS NULL OR (t.deleted_at IS NULL AND (t.status='posted' OR (t.type IN ('delivery_challan','challan_return') AND t.status IN ('open','closed')))))`;
export const MAIN_GODOWN = 'Main store';

export function inventoryRepository(context: DatabaseContext) {
  const { sqlite } = context;
  // A rollback can replace the sql.js connection; always resolve the current DB.
  const db = new Proxy(context.db, {
    get(_t, p) {
      const v = Reflect.get(context.db, p);
      return typeof v === 'function' ? v.bind(context.db) : v;
    },
  });
  const repo = repositories(context);
  type Param = string | number | null;
  const rows = <T>(sql: string, ...params: Param[]) => sqlite.prepare(sql).all(...params) as T[];

  // ---------- Godowns ----------
  function mainGodown(firm: number): number {
    const found = db
      .select()
      .from(s.godowns)
      .where(and(eq(s.godowns.firmId, firm), isNull(s.godowns.deletedAt)))
      .orderBy(s.godowns.id)
      .get();
    if (found) return found.id;
    const row = db
      .insert(s.godowns)
      .values({ firmId: firm, name: MAIN_GODOWN, address: '' })
      .returning()
      .get();
    repo.audit(firm, 'godowns', row.id, 'create', null, row);
    return row.id;
  }
  function godownStock(firm: number, godownId?: number | null): GodownStock[] {
    const main = mainGodown(firm);
    return rows<GodownStock>(
      `SELECT b.item_id itemId, i.name item, COALESCE(b.godown_id, ?) godownId, SUM(b.qty) qty
       FROM stock_balances b JOIN items i ON i.id=b.item_id
       WHERE b.firm_id=? GROUP BY b.item_id, COALESCE(b.godown_id, ?)
       HAVING (? IS NULL OR COALESCE(b.godown_id, ?)=?) ORDER BY i.name`,
      main,
      firm,
      main,
      godownId ?? null,
      main,
      godownId ?? null,
    ).map((r) => ({ ...r, qty: Math.round(r.qty * 1000) / 1000 }));
  }
  function godowns(firm: number): Godown[] {
    const main = mainGodown(firm);
    const stock = godownStock(firm);
    return db
      .select()
      .from(s.godowns)
      .where(and(eq(s.godowns.firmId, firm), isNull(s.godowns.deletedAt)))
      .orderBy(s.godowns.id)
      .all()
      .map((g) => {
        const here = stock.filter((r) => r.godownId === g.id && r.qty !== 0);
        return {
          id: g.id,
          name: g.name,
          address: g.address ?? '',
          main: g.id === main,
          items: here.length,
          qty: Math.round(here.reduce((n, r) => n + r.qty, 0) * 1000) / 1000,
        };
      });
  }
  function ownGodown(firm: number, id: number) {
    const row = db
      .select()
      .from(s.godowns)
      .where(and(eq(s.godowns.id, id), eq(s.godowns.firmId, firm), isNull(s.godowns.deletedAt)))
      .get();
    if (!row) throw new Error('notFound');
    return row;
  }
  function saveGodown(firm: number, id: number | null, input: { name: string; address: string }) {
    const name = String(input.name ?? '').trim(),
      address = String(input.address ?? '').trim();
    if (!name || name.length > 80 || address.length > 500) throw new Error('validation');
    return sqlite.transaction(() => {
      mainGodown(firm);
      const clash = godowns(firm).find(
        (g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== id,
      );
      if (clash) throw new Error('duplicate');
      if (id === null) {
        const row = db.insert(s.godowns).values({ firmId: firm, name, address }).returning().get();
        repo.audit(firm, 'godowns', row.id, 'create', null, row);
        return row.id;
      }
      const before = ownGodown(firm, id);
      const row = db
        .update(s.godowns)
        .set({ name, address })
        .where(eq(s.godowns.id, id))
        .returning()
        .get();
      repo.audit(firm, 'godowns', id, 'update', before, row);
      return id;
    })();
  }
  function deleteGodown(firm: number, id: number) {
    sqlite.transaction(() => {
      const before = ownGodown(firm, id);
      if (id === mainGodown(firm)) throw new Error('validation');
      if (godownStock(firm, id).some((r) => r.qty !== 0)) throw new Error('linked');
      if (
        db
          .select()
          .from(s.txns)
          .where(and(eq(s.txns.godownId, id), isNull(s.txns.deletedAt)))
          .get()
      )
        throw new Error('linked');
      db.update(s.godowns)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(s.godowns.id, id))
        .run();
      repo.audit(firm, 'godowns', id, 'delete', before, null);
    })();
  }

  // ---------- Batches ----------
  /** Batches of an item with their live stock (optionally in one godown; null godown = main). */
  function batchStock(firm: number, itemId: number, godownId?: number | null): BatchStock[] {
    const main = mainGodown(firm);
    return rows<BatchStock>(
      `SELECT b.id, b.number, b.exp_date expDate, b.mfg_date mfgDate, b.mrp,
         COALESCE((SELECT SUM(x.qty) FROM batch_balances x WHERE x.batch_id=b.id
           AND (? IS NULL OR COALESCE(x.godown_id, ?)=?)), 0) qty
       FROM batches b WHERE b.firm_id=? AND b.item_id=? AND b.deleted_at IS NULL
       ORDER BY COALESCE(b.exp_date,'9999-12-31'), b.number`,
      godownId ?? null,
      main,
      godownId ?? null,
      firm,
      itemId,
    ).map((b) => ({ ...b, qty: Math.round(b.qty * 1000) / 1000 }));
  }
  function upsertBatch(firm: number, itemId: number, input: unknown) {
    const b = batchInputSchema.parse(input);
    const found = db
      .select()
      .from(s.batches)
      .where(
        and(
          eq(s.batches.firmId, firm),
          eq(s.batches.itemId, itemId),
          eq(s.batches.number, b.number),
        ),
      )
      .get();
    const values = {
      expDate: b.expDate || null,
      mfgDate: b.mfgDate || null,
      mrp: b.mrp,
      deletedAt: null,
    };
    if (found) {
      db.update(s.batches).set(values).where(eq(s.batches.id, found.id)).run();
      return found.id;
    }
    return db
      .insert(s.batches)
      .values({ firmId: firm, itemId, number: b.number, ...values })
      .returning()
      .get().id;
  }
  function expiry(firm: number, on = today()): ExpiryRow[] {
    return rows<Omit<ExpiryRow, 'status'>>(
      `SELECT b.id batchId, b.item_id itemId, i.name item, b.number, b.exp_date expDate,
         b.mfg_date mfgDate, b.mrp, SUM(x.qty) qty
       FROM batches b JOIN items i ON i.id=b.item_id AND i.deleted_at IS NULL
       JOIN batch_balances x ON x.batch_id=b.id
       WHERE b.firm_id=? AND b.deleted_at IS NULL
       GROUP BY b.id HAVING SUM(x.qty) > 0
       ORDER BY COALESCE(b.exp_date,'9999-12-31'), i.name`,
      firm,
    ).map((r) => ({ ...r, status: expiryStatus(r.expDate, on) }));
  }

  // ---------- Serials ----------
  const serialSum = `COALESCE((SELECT SUM(e.direction) FROM serial_events e LEFT JOIN txns t ON t.id=e.txn_id
      WHERE e.serial_id=r.id AND e.deleted_at IS NULL AND ${LIVE}),0)`;
  function serials(firm: number, itemId: number, inStock = true) {
    return rows<{ id: number; serial: string; inStock: number }>(
      `SELECT r.id, r.serial, ${serialSum} inStock FROM serials r
       WHERE r.firm_id=? AND r.item_id=? AND r.deleted_at IS NULL ORDER BY r.serial`,
      firm,
      itemId,
    )
      .filter((r) => !inStock || r.inStock > 0)
      .map((r) => ({ id: r.id, serial: r.serial, inStock: r.inStock > 0 }));
  }
  function findSerial(firm: number, serial: string) {
    return sqlite
      .prepare(
        `SELECT r.id, r.item_id itemId, r.serial, ${serialSum} inStock FROM serials r
         WHERE r.firm_id=? AND r.serial=? COLLATE NOCASE AND r.deleted_at IS NULL`,
      )
      .get(firm, serial) as
      { id: number; itemId: number; serial: string; inStock: number } | undefined;
  }
  function serialHistory(firm: number, query: string): SerialHistory[] {
    const q = query.trim();
    if (!q) return [];
    return rows<{ id: number; serial: string; item: string; inStock: number }>(
      `SELECT r.id, r.serial, i.name item, ${serialSum} inStock FROM serials r JOIN items i ON i.id=r.item_id
       WHERE r.firm_id=? AND r.deleted_at IS NULL AND r.serial LIKE ? ESCAPE '\\' ORDER BY r.serial LIMIT 50`,
      firm,
      `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`,
    ).map((r) => ({
      serial: r.serial,
      item: r.item,
      inStock: r.inStock > 0,
      events: rows<SerialHistory['events'][number]>(
        `SELECT e.txn_id txnId, t.type, t.prefix, t.number, e.date, e.direction,
           COALESCE(p.name,'') party
         FROM serial_events e JOIN txns t ON t.id=e.txn_id LEFT JOIN parties p ON p.id=t.party_id
         WHERE e.serial_id=? AND e.deleted_at IS NULL AND ${LIVE} ORDER BY e.date, e.id`,
        r.id,
      ),
    }));
  }

  // ---------- Posting a document line ----------
  /** Soft-deletes the serial moves of a document before it is re-posted (stock rows are handled by sales). */
  function clearTxn(txnId: number, at: string) {
    db.update(s.serialEvents)
      .set({ deletedAt: at })
      .where(and(eq(s.serialEvents.txnId, txnId), isNull(s.serialEvents.deletedAt)))
      .run();
  }
  /** Batches the referenced document used for this item (returns go back to the same batches). */
  function referencedBatches(refTxnId: number | null, itemId: number) {
    if (!refTxnId) return [];
    return db
      .select()
      .from(s.stockLedger)
      .where(
        and(
          eq(s.stockLedger.txnId, refTxnId),
          eq(s.stockLedger.itemId, itemId),
          isNull(s.stockLedger.deletedAt),
        ),
      )
      .all()
      .filter((r) => r.batchId)
      .map((r) => ({ batchId: r.batchId!, qty: Math.abs(r.qty) }));
  }
  function post(
    firm: number,
    input: {
      txnId: number;
      lineId: number;
      date: string;
      reason: string;
      godownId: number | null;
      refTxnId: number | null;
      line: SaleLine;
      item: Item;
      qty: number;
      value: number;
    },
  ) {
    const { item, line, qty, value } = input;
    const settings = repo.getSettings(firm);
    let parts: { batchId: number | null; qty: number }[] = [{ batchId: null, qty }];
    if (settings.batches && item.trackBatches) {
      if (qty > 0) {
        if (line.batch?.number) parts = [{ batchId: upsertBatch(firm, item.id, line.batch), qty }];
        else if (line.batchId) parts = [{ batchId: line.batchId, qty }];
        else {
          // A return with no batch chosen goes back into the batches the original bill used.
          const back = allocateFefo(
            referencedBatches(input.refTxnId, item.id).map((r, i) => ({
              id: r.batchId,
              number: String(i).padStart(6, '0'),
              expDate: null,
              qty: r.qty,
            })),
            qty,
            input.date,
            true,
          );
          parts = [
            ...back.allocations,
            ...(back.remainder ? [{ batchId: null, qty: back.remainder }] : []),
          ];
        }
      } else {
        const stock = batchStock(firm, item.id, input.godownId);
        const preferred = [
          ...(line.batchId ? [line.batchId] : []),
          ...referencedBatches(input.refTxnId, item.id).map((r) => r.batchId),
        ];
        // Chosen batch first (even if expired — the user saw the warning), then FEFO.
        const first = stock.filter((b) => preferred.includes(b.id));
        const pick = allocateFefo(first, -qty, input.date, true);
        const rest = allocateFefo(
          stock.filter((b) => !preferred.includes(b.id)),
          pick.remainder,
          input.date,
        );
        parts = [
          ...pick.allocations,
          ...rest.allocations,
          ...(rest.remainder ? [{ batchId: null, qty: rest.remainder }] : []),
        ].map((p) => ({ batchId: p.batchId, qty: -p.qty }));
      }
    }
    const values = splitValue(
      value,
      qty,
      parts.map((p) => p.qty),
    );
    parts.forEach((p, i) =>
      db
        .insert(s.stockLedger)
        .values({
          firmId: firm,
          itemId: item.id,
          txnId: input.txnId,
          txnLineId: input.lineId,
          godownId: input.godownId,
          batchId: p.batchId,
          date: input.date,
          qty: p.qty,
          value: values[i],
          reason: input.reason,
        })
        .run(),
    );
    if (settings.serials && item.trackSerials) {
      const list = line.serials ?? [];
      if (!serialCountMatches(Math.abs(qty), list) || duplicateSerials(list).length)
        throw new Error('serials');
      const direction = qty > 0 ? 1 : -1;
      for (const serial of list) {
        const found = findSerial(firm, serial);
        if (found && found.itemId !== item.id) throw new Error('serials');
        if (direction > 0 && found && found.inStock > 0) throw new Error('serials');
        if (direction < 0 && (!found || found.inStock <= 0)) throw new Error('serials');
        const serialId =
          found?.id ??
          db.insert(s.serials).values({ firmId: firm, itemId: item.id, serial }).returning().get()
            .id;
        db.insert(s.serialEvents)
          .values({ firmId: firm, serialId, txnId: input.txnId, direction, date: input.date })
          .run();
      }
    }
  }

  // ---------- Stock transfers ----------
  function transfers(firm: number): StockTransfer[] {
    const names = new Map(
      db
        .select()
        .from(s.godowns)
        .where(eq(s.godowns.firmId, firm))
        .all()
        .map((g) => [g.id, g.name]),
    );
    return db
      .select()
      .from(s.stockTransfers)
      .where(and(eq(s.stockTransfers.firmId, firm), isNull(s.stockTransfers.deletedAt)))
      .orderBy(s.stockTransfers.number)
      .all()
      .reverse()
      .map((t) => ({
        id: t.id,
        number: t.number,
        date: t.date,
        fromId: t.fromGodownId,
        toId: t.toGodownId,
        from: names.get(t.fromGodownId) ?? '',
        to: names.get(t.toGodownId) ?? '',
        note: t.note,
        lines: JSON.parse(t.lines),
      }));
  }
  function saveTransfer(firm: number, raw: TransferInput, items: Item[]) {
    const input = transferSchema.parse(raw);
    return sqlite.transaction(() => {
      yearLock(context)(firm, input.date);
      ownGodown(firm, input.fromId);
      ownGodown(firm, input.toId);
      const settings = repo.getSettings(firm);
      for (const l of input.lines) {
        const item = items.find((i) => i.id === l.itemId);
        if (!item || item.type === 'service') throw new Error('validation');
        if (l.batchId && !batchStock(firm, item.id).some((b) => b.id === l.batchId))
          throw new Error('validation');
      }
      if (settings.negativeStock) {
        const here = godownStock(firm, input.fromId);
        const need = new Map<number, number>();
        for (const l of input.lines) need.set(l.itemId, (need.get(l.itemId) ?? 0) + l.qty);
        for (const [itemId, qty] of need)
          if ((here.find((r) => r.itemId === itemId)?.qty ?? 0) + 1e-9 < qty)
            throw new Error('negativeStock');
        for (const l of input.lines.filter((l) => l.batchId)) {
          const b = batchStock(firm, l.itemId, input.fromId).find((b) => b.id === l.batchId);
          if ((b?.qty ?? 0) + 1e-9 < l.qty) throw new Error('negativeStock');
        }
      }
      const last = sqlite
        .prepare('SELECT MAX(number) n FROM stock_transfers WHERE firm_id=?')
        .get(firm) as { n: number | null };
      const row = db
        .insert(s.stockTransfers)
        .values({
          firmId: firm,
          number: (last.n ?? 0) + 1,
          date: input.date,
          fromGodownId: input.fromId,
          toGodownId: input.toId,
          lines: JSON.stringify(input.lines),
          note: input.note,
          createdAt: new Date().toISOString(),
        })
        .returning()
        .get();
      for (const m of transferMovements(input, (itemId, qty) =>
        stockAmount(qty, items.find((i) => i.id === itemId)!.purchasePrice),
      ))
        db.insert(s.stockLedger)
          .values({
            firmId: firm,
            itemId: m.itemId,
            godownId: m.godownId,
            batchId: m.batchId,
            transferId: row.id,
            date: input.date,
            qty: m.qty,
            value: m.value,
            reason: 'transfer',
          })
          .run();
      repo.audit(firm, 'stock_transfers', row.id, 'create', null, row);
      return row.id;
    })();
  }
  function deleteTransfer(firm: number, id: number) {
    sqlite.transaction(() => {
      const before = db
        .select()
        .from(s.stockTransfers)
        .where(
          and(
            eq(s.stockTransfers.id, id),
            eq(s.stockTransfers.firmId, firm),
            isNull(s.stockTransfers.deletedAt),
          ),
        )
        .get();
      if (!before) throw new Error('notFound');
      yearLock(context)(firm, before.date);
      const at = new Date().toISOString();
      db.update(s.stockTransfers).set({ deletedAt: at }).where(eq(s.stockTransfers.id, id)).run();
      db.update(s.stockLedger)
        .set({ deletedAt: at })
        .where(and(eq(s.stockLedger.transferId, id), isNull(s.stockLedger.deletedAt)))
        .run();
      repo.audit(firm, 'stock_transfers', id, 'delete', before, null);
    })();
  }
  /** Today's counter takings: POS bills (payments tagged 'POS') by payment method. */
  function posDay(firm: number, day = today()) {
    const data = rows<{ id: number; total: number; type: string; amount: number }>(
      `SELECT t.id, t.total, a.type, p.amount FROM txns t
       JOIN txn_payments p ON p.txn_id=t.id AND p.reversed=0 AND p.reference='POS'
       JOIN payment_accounts a ON a.id=p.account_id
       WHERE t.firm_id=? AND t.type='sale' AND t.date=? AND t.status='posted' AND t.deleted_at IS NULL`,
      firm,
      day,
    );
    const bills = new Map<number, { total: number; parts: PosPart[] }>();
    for (const r of data) {
      const bill = bills.get(r.id) ?? { total: r.total, parts: [] };
      const method = (
        ['cash', 'upi', 'card'].includes(r.type) ? r.type : 'card'
      ) as PosPart['method'];
      bill.parts.push({ method, amount: r.amount });
      bills.set(r.id, bill);
    }
    return posSummary([...bills.values()]);
  }
  return {
    posDay,
    mainGodown,
    godowns,
    godownStock,
    saveGodown,
    deleteGodown,
    batchStock,
    expiry,
    serials,
    serialHistory,
    clearTxn,
    post,
    transfers,
    saveTransfer,
    deleteTransfer,
  };
}
