import { decimalScaled, divideRound, safeNumber } from './money';
/** Reverse the original base-unit movement and its cost, even after master edits.
 * Cumulative allocation assigns any rounding paise to the final partial return. */
export function returnStock(
  source: { qty: number; value: number; documentQty: number },
  previous: { qty: number; value: number },
  documentQty: number,
) {
  const base = decimalScaled(Math.abs(source.qty), 3),
    units = decimalScaled(source.documentQty, 3);
  if (base === 0n || units === 0n) return { qty: 0, value: 0 };
  const requested = decimalScaled(documentQty, 3) * base;
  if (requested % units !== 0n) throw new Error('validation');
  const qty = requested / units,
    cumulative = decimalScaled(previous.qty, 3) + qty;
  if (qty < 0n || cumulative > base) throw new Error('validation');
  const value =
    safeNumber(divideRound(BigInt(Math.abs(source.value)) * cumulative, base)) - previous.value;
  return { qty: Number(qty) / 1000, value };
}
