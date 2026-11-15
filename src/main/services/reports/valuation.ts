import { divideRound, safeNumber } from '../../../shared/money';
import { num, query, str, type ReportCtx } from './engine';

/** Read-only moving weighted average. Quantities use thousandths; all values stay in paise.
 * Backdated documents are replayed in date/id order. Linked returns restore the original sale cost.
 * Negative stock uses the item's purchase price until stock is available again.
 */
export function valuation(ctx: ReportCtx, asOn: string) {
  const rows = query(
    ctx,
    `SELECT sl.*, t.type, t.ref_txn_id, i.purchase_price
    FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
    LEFT JOIN txns t ON t.id = sl.txn_id
    WHERE sl.firm_id = ? AND sl.deleted_at IS NULL AND sl.date <= ?
      AND (sl.txn_id IS NULL OR (t.status = 'posted' AND t.deleted_at IS NULL))
    ORDER BY sl.date, COALESCE(sl.txn_id, 0), sl.id`,
    ctx.firm,
    asOn,
  );
  const items = new Map<number, { qty: bigint; value: number }>();
  const costs: { txnId: number; itemId: number; date: string; cost: number }[] = [];
  const original = new Map<string, { qty: bigint; cost: number }>();
  for (const r of rows) {
    const itemId = num(r.item_id),
      txnId = num(r.txn_id),
      type = str(r.type);
    const state = items.get(itemId) ?? { qty: 0n, value: 0 };
    // Ledger quantities have at most 3 decimals, so this is exact (and far cheaper than parsing).
    const qty = BigInt(Math.round(num(r.qty) * 1000));
    const average = (q: bigint) =>
      state.qty > 0n
        ? safeNumber(divideRound(BigInt(state.value) * q, state.qty))
        : safeNumber(divideRound(BigInt(num(r.purchase_price)) * q, 1000n));
    let value = num(r.value);
    if (type === 'sale') {
      value = -average(-qty);
      const key = `${txnId}/${itemId}`,
        prev = original.get(key) ?? { qty: 0n, cost: 0 };
      original.set(key, { qty: prev.qty - qty, cost: prev.cost - value });
    } else if (type === 'sale_return') {
      const source = original.get(`${num(r.ref_txn_id)}/${itemId}`);
      value = source?.qty
        ? safeNumber(divideRound(BigInt(source.cost) * qty, source.qty))
        : average(qty);
    } else if (qty < 0n) value = -average(-qty);
    state.qty += qty;
    state.value += value;
    if (state.qty === 0n) state.value = 0;
    items.set(itemId, state);
    if (type === 'sale' || type === 'sale_return')
      costs.push({ txnId, itemId, date: str(r.date), cost: -value });
  }
  return { items, costs };
}
