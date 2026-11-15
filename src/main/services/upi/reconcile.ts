/**
 * Matches bank statement credits to Payment-Ins recorded in BillSathi. Pure and deterministic.
 *
 * 1. UTR first: a statement line whose 12-digit reference equals a payment's UTR and whose amount
 *    is equal is a firm match.
 * 2. Otherwise amount + date (within `dayWindow` days). Only a one-to-one pairing counts as
 *    matched; anything that could be two different payments is "possible" for the owner to decide.
 * 3. Everything else stays unmatched. Nothing is changed here; the owner confirms each match.
 */
import type {
  MatchEntry,
  MatchGroups,
  PaymentCandidate,
  PossibleEntry,
  StatementLine,
} from '../../../shared/payments-api';
export type { MatchEntry, MatchGroups, PaymentCandidate, PossibleEntry };

const DAY = 86_400_000;
const dayDistance = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

export function matchStatement(
  lines: StatementLine[],
  candidates: PaymentCandidate[],
  options: { dayWindow?: number } = {},
): MatchGroups {
  const window = options.dayWindow ?? 2;
  const taken = new Set<number>();
  const matched: MatchEntry[] = [];
  const possible: PossibleEntry[] = [];
  const decided = new Set<number>();
  const credits = lines.filter((l) => l.creditPaise > 0);

  // Pass 1: UTR.
  for (const line of credits) {
    if (!line.utrs.length) continue;
    const sameUtr = candidates.filter(
      (c) => c.utr && line.utrs.includes(c.utr) && !taken.has(c.txnId),
    );
    if (!sameUtr.length) continue;
    const exact = sameUtr.filter((c) => c.amountPaise === line.creditPaise);
    if (exact.length === 1) {
      matched.push({ line, candidate: exact[0], reason: 'utr' });
      taken.add(exact[0].txnId);
    } else if (exact.length > 1) possible.push({ line, candidates: exact, reason: 'ambiguous' });
    else possible.push({ line, candidates: sameUtr, reason: 'amountDiffers' });
    decided.add(line.index);
  }

  // Pass 2: amount + date.
  const options2 = new Map<number, PaymentCandidate[]>();
  for (const line of credits) {
    if (decided.has(line.index)) continue;
    options2.set(
      line.index,
      candidates.filter(
        (c) =>
          !taken.has(c.txnId) &&
          c.amountPaise === line.creditPaise &&
          dayDistance(c.date, line.date) <= window &&
          // Two different references can never be the same payment.
          !(c.utr && line.utrs.length && !line.utrs.includes(c.utr)),
      ),
    );
  }
  const wantedBy = new Map<number, number>();
  for (const list of options2.values())
    for (const c of list) wantedBy.set(c.txnId, (wantedBy.get(c.txnId) ?? 0) + 1);
  const unmatched: StatementLine[] = [];
  for (const line of credits) {
    if (decided.has(line.index)) continue;
    const list = options2.get(line.index) ?? [];
    if (!list.length) unmatched.push(line);
    else if (list.length === 1 && wantedBy.get(list[0].txnId) === 1)
      matched.push({ line, candidate: list[0], reason: 'amountDate' });
    else possible.push({ line, candidates: list, reason: 'ambiguous' });
  }
  return { matched, possible, unmatched };
}
