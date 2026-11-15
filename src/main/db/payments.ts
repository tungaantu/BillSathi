import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import * as s from './schema';
import * as p from './payments-schema';
import { extractUtr } from '../../shared/upi-utils';
import type {
  BadgeMap,
  PaymentBadge,
  PaymentCandidate,
  UpiAlertData,
} from '../../shared/payments-api';
import { sumPaise } from '../../shared/money';

export type Collection = typeof p.upiCollections.$inferSelect;
export type Confirmation = typeof p.paymentConfirmations.$inferSelect;
const badgeOf = (state: string | undefined): PaymentBadge =>
  state === 'confirmed' ? 'confirmed' : state === 'observed' ? 'seen' : 'upi';

/** Storage for UPI collection attempts, confirmations and payment settings. */
export function paymentsRepository(context: DatabaseContext) {
  // A rollback can replace the sql.js connection; always resolve the current DB.
  const db = new Proxy(context.db, {
    get(_t, property) {
      const value = Reflect.get(context.db, property);
      return typeof value === 'function' ? value.bind(context.db) : value;
    },
  });
  const now = () => new Date().toISOString();

  /* ----- settings ----- */
  const readSettings = (firm: number): Record<string, string> =>
    Object.fromEntries(
      db
        .select()
        .from(p.paymentSettings)
        .where(eq(p.paymentSettings.firmId, firm))
        .all()
        .map((r) => [r.key, r.value]),
    );
  function writeSetting(firm: number, key: string, value: string | null) {
    if (value === null)
      db.delete(p.paymentSettings)
        .where(and(eq(p.paymentSettings.firmId, firm), eq(p.paymentSettings.key, key)))
        .run();
    else
      db.insert(p.paymentSettings)
        .values({ firmId: firm, key, value })
        .onConflictDoUpdate({
          target: [p.paymentSettings.firmId, p.paymentSettings.key],
          set: { value },
        })
        .run();
  }

  /* ----- collections ----- */
  function collection(firm: number, id: number): Collection {
    const row = db
      .select()
      .from(p.upiCollections)
      .where(and(eq(p.upiCollections.firmId, firm), eq(p.upiCollections.id, id)))
      .get();
    if (!row) throw new Error('notFound');
    return row;
  }
  const collectionsForInvoice = (firm: number, invoiceId: number): Collection[] =>
    db
      .select()
      .from(p.upiCollections)
      .where(and(eq(p.upiCollections.firmId, firm), eq(p.upiCollections.invoiceTxnId, invoiceId)))
      .all();
  const attemptsFor = (firm: number, invoiceId: number): number =>
    collectionsForInvoice(firm, invoiceId).length;
  function createCollection(
    values: Omit<typeof p.upiCollections.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
  ): Collection {
    const at = now();
    return db
      .insert(p.upiCollections)
      .values({ ...values, createdAt: at, updatedAt: at })
      .returning()
      .get();
  }
  function updateCollection(
    firm: number,
    id: number,
    patch: Partial<typeof p.upiCollections.$inferInsert>,
  ): Collection {
    db.update(p.upiCollections)
      .set({ ...patch, updatedAt: now() })
      .where(and(eq(p.upiCollections.firmId, firm), eq(p.upiCollections.id, id)))
      .run();
    return collection(firm, id);
  }
  const collectionByOrder = (firm: number, orderId: string): Collection | undefined =>
    db
      .select()
      .from(p.upiCollections)
      .where(and(eq(p.upiCollections.firmId, firm), eq(p.upiCollections.orderId, orderId)))
      .get();
  const collectionsWithStatus = (firm: number, status: Collection['status']): Collection[] =>
    db
      .select()
      .from(p.upiCollections)
      .where(and(eq(p.upiCollections.firmId, firm), eq(p.upiCollections.status, status)))
      .all();

  /* ----- confirmations ----- */
  const confirmation = (txnId: number): Confirmation | undefined =>
    db.select().from(p.paymentConfirmations).where(eq(p.paymentConfirmations.txnId, txnId)).get();
  const utrInUse = (firm: number, utr: string): boolean =>
    db
      .select()
      .from(p.paymentConfirmations)
      .where(and(eq(p.paymentConfirmations.firmId, firm), eq(p.paymentConfirmations.utr, utr)))
      .all()
      .some((c) => {
        const txn = db.select().from(s.txns).where(eq(s.txns.id, c.txnId)).get();
        return txn && !txn.deletedAt && txn.status === 'posted';
      });
  function addConfirmation(values: typeof p.paymentConfirmations.$inferInsert) {
    db.insert(p.paymentConfirmations).values(values).run();
  }
  function setConfirmation(
    txnId: number,
    patch: Partial<typeof p.paymentConfirmations.$inferInsert>,
  ) {
    db.update(p.paymentConfirmations)
      .set(patch)
      .where(eq(p.paymentConfirmations.txnId, txnId))
      .run();
  }

  /** Live (posted, not deleted) Payment-Ins with the payment type of their first line. */
  function livePayments(firm: number) {
    const txns = db
      .select()
      .from(s.txns)
      .where(and(eq(s.txns.firmId, firm), eq(s.txns.type, 'payment_in'), isNull(s.txns.deletedAt)))
      .all()
      .filter((t) => t.status === 'posted');
    if (!txns.length) return [];
    const ids = txns.map((t) => t.id);
    const lines = db.select().from(s.txnPayments).where(inArray(s.txnPayments.txnId, ids)).all();
    const accounts = db
      .select()
      .from(s.paymentAccounts)
      .where(eq(s.paymentAccounts.firmId, firm))
      .all();
    const parties = db.select().from(s.parties).where(eq(s.parties.firmId, firm)).all();
    return txns.map((t) => {
      const own = lines.filter((l) => l.txnId === t.id);
      return {
        txn: t,
        amount: sumPaise(own.map((l) => l.amount)),
        accountType: accounts.find((a) => a.id === own[0]?.accountId)?.type ?? '',
        reference: own.map((l) => l.reference ?? '').join(' '),
        party: parties.find((x) => x.id === t.partyId)?.name ?? '',
      };
    });
  }

  /** Payment-Ins by UPI or bank that the statement could still confirm. */
  function candidates(firm: number): PaymentCandidate[] {
    return livePayments(firm)
      .filter((x) => ['upi', 'bank'].includes(x.accountType))
      .filter((x) => confirmation(x.txn.id)?.state !== 'confirmed')
      .map((x) => ({
        txnId: x.txn.id,
        date: x.txn.date,
        amountPaise: x.amount,
        utr: confirmation(x.txn.id)?.utr || extractUtr(x.reference, x.txn.description) || '',
        label: `${x.txn.prefix}${x.txn.number} · ${x.party}`,
      }));
  }

  /** Small badges for the invoice and Payment-In lists. */
  function badges(firm: number): BadgeMap {
    const payments: BadgeMap['payments'] = {};
    const live = livePayments(firm);
    for (const x of live) {
      const c = confirmation(x.txn.id);
      if (c || x.accountType === 'upi') payments[x.txn.id] = badgeOf(c?.state);
    }
    const perInvoice = new Map<number, PaymentBadge[]>();
    const add = (invoice: number, badge: PaymentBadge) =>
      perInvoice.set(invoice, [...(perInvoice.get(invoice) ?? []), badge]);
    const paymentIds = Object.keys(payments).map(Number);
    if (paymentIds.length)
      for (const link of db
        .select()
        .from(s.paymentLinks)
        .where(inArray(s.paymentLinks.paymentTxnId, paymentIds))
        .all())
        add(link.invoiceTxnId, payments[link.paymentTxnId]);
    // UPI taken on the invoice itself (split payment at billing time).
    const upiAccounts = db
      .select()
      .from(s.paymentAccounts)
      .where(and(eq(s.paymentAccounts.firmId, firm), eq(s.paymentAccounts.type, 'upi')))
      .all()
      .map((a) => a.id);
    if (upiAccounts.length)
      for (const line of db
        .select()
        .from(s.txnPayments)
        .where(inArray(s.txnPayments.accountId, upiAccounts))
        .all()) {
        const txn = db.select().from(s.txns).where(eq(s.txns.id, line.txnId)).get();
        if (txn && txn.firmId === firm && txn.type === 'sale' && !txn.deletedAt) add(txn.id, 'upi');
      }
    const invoices: BadgeMap['invoices'] = {};
    for (const [invoice, list] of perInvoice)
      invoices[invoice] = list.every((b) => b === 'confirmed')
        ? 'confirmed'
        : list.includes('seen')
          ? 'seen'
          : 'upi';
    return { invoices, payments };
  }

  function alert(firm: number): UpiAlertData {
    const observed = db
      .select()
      .from(p.paymentConfirmations)
      .where(
        and(eq(p.paymentConfirmations.firmId, firm), eq(p.paymentConfirmations.state, 'observed')),
      )
      .all();
    const live = livePayments(firm);
    const rows = live.filter((x) => observed.some((o) => o.txnId === x.txn.id));
    return {
      seenRecorded: rows.length,
      seenRecordedAmount: sumPaise(rows.map((r) => r.amount)),
      waitingToRecord: collectionsWithStatus(firm, 'seen').length,
    };
  }

  return {
    db,
    now,
    readSettings,
    writeSetting,
    collection,
    attemptsFor,
    collectionsForInvoice,
    createCollection,
    updateCollection,
    collectionByOrder,
    collectionsWithStatus,
    confirmation,
    utrInUse,
    addConfirmation,
    setConfirmation,
    livePayments,
    candidates,
    badges,
    alert,
    observedConfirmations: (firm: number) =>
      db
        .select()
        .from(p.paymentConfirmations)
        .where(
          and(
            eq(p.paymentConfirmations.firmId, firm),
            eq(p.paymentConfirmations.state, 'observed'),
          ),
        )
        .all(),
  };
}
export type PaymentsRepository = ReturnType<typeof paymentsRepository>;
