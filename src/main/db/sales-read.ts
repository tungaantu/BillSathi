import { remainingOrderLines } from '../../shared/purchase-orders';
import { blankDocument, blankLine } from '../../shared/sales';
import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import { repositories } from './repositories';
import { nextDocumentNumber } from '../../shared/numbering';
import {
  paymentStatus,
  type SaleDocument,
  type SaleSummary,
  type SavedDocument,
} from '../../shared/sales';
import { sumPaise } from '../../shared/money';
export function salesRead(context: DatabaseContext) {
  // A rollback can replace the sql.js connection; always resolve the current DB.
  const db = new Proxy(context.db, {
    get(_t, p) {
      const v = Reflect.get(context.db, p);
      return typeof v === 'function' ? v.bind(context.db) : v;
    },
  });
  const repo = repositories(context);
  function own(firm: number, id: number) {
    repo.get(firm);
    const row = db
      .select()
      .from(s.txns)
      .where(and(eq(s.txns.firmId, firm), eq(s.txns.id, id)))
      .get();
    if (!row) throw new Error('notFound');
    return row;
  }
  function list(firm: number, type?: string, deleted = false, only?: number): SaleSummary[] {
    repo.get(firm);
    const rows = db.select().from(s.txns).where(eq(s.txns.firmId, firm)).all();
    const ids = new Set(rows.map((r) => r.id));
    // Group once (Maps) instead of scanning every payment/link/document per row: O(n), not O(n²).
    const paid = new Map<number, number[]>();
    for (const p of db.select().from(s.txnPayments).all())
      if (!p.reversed && ids.has(p.txnId))
        paid.set(p.txnId, [...(paid.get(p.txnId) ?? []), p.amount]);
    const linksTo = new Map<number, { amount: number; paymentTxnId: number }[]>();
    for (const l of db.select().from(s.paymentLinks).all())
      if (ids.has(l.invoiceTxnId))
        linksTo.set(l.invoiceTxnId, [...(linksTo.get(l.invoiceTxnId) ?? []), l]);
    const children = new Map<number, typeof rows>();
    for (const r of rows)
      if (r.refTxnId) children.set(r.refTxnId, [...(children.get(r.refTxnId) ?? []), r]);
    const partyNames = new Map(
      db
        .select({ id: s.parties.id, name: s.parties.name })
        .from(s.parties)
        .where(eq(s.parties.firmId, firm))
        .all()
        .map((p) => [p.id, p.name]),
    );
    const active = new Set(
      rows
        .filter(
          (r) =>
            (r.status === 'posted' ||
              (r.type === 'sale_order' && ['open', 'closed'].includes(r.status))) &&
            !r.deletedAt,
        )
        .map((r) => r.id),
    );
    return rows
      .filter(
        (r) =>
          (!type || r.type === type) &&
          Boolean(r.deletedAt) === deleted &&
          (only === undefined || r.id === only),
      )
      .map((r) => {
        const meta = JSON.parse(r.metadata);
        const kids = children.get(r.id) ?? [];
        const received = sumPaise([
          ...(paid.get(r.id) ?? []),
          ...(linksTo.get(r.id) ?? [])
            .filter((l) => active.has(l.paymentTxnId))
            .map((l) => l.amount),
          ...kids
            .filter(
              (c) =>
                c.type === (r.type === 'purchase' ? 'purchase_return' : 'sale_return') &&
                active.has(c.id),
            )
            .map((c) => c.total),
        ]);
        let status = r.status;
        if (r.type === 'purchase_order' && status === 'open') {
          const bills = kids
            .filter((b) => b.type === 'purchase' && active.has(b.id))
            .map((b) => JSON.parse(b.metadata).document);
          const remaining = remainingOrderLines(meta.document, bills);
          if (bills.length)
            status = remaining.some((l) => l.qty > 0) ? 'partially_received' : 'closed';
        }
        if (['sale_order', 'delivery_challan'].includes(r.type) && status === 'open') {
          const deliveries = kids
            .filter(
              (b) =>
                ['sale', 'delivery_challan', 'challan_return'].includes(b.type) &&
                !b.deletedAt &&
                !['draft', 'cancelled'].includes(b.status),
            )
            .map((b) => JSON.parse(b.metadata).document);
          if (deliveries.length)
            status = remainingOrderLines(meta.document, deliveries).some((l) => l.qty > 0)
              ? r.type === 'sale_order'
                ? 'partially_delivered'
                : 'open'
              : 'closed';
        }
        return {
          id: r.id,
          type: r.type,
          categoryId: r.expenseCategoryId,
          partyId: r.partyId,
          partyName: meta.document?.partyName || partyNames.get(r.partyId ?? 0) || '',
          prefix: r.prefix,
          number: r.number,
          date: r.date,
          dueDate: r.dueDate,
          total: r.total,
          received,
          balance: ['payment_in', 'payment_out'].includes(r.type)
            ? 0
            : Math.max(0, r.total - received),
          status,
          deletedAt: r.deletedAt,
          paymentStatus: [
            'estimate',
            'proforma',
            'sale_order',
            'purchase_order',
            'delivery_challan',
            'challan_return',
          ].includes(r.type)
            ? status
            : r.status === 'posted'
              ? ['payment_in', 'payment_out'].includes(r.type)
                ? 'paid'
                : paymentStatus(r.total, received, r.dueDate)
              : r.status,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }
  function get(firm: number, id: number): SavedDocument {
    const row = own(firm, id),
      meta = JSON.parse(row.metadata);
    if (!meta.document) {
      if (!['payment_in', 'payment_out', 'expense'].includes(row.type))
        throw new Error('validation');
      const r = meta.receipt;
      const party = db
        .select()
        .from(s.parties)
        .where(eq(s.parties.id, row.partyId ?? 0))
        .get();
      meta.document = {
        ...blankDocument(row.type === 'expense' ? 'expense' : 'sale', repo.get(firm).stateCode),
        type: row.type,
        partyId: row.partyId,
        partyName: party?.name ?? '',
        phone: party?.phone ?? '',
        date: row.date,
        prefix: row.prefix,
        number: row.number,
        description: row.description ?? '',
        categoryId: row.expenseCategoryId,
        lines: [{ ...blankLine(), name: row.description || row.type, price: row.total }],
        payments: db
          .select()
          .from(s.txnPayments)
          .where(eq(s.txnPayments.txnId, id))
          .all()
          .filter((p) => !p.reversed)
          .map((p) => ({ accountId: p.accountId, amount: p.amount, reference: p.reference ?? '' })),
        attachmentIds: r?.attachmentIds ?? [],
      };
    }
    const summary = list(firm, undefined, Boolean(row.deletedAt), id)[0];
    return {
      ...(meta.document as SaleDocument),
      ...summary,
      dueDate: summary.dueDate ?? '',
      type: meta.document.type,
      firmId: firm,
      firmState: meta.firmState,
      partyGstin: meta.partyGstin ?? '',
    };
  }
  function available(
    firm: number,
    type: string,
    prefix: string,
    number: number,
    except: number | null,
  ) {
    repo.get(firm);
    return !db
      .select()
      .from(s.txns)
      .where(
        and(
          eq(s.txns.firmId, firm),
          eq(s.txns.type, type),
          eq(s.txns.prefix, prefix),
          eq(s.txns.number, number),
        ),
      )
      .all()
      .some((r) => r.id !== except);
  }
  function next(firm: number, type: string, prefix: string) {
    repo.get(firm);
    return nextDocumentNumber(
      db.select().from(s.txns).where(eq(s.txns.firmId, firm)).all(),
      firm,
      type,
      prefix,
    ).number;
  }
  function accounts(firm: number) {
    repo.get(firm);
    return context.sqlite.transaction(() => {
      for (const type of ['cash', 'upi', 'cheque', 'card']) {
        if (
          !db
            .select()
            .from(s.paymentAccounts)
            .where(
              and(
                eq(s.paymentAccounts.firmId, firm),
                eq(s.paymentAccounts.type, type),
                isNull(s.paymentAccounts.deletedAt),
              ),
            )
            .get()
        ) {
          const row = db
            .insert(s.paymentAccounts)
            .values({ firmId: firm, name: type, type })
            .returning()
            .get();
          repo.audit(firm, 'payment_accounts', row.id, 'create', null, row);
        }
      }
      return db
        .select()
        .from(s.paymentAccounts)
        .where(and(eq(s.paymentAccounts.firmId, firm), isNull(s.paymentAccounts.deletedAt)))
        .all()
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    })();
  }
  function linked(firm: number, id: number) {
    const live = db
      .select()
      .from(s.txns)
      .where(eq(s.txns.firmId, firm))
      .all()
      .filter((t) => !['draft', 'cancelled'].includes(t.status) && !t.deletedAt);
    return (
      live.some(
        (t) =>
          t.refTxnId === id &&
          [
            'sale_return',
            'purchase_return',
            'purchase',
            'sale',
            'delivery_challan',
            'challan_return',
          ].includes(t.type),
      ) ||
      db
        .select()
        .from(s.paymentLinks)
        .where(eq(s.paymentLinks.invoiceTxnId, id))
        .all()
        .some((l) => live.some((t) => t.id === l.paymentTxnId && t.type !== 'sale_order'))
    );
  }
  return { db, repo, own, list, get, available, next, accounts, linked };
}
