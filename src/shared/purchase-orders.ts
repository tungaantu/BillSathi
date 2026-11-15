import { decimalScaled } from './money';
import type { SaleDocument, SaleLine } from './sales';
export function remainingOrderLines(source: SaleDocument, bills: SaleDocument[]): SaleLine[] {
  const key = (l: SaleLine) => `${l.itemId}/${l.unitId}/${l.name}`;
  const used = new Map<string, bigint>();
  bills
    .flatMap((b) => b.lines)
    .forEach((l) => used.set(key(l), (used.get(key(l)) ?? 0n) + decimalScaled(l.qty, 3)));
  return source.lines.map((l) => {
    const k = key(l),
      quantity = decimalScaled(l.qty, 3),
      consumed = used.get(k) ?? 0n,
      received = consumed < quantity ? consumed : quantity;
    used.set(k, consumed - received);
    return { ...l, qty: Number(quantity - received) / 1000, freeQty: 0 };
  });
}
export function receiveOrder(source: SaleDocument, bills: SaleDocument[], quantities?: number[]) {
  const remaining = remainingOrderLines(source, bills);
  if (quantities && quantities.length !== remaining.length) throw new Error('validation');
  const lines = remaining
    .map((l, i) => {
      const qty = quantities?.[i] ?? l.qty;
      if (!Number.isFinite(qty) || qty < 0 || decimalScaled(qty, 3) > decimalScaled(l.qty, 3))
        throw new Error('overpayment');
      return { ...l, qty };
    })
    .filter((l) => l.qty > 0);
  if (!lines.length) throw new Error('validation');
  return lines;
}
