import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { salesRead } from './sales-read';
import { earnedPoints, redemption } from '../../shared/customer-features';
import { sumPaise } from '../../shared/money';
import { today } from '../../shared/masters';
import { totals, type SaleDocument } from '../../shared/sales';

export function loyaltyBalance(
  context: DatabaseContext,
  firm: number,
  party: number,
  except?: number,
) {
  return sumPaise(
    context.db
      .select()
      .from(s.loyaltyEntries)
      .where(and(eq(s.loyaltyEntries.firmId, firm), eq(s.loyaltyEntries.partyId, party)))
      .all()
      .filter((r) => r.txnId !== except)
      .map((r) => r.points),
  );
}
export function validateLoyalty(
  context: DatabaseContext,
  firm: number,
  id: number | null,
  doc: SaleDocument,
) {
  const read = salesRead(context),
    settings = read.repo.getSettings(firm);
  if (!doc.loyaltyRedeem && !doc.loyaltyDiscount) return;
  if (doc.type !== 'sale' || !settings.loyalty || !doc.partyId) throw new Error('validation');
  const amount = redemption(
    doc.loyaltyRedeem,
    loyaltyBalance(context, firm, doc.partyId, id ?? undefined),
    Number(settings.loyaltyValuePaise),
    totals({ ...doc, loyaltyDiscount: 0 }, read.repo.get(firm).stateCode).taxable,
  );
  if (amount !== doc.loyaltyDiscount) throw new Error('validation');
}
/** Append compensating entries; never overwrite the history of points earned or spent. */
export function reconcileLoyalty(context: DatabaseContext, firm: number) {
  const read = salesRead(context),
    entries = context.db
      .select()
      .from(s.loyaltyEntries)
      .where(eq(s.loyaltyEntries.firmId, firm))
      .all();
  const rows = context.db.select().from(s.txns).where(eq(s.txns.firmId, firm)).all();
  const tracked = rows.filter(
    (r) =>
      r.type === 'sale' &&
      (JSON.parse(r.metadata).loyaltyPlan || entries.some((e) => e.txnId === r.id)),
  );
  if (!tracked.length) return;
  const summaries = read.list(firm);
  for (const row of tracked) {
    const meta = JSON.parse(row.metadata),
      doc: SaleDocument = meta.document;
    if (!doc) continue;
    const plan = meta.loyaltyPlan as { points: number; per: number; basis: string } | undefined;
    const active = row.status === 'posted' && !row.deletedAt;
    const returns = rows.filter(
      (r) =>
        r.refTxnId === row.id && r.type === 'sale_return' && r.status === 'posted' && !r.deletedAt,
    );
    const returned = Math.min(row.total, sumPaise(returns.map((r) => r.total)));
    const net = Math.max(0, row.total - returned);
    const received = summaries.find((r) => r.id === row.id)?.received ?? 0;
    const desiredEarn =
      active && plan
        ? earnedPoints(
            plan.basis === 'paid' ? Math.min(net, Math.max(0, received - returned)) : net,
            plan.points,
            plan.per,
          )
        : 0;
    // Refund redeemed points proportionally; the final return receives the rounding remainder.
    const desiredRedeem =
      active && row.total > 0
        ? -Number(
            (BigInt(doc.loyaltyRedeem ?? 0) * BigInt(net) + BigInt(row.total - 1)) /
              BigInt(row.total),
          )
        : 0;
    const parties = new Set(entries.filter((e) => e.txnId === row.id).map((e) => e.partyId));
    if (row.partyId) parties.add(row.partyId);
    for (const party of parties)
      for (const [kind, desired] of [
        ['earn', desiredEarn],
        ['redeem', desiredRedeem],
      ] as const) {
        const previous = sumPaise(
          entries
            .filter((e) => e.txnId === row.id && e.partyId === party && e.kind.endsWith(kind))
            .map((e) => e.points),
        );
        const difference = (party === row.partyId ? desired : 0) - previous;
        if (!difference) continue;
        const entry = context.db
          .insert(s.loyaltyEntries)
          .values({
            firmId: firm,
            partyId: party,
            txnId: row.id,
            date: today(),
            points: difference,
            kind: previous ? `reverse_${kind}` : kind,
          })
          .returning()
          .get();
        read.repo.audit(firm, 'loyalty_entries', entry.id, 'create', null, entry);
      }
  }
}
