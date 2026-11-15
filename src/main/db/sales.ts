import { validateLoyalty, reconcileLoyalty } from './customer-loyalty';
import { validateFulfilment, documentConversions } from './sales-documents';
import { salesOperations } from './sales-operations';
import { returnMovements } from './return-movements';
import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { salesRead } from './sales-read';
import { masterRepository } from './masters';
import { inventoryRepository } from './inventory';
import { yearLock } from './fy-lock';
import {
  documentSchema,
  stockMovement,
  totals,
  validateReturnAgainst,
  type SaleDocument,
} from '../../shared/sales';
import { decimalScaled, sumPaise } from '../../shared/money';
import { DOCUMENT_CONFIG } from '../../shared/sales';
import { financePosting } from './finance-posting';
import { expenseCategories } from './expense-categories';
import { receiveOrder } from '../../shared/purchase-orders';

export function salesRepository(context: DatabaseContext) {
  const read = salesRead(context),
    { db, repo, own, get, available, linked } = read;
  const masters = masterRepository(context);
  const inventory = inventoryRepository(context);
  function saveRaw(firm: number, id: number | null, input: SaleDocument, draft = false) {
    const doc = documentSchema.parse(input),
      settings = repo.getSettings(firm);
    validateLoyalty(context, firm, id, doc);
    validateFulfilment(context, firm, id, doc);
    if (
      (doc.type === 'sale_order' && !settings.orders) ||
      (doc.type === 'delivery_challan' && !settings.challan) ||
      (doc.type === 'proforma' && !settings.proforma)
    )
      throw new Error('validation');
    if (doc.type === 'other_income' && !settings.otherIncome) throw new Error('validation');
    if (
      ['expense', 'other_income'].includes(doc.type) &&
      (!doc.categoryId ||
        !db
          .select()
          .from(s.expenseCategories)
          .where(
            and(
              eq(s.expenseCategories.id, doc.categoryId),
              eq(s.expenseCategories.firmId, firm),
              eq(s.expenseCategories.kind, doc.type),
              isNull(s.expenseCategories.deletedAt),
            ),
          )
          .get())
    )
      throw new Error('validation');
    const before = id === null ? null : own(firm, id);
    // Closed financial years are read-only (both the old and the new date must be open).
    yearLock(context)(firm, doc.date, before?.date);
    if (
      before &&
      (before.deletedAt ||
        before.type !== doc.type ||
        ['cancelled', 'converted', 'closed'].includes(before.status))
    )
      throw new Error('validation');
    if (before && linked(firm, before.id)) throw new Error('linked');
    if (!available(firm, doc.type, doc.prefix, doc.number, id)) throw new Error('duplicate');
    const party =
      doc.partyId === null
        ? null
        : masters.parties(firm).find((p) => p.id === doc.partyId && p.active);
    if (doc.partyId && !party) throw new Error('validation');
    if (party && !doc.partyName) doc.partyName = party.name;
    if (doc.refTxnId) {
      const original = own(firm, doc.refTxnId);
      if (doc.type === 'purchase') {
        if (
          original.type !== 'purchase_order' ||
          original.status !== 'open' ||
          original.partyId !== doc.partyId
        )
          throw new Error('validation');
        const others = read
          .list(firm, 'purchase')
          .filter(
            (t) => t.id !== id && t.status === 'posted' && own(firm, t.id).refTxnId === original.id,
          )
          .map((t) => get(firm, t.id));
        const remaining = receiveOrder(get(firm, original.id), others);
        validateReturnAgainst(
          { total: Number.MAX_SAFE_INTEGER, lines: remaining },
          { total: 0, lines: doc.lines },
          [],
        );
      }
      if (
        original.deletedAt ||
        (['sale_return', 'purchase_return'].includes(doc.type) &&
          (original.type !== (doc.type === 'sale_return' ? 'sale' : 'purchase') ||
            original.status !== 'posted' ||
            original.partyId !== doc.partyId))
      )
        throw new Error('validation');
      if (['sale_return', 'purchase_return'].includes(doc.type)) {
        const returned = db
          .select()
          .from(s.txns)
          .where(eq(s.txns.refTxnId, original.id))
          .all()
          .filter(
            (r) => r.id !== id && r.type === doc.type && r.status === 'posted' && !r.deletedAt,
          );
        validateReturnAgainst(
          get(firm, original.id),
          { ...doc, total: totals(doc, repo.get(firm).stateCode).total },
          returned.map((r) => ({ ...JSON.parse(r.metadata).document, total: r.total })),
        );
      }
    }
    const calculated = totals(doc, repo.get(firm).stateCode);
    const nonPosting = [
      'estimate',
      'proforma',
      'sale_order',
      'purchase_order',
      'delivery_challan',
      'challan_return',
    ].includes(doc.type);
    if (DOCUMENT_CONFIG[doc.type].payments === 'none' || draft) doc.payments = [];
    const sourceStock = doc.refTxnId
      ? db
          .select()
          .from(s.stockLedger)
          .where(and(eq(s.stockLedger.txnId, doc.refTxnId), isNull(s.stockLedger.deletedAt)))
          .all().length > 0
      : false;
    const stockPosting =
      !draft &&
      (!nonPosting ||
        (doc.type === 'delivery_challan' && Boolean(settings.challanStock)) ||
        (doc.type === 'challan_return' && sourceStock));
    const coveredByChallan =
      doc.type === 'sale' &&
      doc.refTxnId &&
      own(firm, doc.refTxnId).type === 'delivery_challan' &&
      sourceStock;
    const received = sumPaise(doc.payments.map((p) => p.amount));
    if (
      received > calculated.total ||
      ((doc.cash || ['expense', 'other_income'].includes(doc.type)) &&
        !doc.partyId &&
        !nonPosting &&
        received !== calculated.total)
    )
      throw new Error('overpayment');
    for (const p of doc.payments) {
      if (
        !db
          .select()
          .from(s.paymentAccounts)
          .where(
            and(
              eq(s.paymentAccounts.id, p.accountId),
              eq(s.paymentAccounts.firmId, firm),
              isNull(s.paymentAccounts.deletedAt),
            ),
          )
          .get()
      )
        throw new Error('validation');
    }
    const items = masters.items(firm);
    const reversed = returnMovements(context, firm, id, doc);
    const movements = doc.lines.map((line, index) => {
      const item = items.find((i) => i.id === line.itemId);
      if (line.itemId && !item) throw new Error('validation');
      if (item && line.unitId !== item.unitId && line.unitId !== item.secondaryUnitId)
        throw new Error('validation');
      if (!item) return null;
      const movement = coveredByChallan
        ? { qty: 0, value: 0 }
        : (reversed?.[index] ?? stockMovement(doc.type, line, item));
      if (doc.type === 'purchase' && movement.qty)
        movement.value = doc.itcEligible
          ? calculated.lines[index].taxable
          : calculated.lines[index].total;
      return { item, ...movement };
    });
    if (stockPosting && settings.stock && settings.negativeStock) {
      for (const item of items) {
        const delta = movements
          .filter((m) => m?.item.id === item.id)
          .reduce((n, m) => n + decimalScaled(m!.qty, 3), 0n);
        const old = before
          ? db
              .select()
              .from(s.stockLedger)
              .where(
                and(
                  eq(s.stockLedger.txnId, before.id),
                  eq(s.stockLedger.itemId, item.id),
                  isNull(s.stockLedger.deletedAt),
                ),
              )
              .all()
              .reduce((n, m) => n + decimalScaled(m.qty, 3), 0n)
          : 0n;
        if (delta < 0n && decimalScaled(item.qty, 3) - old + delta < 0n)
          throw new Error('negativeStock');
      }
    }
    const at = new Date().toISOString();
    const values = {
      firmId: firm,
      type: doc.type,
      partyId: doc.partyId,
      prefix: doc.prefix,
      number: doc.number,
      date: doc.date,
      dueDate: doc.dueDate || null,
      placeOfSupply: doc.placeOfSupply,
      status: draft ? 'draft' : nonPosting ? 'open' : 'posted',
      refTxnId: doc.refTxnId,
      godownId: doc.godownId,
      subtotal: calculated.gross,
      discount: sumPaise([calculated.lineDiscount, calculated.transactionDiscount]),
      taxable: calculated.taxable,
      cgst: calculated.cgst,
      sgst: calculated.sgst,
      igst: calculated.igst,
      cess: calculated.cess,
      charges: sumPaise(doc.charges.map((c) => c.amount)),
      roundOff: calculated.roundOff,
      total: calculated.total,
      description: doc.description,
      terms: doc.terms,
      itcEligible: doc.itcEligible,
      expenseCategoryId: doc.categoryId,
      metadata: JSON.stringify({
        ...JSON.parse(before?.metadata ?? '{}'),
        document: doc,
        loyaltyPlan:
          doc.type === 'sale' && settings.loyalty
            ? {
                points: Number(settings.loyaltyEarnPoints),
                per: Number(settings.loyaltyPerPaise),
                basis: String(settings.loyaltyBasis),
              }
            : undefined,
        partyGstin: party?.gstin ?? '',
        firmState: repo.get(firm).stateCode,
        // E-way bill / e-invoice data entered after upload survives later edits.
        compliance: before ? JSON.parse(before.metadata).compliance : undefined,
      }),
      updatedAt: at,
    };
    const txn =
      id === null
        ? db
            .insert(s.txns)
            .values({ ...values, createdAt: at })
            .returning()
            .get()
        : db.update(s.txns).set(values).where(eq(s.txns.id, id)).returning().get();
    // Keep old stock movements for audit, but take them out of derived balances.
    db.update(s.stockLedger)
      .set({ deletedAt: at, txnLineId: null })
      .where(eq(s.stockLedger.txnId, txn.id))
      .run();
    inventory.clearTxn(txn.id, at);
    const existingCheques = db.select().from(s.cheques).where(eq(s.cheques.txnId, txn.id)).all();
    if (existingCheques.some((c) => c.status !== 'open')) throw new Error('linked');
    db.update(s.cheques)
      .set({ deletedAt: at, paymentId: null })
      .where(eq(s.cheques.txnId, txn.id))
      .run();
    db.delete(s.txnPayments).where(eq(s.txnPayments.txnId, txn.id)).run();
    db.delete(s.txnLines).where(eq(s.txnLines.txnId, txn.id)).run();
    db.delete(s.additionalCharges).where(eq(s.additionalCharges.txnId, txn.id)).run();
    doc.lines.forEach((line, index) => {
      const c = calculated.lines[index];
      const row = db
        .insert(s.txnLines)
        .values({
          ...line,
          txnId: txn.id,
          discount: c.discount,
          taxable: c.taxable,
          cgst: c.cgst,
          sgst: c.sgst,
          igst: c.igst,
          cess: c.cess,
          total: c.total,
          position: index,
        })
        .returning()
        .get();
      const m = movements[index];
      if (m && m.qty && stockPosting && settings.stock)
        // Writes the stock rows (split by batch / godown) and serial moves for this line.
        inventory.post(firm, {
          txnId: txn.id,
          lineId: row.id,
          date: doc.date,
          reason: doc.type,
          godownId: doc.godownId ?? (settings.godowns ? inventory.mainGodown(firm) : null),
          refTxnId: doc.refTxnId,
          line,
          item: m.item,
          qty: m.qty,
          value: m.value,
        });
    });
    doc.charges.forEach((charge, index) => {
      const c = calculated.charges[index];
      db.insert(s.additionalCharges)
        .values({
          ...charge,
          firmId: firm,
          txnId: txn.id,
          taxable: c.taxable,
          cgst: c.cgst,
          sgst: c.sgst,
          igst: c.igst,
          cess: c.cess,
        })
        .run();
    });
    for (const p of doc.payments) {
      if (!p.amount) continue;
      const direction = DOCUMENT_CONFIG[doc.type].payments === 'pay' ? -1 : 1;
      const payment = db
        .insert(s.txnPayments)
        .values({ ...p, txnId: txn.id, direction })
        .returning()
        .get();
      financePosting(context).cheque(firm, txn.id, payment.id, p, doc.date, direction);
    }
    if (doc.type === 'purchase')
      for (const line of doc.lines) {
        const item = items.find((i) => i.id === line.itemId);
        if (
          !item ||
          line.unitId === item.secondaryUnitId ||
          (!settings.updatePurchasePrice && !settings.updateSalePrice)
        )
          continue;
        const stored = db.select().from(s.items).where(eq(s.items.id, item.id)).get()!;
        const patch = {
          ...(settings.updatePurchasePrice ? { purchasePrice: line.price } : {}),
          ...(settings.updateSalePrice ? { salePrice: line.price, inclusive: line.inclusive } : {}),
          customFields: JSON.stringify({
            ...JSON.parse(stored.customFields ?? '{}'),
            ...(settings.updatePurchasePrice ? { purchaseInclusive: line.inclusive } : {}),
          }),
        };
        db.update(s.items).set(patch).where(eq(s.items.id, item.id)).run();
        repo.audit(firm, 'items', item.id, 'update', item, patch);
      }
    db.update(s.attachments).set({ txnId: null }).where(eq(s.attachments.txnId, txn.id)).run();
    for (const attachmentId of doc.attachmentIds) {
      const a = db
        .select()
        .from(s.attachments)
        .where(and(eq(s.attachments.id, attachmentId), eq(s.attachments.firmId, firm)))
        .get();
      if (!a || (a.txnId && a.txnId !== txn.id)) throw new Error('validation');
      db.update(s.attachments).set({ txnId: txn.id }).where(eq(s.attachments.id, a.id)).run();
    }
    repo.audit(firm, 'txns', txn.id, before ? 'update' : 'create', before, {
      ...txn,
      document: doc,
    });
    if (doc.type === 'sale' && settings.rememberPartyPrice && doc.partyId && !draft)
      for (const line of doc.lines) {
        const item = items.find((i) => i.id === line.itemId);
        if (!item || line.unitId === item.secondaryUnitId) continue;
        const rate = {
          firmId: firm,
          partyId: doc.partyId,
          itemId: item.id,
          source: 'remembered',
          price: line.price,
          inclusive: line.inclusive,
        };
        const previous = db
          .select()
          .from(s.partyRates)
          .where(
            and(
              eq(s.partyRates.firmId, firm),
              eq(s.partyRates.partyId, doc.partyId),
              eq(s.partyRates.itemId, item.id),
            ),
          )
          .get();
        if (previous?.source === 'special') continue;
        db.insert(s.partyRates)
          .values(rate)
          .onConflictDoUpdate({
            target: [s.partyRates.firmId, s.partyRates.partyId, s.partyRates.itemId],
            set: rate,
          })
          .run();
        repo.audit(firm, 'party_rates', item.id, previous ? 'update' : 'create', previous, rate);
      }
    reconcileLoyalty(context, firm);
    return txn.id;
  }
  function save(firm: number, id: number | null, doc: SaleDocument) {
    const key = context.sqlite.transaction(() => saveRaw(firm, id, doc))();
    return get(firm, key);
  }
  return {
    ...read,
    save,
    saveDraft: (firm: number, doc: SaleDocument) =>
      context.sqlite.transaction(() => get(firm, saveRaw(firm, null, doc, true)))(),
    ...salesOperations(context, read),
    convert: documentConversions(context, saveRaw),
    ...expenseCategories(context),
  };
}
