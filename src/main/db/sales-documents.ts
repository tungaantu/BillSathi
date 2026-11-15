import { reconcileLoyalty } from './customer-loyalty';
import { eq } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import { salesRead } from './sales-read';
import * as s from './schema';
import { receiveOrder, remainingOrderLines } from '../../shared/purchase-orders';
import {
  blankDocument,
  validateReturnAgainst,
  type DocumentType,
  type SaleDocument,
} from '../../shared/sales';
import { sumPaise } from '../../shared/money';

export const fulfilmentTypes = ['sale_order', 'delivery_challan'];
export function fulfilments(
  read: ReturnType<typeof salesRead>,
  firm: number,
  source: number,
  except?: number,
) {
  return read
    .list(firm)
    .filter(
      (r) =>
        r.id !== except &&
        !['cancelled', 'draft'].includes(r.status) &&
        ['sale', 'delivery_challan', 'challan_return'].includes(r.type) &&
        read.own(firm, r.id).refTxnId === source,
    )
    .map((r) => read.get(firm, r.id));
}
export function validateFulfilment(
  context: DatabaseContext,
  firm: number,
  id: number | null,
  doc: SaleDocument,
) {
  if (!doc.refTxnId || !['sale', 'delivery_challan', 'challan_return'].includes(doc.type)) return;
  const read = salesRead(context),
    original = read.own(firm, doc.refTxnId);
  if (!fulfilmentTypes.includes(original.type)) return;
  if (
    original.deletedAt ||
    !['open', 'closed'].includes(original.status) ||
    original.partyId !== doc.partyId
  )
    throw new Error('validation');
  if (original.status === 'closed' && id === null) throw new Error('validation');
  if (
    doc.type === 'challan_return' &&
    (original.type !== 'delivery_challan' || !read.repo.getSettings(firm).challanReturns)
  )
    throw new Error('validation');
  if (
    !['sale', 'delivery_challan', 'challan_return'].includes(doc.type) ||
    (original.type === 'sale_order' && doc.type === 'challan_return')
  )
    throw new Error('validation');
  const remaining = remainingOrderLines(
    read.get(firm, original.id),
    fulfilments(read, firm, original.id, id ?? undefined),
  );
  validateReturnAgainst(
    { total: Number.MAX_SAFE_INTEGER, lines: remaining },
    { total: 0, lines: doc.lines },
    [],
  );
}
export function documentConversions(
  context: DatabaseContext,
  saveRaw: (firm: number, id: number | null, doc: SaleDocument) => number,
) {
  const read = salesRead(context),
    { db, repo, get, next } = read;
  return function convert(firm: number, id: number, type: DocumentType, quantities?: number[]) {
    const key = context.sqlite.transaction(() => {
      const source = get(firm, id),
        settings = repo.getSettings(firm);
      const partial = fulfilmentTypes.includes(source.type);
      const valid =
        source.type === 'sale_order'
          ? ['sale', 'delivery_challan'].includes(type)
          : source.type === 'delivery_challan'
            ? ['sale', 'challan_return'].includes(type)
            : source.type === 'purchase_order'
              ? type === 'purchase'
              : ['estimate', 'proforma'].includes(source.type) &&
                ['sale', 'sale_order'].includes(type);
      if (
        source.deletedAt ||
        !['open', 'partially_received', 'partially_delivered'].includes(source.status) ||
        !valid
      )
        throw new Error('validation');
      if (type === 'sale_order' && !settings.orders) throw new Error('validation');
      if (type === 'delivery_challan' && !settings.challan) throw new Error('validation');
      const blank = blankDocument(type, repo.get(firm).stateCode, settings);
      const used =
        source.type === 'purchase_order'
          ? read
              .list(firm, 'purchase')
              .filter((r) => r.status === 'posted' && read.own(firm, r.id).refTxnId === id)
              .map((r) => get(firm, r.id))
          : fulfilments(read, firm, id);
      const lines =
        partial || source.type === 'purchase_order'
          ? receiveOrder(source, used, quantities)
          : source.lines;
      const created = saveRaw(firm, null, {
        ...source,
        type,
        lines,
        refTxnId: id,
        prefix: blank.prefix,
        number: next(firm, type, blank.prefix),
        payments: [],
        attachmentIds: [],
        loyaltyRedeem: 0,
        loyaltyDiscount: 0,
        ...(partial || source.type === 'purchase_order'
          ? { charges: [], discount: 0, discountBps: 0 }
          : {}),
      });
      if (['estimate', 'proforma'].includes(source.type))
        db.update(s.txns).set({ status: 'converted' }).where(eq(s.txns.id, id)).run();
      // Advance stays on the order; invoice allocations do not post cash a second time.
      if (type === 'sale') {
        const order =
          source.type === 'sale_order'
            ? source
            : source.type === 'delivery_challan' && source.refTxnId
              ? get(firm, source.refTxnId)
              : null;
        if (order?.type === 'sale_order') {
          const allocated = sumPaise(
            db
              .select()
              .from(s.paymentLinks)
              .where(eq(s.paymentLinks.paymentTxnId, order.id))
              .all()
              .filter((l) => {
                const t = read.own(firm, l.invoiceTxnId);
                return !t.deletedAt && t.status === 'posted';
              })
              .map((l) => l.amount),
          );
          const amount = Math.min(
            get(firm, created).total,
            Math.max(0, order.received - allocated),
          );
          if (amount)
            db.insert(s.paymentLinks)
              .values({ paymentTxnId: order.id, invoiceTxnId: created, amount })
              .run();
        }
      }
      reconcileLoyalty(context, firm);
      repo.audit(firm, 'txns', id, 'convert', source, { targetId: created });
      return created;
    })();
    return get(firm, key);
  };
}
