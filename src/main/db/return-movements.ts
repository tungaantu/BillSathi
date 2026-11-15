import { eq, and, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import type { SaleDocument } from '../../shared/sales';
import { decimalScaled, sumPaise } from '../../shared/money';
import { returnStock } from '../../shared/return-stock';
export function returnMovements(
  context: DatabaseContext,
  firm: number,
  id: number | null,
  doc: SaleDocument,
) {
  if (!['sale_return', 'purchase_return', 'challan_return'].includes(doc.type) || !doc.refTxnId)
    return null;
  const all = context.db.select().from(s.txns).where(eq(s.txns.firmId, firm)).all();
  const original = all.find((t) => t.id === doc.refTxnId)!;
  const parent = original.refTxnId
    ? all.find((t) => t.id === original.refTxnId && t.type === 'delivery_challan')
    : undefined;
  const parentPostedStock =
    parent &&
    context.db
      .select()
      .from(s.stockLedger)
      .where(and(eq(s.stockLedger.txnId, parent.id), isNull(s.stockLedger.deletedAt)))
      .all().length > 0;
  const sourceId = parentPostedStock ? parent.id : original.id;
  const sourceDoc = JSON.parse((parentPostedStock ? parent : original).metadata)
    .document as SaleDocument;
  const invoiceIds = all
    .filter((t) => t.type === 'sale' && t.refTxnId === sourceId)
    .map((t) => t.id);
  const siblings = all.filter(
    (t) =>
      t.id !== id &&
      !t.deletedAt &&
      !['draft', 'cancelled'].includes(t.status) &&
      ((t.refTxnId === sourceId && t.type === doc.type) ||
        (parentPostedStock && t.type === 'sale_return' && invoiceIds.includes(t.refTxnId ?? 0)) ||
        (parentPostedStock && t.type === 'challan_return' && t.refTxnId === sourceId)),
  );
  const records = context.db
    .select({
      itemId: s.stockLedger.itemId,
      unitId: s.txnLines.unitId,
      txnId: s.stockLedger.txnId,
      qty: s.stockLedger.qty,
      value: s.stockLedger.value,
    })
    .from(s.stockLedger)
    .innerJoin(s.txnLines, eq(s.txnLines.id, s.stockLedger.txnLineId))
    .where(and(eq(s.stockLedger.firmId, firm), isNull(s.stockLedger.deletedAt)))
    .all();
  const accumulated = new Map<string, { qty: number; value: number }>();
  return doc.lines.map((line) => {
    const same = (r: { itemId: number | null; unitId: number | null }) =>
      r.itemId === line.itemId && r.unitId === line.unitId;
    const sumQty = (rows: { qty: number }[]) =>
      Number(rows.reduce((n, r) => n + decimalScaled(r.qty, 3), 0n)) / 1000;
    const source = records.filter((r) => r.txnId === sourceId && same(r));
    if (!source.length) return { qty: 0, value: 0 };
    const key = `${line.itemId}/${line.unitId}`;
    let previous = accumulated.get(key);
    if (!previous) {
      const prior = records.filter((r) => siblings.some((s) => s.id === r.txnId) && same(r));
      previous = {
        qty: Math.abs(sumQty(prior)),
        value: Math.abs(sumPaise(prior.map((r) => r.value))),
      };
    }
    const sourceLines = sourceDoc.lines.filter(same);
    const documentQty =
      Number(
        sourceLines.reduce((n, l) => n + decimalScaled(l.qty, 3) + decimalScaled(l.freeQty, 3), 0n),
      ) / 1000;
    const requested = Number(decimalScaled(line.qty, 3) + decimalScaled(line.freeQty, 3)) / 1000;
    const movement = returnStock(
      { qty: sumQty(source), value: sumPaise(source.map((r) => r.value)), documentQty },
      previous,
      requested,
    );
    accumulated.set(key, {
      qty: sumQty([previous, movement]),
      value: sumPaise([previous.value, movement.value]),
    });
    return doc.type === 'purchase_return'
      ? { qty: -movement.qty, value: -movement.value }
      : movement;
  });
}
