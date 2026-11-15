import { validateFulfilment } from './sales-documents';
import { loyaltyBalance, reconcileLoyalty } from './customer-loyalty';
import { financePosting } from './finance-posting';
import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { yearLock } from './fy-lock';
import { salesRead } from './sales-read';
import { masterRepository } from './masters';
import {
  allocateOldest,
  receiptSchema,
  validateAllocations,
  validateReturnAgainst,
  type Receipt,
} from '../../shared/sales';
import { decimalScaled, sumPaise } from '../../shared/money';
export function salesOperations(context: DatabaseContext, read: ReturnType<typeof salesRead>) {
  const { db, repo, own, list, get, available, linked } = read;
  const masters = masterRepository(context);
  function getReceipt(firm: number, id: number): Receipt {
    const row = own(firm, id);
    if (!['payment_in', 'payment_out'].includes(row.type) || row.deletedAt)
      throw new Error('validation');
    const r = receiptSchema.parse(JSON.parse(row.metadata).receipt);
    const allocations = db
      .select()
      .from(s.paymentLinks)
      .where(eq(s.paymentLinks.paymentTxnId, id))
      .all()
      .map((l) => ({ invoiceId: l.invoiceTxnId, amount: l.amount }));
    return { ...r, allocations };
  }
  /** `within` runs inside the same transaction, so related rows commit or roll back together. */
  function receipt(
    firm: number,
    input: Receipt,
    id?: number,
    within?: (paymentTxnId: number) => void,
  ) {
    return context.sqlite.transaction(() => {
      const r = receiptSchema.parse(input);
      repo.get(firm);
      const before = id ? own(firm, id) : null;
      yearLock(context)(firm, r.date, before?.date);
      if (before) {
        if (
          before.type !== r.type ||
          before.status !== 'posted' ||
          before.deletedAt ||
          linked(firm, before.id)
        )
          throw new Error('linked');
        if (
          db
            .select()
            .from(s.cheques)
            .where(eq(s.cheques.txnId, before.id))
            .all()
            .some((c) => !c.deletedAt && c.status !== 'open')
        )
          throw new Error('linked');
        db.update(s.txns).set({ status: 'draft' }).where(eq(s.txns.id, before.id)).run();
      }
      if (!masters.parties(firm).some((p) => p.id === r.partyId)) throw new Error('validation');
      if (!available(firm, r.type, r.prefix, r.number, id ?? null)) throw new Error('duplicate');
      if (
        !db
          .select()
          .from(s.paymentAccounts)
          .where(
            and(
              eq(s.paymentAccounts.id, r.accountId),
              eq(s.paymentAccounts.firmId, firm),
              isNull(s.paymentAccounts.deletedAt),
            ),
          )
          .get()
      )
        throw new Error('validation');
      const invoices = list(firm, r.type === 'payment_out' ? 'purchase' : 'sale').filter(
        (i) => i.partyId === r.partyId && i.status === 'posted' && i.balance > 0,
      );
      const settled = sumPaise([r.amount, r.discount]);
      const allocations = r.auto ? allocateOldest(settled, invoices) : r.allocations;
      validateAllocations(settled, allocations, invoices);
      if (r.discount && sumPaise(allocations.map((a) => a.amount)) !== settled)
        throw new Error('allocation');
      const at = new Date().toISOString();
      const values = {
        firmId: firm,
        type: r.type,
        partyId: r.partyId,
        prefix: r.prefix,
        number: r.number,
        date: r.date,
        status: 'posted',
        total: settled,
        discount: r.discount,
        description: r.description,
        metadata: JSON.stringify({ receipt: r }),
        createdAt: before?.createdAt ?? at,
        updatedAt: at,
      };
      const row = before
        ? db.update(s.txns).set(values).where(eq(s.txns.id, before.id)).returning().get()
        : db.insert(s.txns).values(values).returning().get();
      if (before) {
        db.update(s.cheques)
          .set({ deletedAt: at, paymentId: null })
          .where(eq(s.cheques.txnId, row.id))
          .run();
        db.delete(s.paymentLinks).where(eq(s.paymentLinks.paymentTxnId, row.id)).run();
        db.delete(s.txnPayments).where(eq(s.txnPayments.txnId, row.id)).run();
        db.update(s.attachments).set({ txnId: null }).where(eq(s.attachments.txnId, row.id)).run();
      }
      const direction = r.type === 'payment_out' ? -1 : 1;
      const payment = db
        .insert(s.txnPayments)
        .values({
          txnId: row.id,
          accountId: r.accountId,
          amount: r.amount,
          direction,
          reference: r.reference,
        })
        .returning()
        .get();
      financePosting(context).cheque(
        firm,
        row.id,
        payment.id,
        {
          accountId: r.accountId,
          amount: r.amount,
          reference: r.reference,
          chequeDate: r.chequeDate,
        },
        r.date,
        direction,
      );
      for (const attachmentId of r.attachmentIds) {
        const a = db
          .select()
          .from(s.attachments)
          .where(and(eq(s.attachments.id, attachmentId), eq(s.attachments.firmId, firm)))
          .get();
        if (!a || a.txnId) throw new Error('validation');
        db.update(s.attachments).set({ txnId: row.id }).where(eq(s.attachments.id, a.id)).run();
      }
      for (const a of allocations)
        if (a.amount)
          db.insert(s.paymentLinks)
            .values({ paymentTxnId: row.id, invoiceTxnId: a.invoiceId, amount: a.amount })
            .run();
      repo.audit(firm, 'txns', row.id, before ? 'update' : 'create', before, {
        ...row,
        allocations,
      });
      reconcileLoyalty(context, firm);
      within?.(row.id);
      return row.id;
    })();
  }
  function action(
    firm: number,
    id: number,
    action: 'delete' | 'restore' | 'cancel' | 'reopen' | 'close',
  ) {
    context.sqlite.transaction(() => {
      const before = own(firm, id);
      yearLock(context)(firm, before.date);
      if (
        ['restore', 'reopen'].includes(action) &&
        db
          .select()
          .from(s.cheques)
          .where(eq(s.cheques.txnId, id))
          .all()
          .some((c) => c.status === 'bounced')
      )
        throw new Error('linked');
      if (
        linked(firm, id) &&
        !(
          action === 'close' &&
          ['purchase_order', 'sale_order', 'delivery_challan'].includes(before.type)
        )
      )
        throw new Error('linked');
      if (before.deletedAt && action !== 'restore') throw new Error('validation');
      if (action === 'cancel' && !['posted', 'open'].includes(before.status))
        throw new Error('validation');
      if (action === 'close' && before.status !== 'open') throw new Error('validation');
      if (
        ['delete', 'cancel'].includes(action) &&
        ['posted', 'open', 'closed'].includes(before.status) &&
        !before.deletedAt &&
        repo.getSettings(firm).stock &&
        repo.getSettings(firm).negativeStock
      ) {
        const movements = db
          .select()
          .from(s.stockLedger)
          .where(and(eq(s.stockLedger.txnId, id), isNull(s.stockLedger.deletedAt)))
          .all();
        for (const item of masters.items(firm)) {
          const removed = movements
            .filter((m) => m.itemId === item.id)
            .reduce((n, m) => n + decimalScaled(m.qty, 3), 0n);
          if (removed > 0n && decimalScaled(item.qty, 3) - removed < 0n)
            throw new Error('negativeStock');
        }
      }
      if (
        action === 'close' &&
        ![
          'estimate',
          'proforma',
          'sale_order',
          'purchase_order',
          'delivery_challan',
          'challan_return',
        ].includes(before.type)
      )
        throw new Error('validation');
      if (action === 'restore' && !before.deletedAt) throw new Error('validation');
      if (action === 'reopen' && before.status !== 'cancelled' && before.status !== 'closed')
        throw new Error('validation');
      if (action === 'reopen' || (action === 'restore' && before.status !== 'cancelled')) {
        if (['sale', 'delivery_challan', 'challan_return'].includes(before.type))
          validateFulfilment(context, firm, id, get(firm, id));
        const doc = JSON.parse(before.metadata).document;
        if (
          before.type === 'sale' &&
          doc?.loyaltyRedeem &&
          before.partyId &&
          loyaltyBalance(context, firm, before.partyId, id) < doc.loyaltyRedeem
        )
          throw new Error('validation');
        if (['payment_in', 'payment_out'].includes(before.type)) {
          const links = db
            .select()
            .from(s.paymentLinks)
            .where(eq(s.paymentLinks.paymentTxnId, id))
            .all();
          const invoices = list(firm, before.type === 'payment_out' ? 'purchase' : 'sale').filter(
            (i) => i.status === 'posted' && i.partyId === before.partyId,
          );
          validateAllocations(
            before.total,
            links.map((l) => ({ invoiceId: l.invoiceTxnId, amount: l.amount })),
            invoices,
          );
        } else if (
          [
            'sale',
            'sale_return',
            'purchase',
            'purchase_return',
            'delivery_challan',
            'challan_return',
          ].includes(before.type)
        ) {
          // Reactivation preserves original lines, taxes, costing and stock conversions.
          db.update(s.txns)
            .set({
              deletedAt: null,
              status: ['delivery_challan', 'challan_return'].includes(before.type)
                ? 'open'
                : 'posted',
            })
            .where(eq(s.txns.id, id))
            .run();
          if (repo.getSettings(firm).stock && repo.getSettings(firm).negativeStock) {
            const outgoing = db
              .select()
              .from(s.stockLedger)
              .where(and(eq(s.stockLedger.txnId, id), isNull(s.stockLedger.deletedAt)))
              .all()
              .filter((m) => m.qty < 0);
            if (
              masters
                .items(firm)
                .some((item) => item.qty < 0 && outgoing.some((m) => m.itemId === item.id))
            )
              throw new Error('negativeStock');
          }
          if (['sale_return', 'purchase_return'].includes(before.type) && before.refTxnId) {
            const source = get(firm, before.refTxnId);
            if (
              source.type !== (before.type === 'sale_return' ? 'sale' : 'purchase') ||
              source.deletedAt ||
              source.status !== 'posted' ||
              source.partyId !== before.partyId
            )
              throw new Error('validation');
            const others = list(firm, before.type)
              .filter(
                (t) =>
                  t.id !== id && t.status === 'posted' && own(firm, t.id).refTxnId === source.id,
              )
              .map((t) => get(firm, t.id));
            validateReturnAgainst(source, get(firm, id), others);
          }
        }
      }
      const at = new Date().toISOString();
      db.update(s.txns)
        .set(
          action === 'delete'
            ? { deletedAt: at, updatedAt: at }
            : action === 'restore'
              ? { deletedAt: null, updatedAt: at }
              : {
                  status:
                    action === 'cancel'
                      ? 'cancelled'
                      : action === 'close'
                        ? 'closed'
                        : [
                              'estimate',
                              'proforma',
                              'sale_order',
                              'purchase_order',
                              'delivery_challan',
                              'challan_return',
                            ].includes(before.type)
                          ? 'open'
                          : 'posted',
                  updatedAt: at,
                },
        )
        .where(eq(s.txns.id, id))
        .run();
      reconcileLoyalty(context, firm);
      repo.audit(firm, 'txns', id, action, before, own(firm, id));
    })();
  }
  return { receipt, getReceipt, action };
}
