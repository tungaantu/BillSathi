import QRCode from 'qrcode';
import type { DatabaseContext } from '../../db';
import { paymentsRepository, type Collection } from '../../db/payments';
import { salesRepository } from '../../db/sales';
import { repositories } from '../../db/repositories';
import { today } from '../../../shared/masters';
import { displayDocumentNumber } from '../../../shared/numbering';
import { isValidLast4, isValidUpiId, isValidUtr } from '../../../shared/upi-utils';
import type {
  CollectionView,
  PollResult,
  RecordInput,
  RecordOutcome,
  StartOutcome,
  SyncResult,
  YoupiProblem,
} from '../../../shared/payments-api';
import { buildUpiLink, collectionRef, youpiOrderId } from './upi-link';
import { YoupiError, type YoupiState } from './youpi-client';
import type { PaymentConfigStore } from './config';
import type { WebhookPayload } from './webhook';

/** How long a QR code is offered before the screen asks for a fresh one. */
export const COLLECT_WINDOW_MS = 5 * 60 * 1000;

/** UPI collection: QR, optional YouPI-PG confirmation, and recording the payment. */
export function collectService(context: DatabaseContext, store: PaymentConfigStore) {
  const repo = paymentsRepository(context),
    sales = salesRepository(context),
    firms = repositories(context);

  const invoiceLabel = (firm: number, invoiceId: number) => {
    const doc = sales.get(firm, invoiceId);
    return { doc, label: displayDocumentNumber({ ...doc, firmId: firm }) };
  };

  async function view(firm: number, row: Collection, youpiProblem: YoupiProblem | null = null) {
    const { doc, label } = invoiceLabel(firm, row.invoiceTxnId!);
    const link = buildUpiLink({
      upiId: row.upiId,
      payeeName: row.payeeName,
      amountPaise: row.amount,
      note: label,
      ref: row.ref,
    });
    const result: CollectionView = {
      id: row.id,
      invoiceId: row.invoiceTxnId!,
      invoiceLabel: label,
      partyName: doc.partyName,
      hasParty: doc.partyId !== null,
      amount: row.amount,
      balance: doc.balance,
      upiId: row.upiId,
      payeeName: row.payeeName,
      ref: row.ref,
      link,
      qr: await QRCode.toDataURL(link, { width: 520, margin: 2, errorCorrectionLevel: 'M' }),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      provider: row.provider === 'youpi' ? 'youpi' : 'manual',
      status: row.status as CollectionView['status'],
      seenUtr: row.seenUtr ?? '',
      checkoutUrl: row.checkoutUrl ?? '',
      youpiProblem,
      paymentTxnId: row.paymentTxnId,
    };
    return result;
  }

  async function start(firm: number, invoiceId: number, amount: number): Promise<StartOutcome> {
    const company = firms.get(firm);
    if (!isValidUpiId(company.upiId)) return { ok: false, reason: 'noUpiId' };
    const { doc, label } = invoiceLabel(firm, invoiceId);
    if (doc.type !== 'sale' || doc.status !== 'posted' || doc.deletedAt || doc.balance <= 0)
      return { ok: false, reason: 'notPayable' };
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > doc.balance)
      return { ok: false, reason: 'badAmount' };
    // Re-opening the dialog resumes a live QR (or a payment already seen) instead of making a new order.
    const resumable = repo
      .collectionsForInvoice(firm, invoiceId)
      .filter(
        (c) =>
          c.status === 'seen' ||
          (c.status === 'open' && c.amount === amount && Date.parse(c.expiresAt) > Date.now()),
      )
      .sort((a, b) => b.id - a.id)[0];
    if (resumable) return { ok: true, collection: await view(firm, resumable) };
    const config = store.get(firm);
    let attempt = repo.attemptsFor(firm, invoiceId) + 1;
    let upiId = company.upiId.trim(),
      payeeName = config.payeeName || company.name;
    let provider: 'manual' | 'youpi' = 'manual',
      problem: YoupiProblem | null = null;
    let order: { orderId: string; paymentId: string; checkoutUrl: string } | null = null;
    const client = store.client(firm);
    if (config.youpiEnabled && !client) problem = 'config';
    if (client) {
      for (let tries = 0; tries < 3 && !order; tries++, attempt++) {
        try {
          const created = await client.createOrder({
            orderId: youpiOrderId(firm, invoiceId, attempt),
            amountPaise: amount,
            description: `Invoice ${label}`,
            invoiceNo: label,
          });
          order = created;
          provider = 'youpi';
          // Pay the account the gateway watches, if it tells us which one.
          try {
            const info = await client.getCheckoutInfo(created.paymentId);
            if (info.payeeVpa && isValidUpiId(info.payeeVpa)) upiId = info.payeeVpa;
            if (info.payeeName) payeeName = info.payeeName;
          } catch {
            /* Fall back to the firm UPI ID. */
          }
        } catch (error) {
          if (error instanceof YoupiError && error.code === 'mismatch') continue;
          problem = error instanceof YoupiError ? error.code : 'unreachable';
          break;
        }
      }
      if (!order && !problem) problem = 'mismatch';
      if (order) attempt -= 1; // the loop incremented once more after the success
    }
    const now = Date.now();
    const row = repo.createCollection({
      firmId: firm,
      invoiceTxnId: invoiceId,
      partyId: doc.partyId,
      attempt,
      ref: collectionRef(firm, invoiceId, attempt),
      amount,
      upiId,
      payeeName,
      provider,
      orderId: order?.orderId ?? null,
      providerPaymentId: order?.paymentId ?? null,
      checkoutUrl: order?.checkoutUrl ?? null,
      status: 'open',
      expiresAt: new Date(now + COLLECT_WINDOW_MS).toISOString(),
    });
    return { ok: true, collection: await view(firm, row, problem) };
  }

  const fromGateway = (state: YoupiState): PollResult['gateway'] =>
    state === 'unknown' ? 'waiting' : state;

  /** Reads the latest state (YouPI when used) and returns it for the Collect screen. */
  async function poll(firm: number, id: number): Promise<PollResult> {
    let row = repo.collection(firm, id);
    let gateway: PollResult['gateway'] = 'manual';
    if (row.provider === 'youpi' && row.providerPaymentId) {
      gateway = row.status === 'seen' || row.status === 'recorded' ? 'seen' : 'waiting';
      const client = store.client(firm);
      if (!client) gateway = 'offline';
      else if (row.status === 'open' || row.status === 'seen') {
        try {
          const status = await client.getStatus(row.providerPaymentId);
          gateway = fromGateway(status.state);
          if (status.state === 'seen' || status.state === 'confirmed') {
            row = repo.updateCollection(firm, id, {
              status: 'seen',
              seenUtr: status.utr ?? row.seenUtr,
              seenAt: row.seenAt ?? repo.now(),
            });
          } else if (
            row.status === 'open' &&
            (status.state === 'failed' ||
              status.state === 'expired' ||
              status.state === 'cancelled')
          ) {
            row = repo.updateCollection(firm, id, {
              status: status.state === 'failed' ? 'failed' : status.state,
            });
          }
        } catch {
          gateway = 'offline';
        }
      }
    } else if (row.status === 'open' && Date.parse(row.expiresAt) < Date.now()) {
      row = repo.updateCollection(firm, id, { status: 'expired' });
    }
    return { collection: await view(firm, row), gateway };
  }

  async function cancel(firm: number, id: number): Promise<void> {
    const row = repo.collection(firm, id);
    if (!['open', 'seen', 'expired'].includes(row.status)) return;
    repo.updateCollection(firm, id, { status: 'cancelled' });
    const client = store.client(firm);
    if (client && row.providerPaymentId && row.status === 'open')
      await client.cancel(row.providerPaymentId).catch(() => {});
  }

  /** Records the Payment-In for a collection, always after the owner clicks. */
  function record(firm: number, id: number, input: RecordInput): RecordOutcome {
    const row = repo.collection(firm, id);
    if (!['open', 'seen', 'expired'].includes(row.status) || row.invoiceTxnId === null)
      return { ok: false, reason: 'notRecordable' };
    const observed = row.provider === 'youpi' && row.status === 'seen';
    const utr = input.utr.trim(),
      last4 = input.last4.trim();
    if (!isValidLast4(last4)) return { ok: false, reason: 'badLast4' };
    if ((!observed || utr) && !isValidUtr(utr)) return { ok: false, reason: 'badUtr' };
    const { doc } = invoiceLabel(firm, row.invoiceTxnId);
    if (doc.partyId === null) return { ok: false, reason: 'noParty' };
    if (row.amount > doc.balance || doc.status !== 'posted' || doc.deletedAt)
      return { ok: false, reason: 'overpayment' };
    if (utr && repo.utrInUse(firm, utr)) return { ok: false, reason: 'duplicateUtr' };
    const account = sales.accounts(firm).find((a) => a.type === 'upi');
    if (!account) return { ok: false, reason: 'storage' };
    const settings = firms.getSettings(firm);
    const prefix = String(settings['prefix.payment_in'] ?? 'RCPT-');
    try {
      const txnId = sales.receipt(
        firm,
        {
          type: 'payment_in',
          attachmentIds: [],
          chequeDate: '',
          partyId: doc.partyId,
          amount: row.amount,
          discount: 0,
          accountId: account.id,
          date: today(),
          prefix,
          number: sales.next(firm, 'payment_in', prefix),
          description: utr ? `UPI ${utr}` : 'UPI',
          reference: utr,
          allocations: [{ invoiceId: row.invoiceTxnId, amount: row.amount }],
          auto: false,
        },
        undefined,
        (paymentTxnId) => {
          repo.addConfirmation({
            txnId: paymentTxnId,
            firmId: firm,
            state: observed ? 'observed' : 'recorded',
            utr,
            payerLast4: last4,
            source: observed ? 'youpi' : 'manual',
            collectionId: row.id,
            providerPaymentId: row.providerPaymentId,
            recordedAt: repo.now(),
          });
          repo.updateCollection(firm, row.id, {
            status: 'recorded',
            paymentTxnId,
            seenUtr: utr || row.seenUtr,
          });
        },
      );
      return { ok: true, paymentTxnId: txnId };
    } catch (error) {
      if (error instanceof Error && ['overpayment', 'allocation'].includes(error.message))
        return { ok: false, reason: 'overpayment' };
      return { ok: false, reason: 'storage' };
    }
  }

  function confirmTxn(firm: number, txnId: number, by: 'youpi' | 'statement', note = '') {
    context.sqlite.transaction(() => {
      repo.setConfirmation(txnId, {
        state: 'confirmed',
        confirmedAt: repo.now(),
        confirmedBy: by,
        statementNote: note || null,
      });
      firms.audit(firm, 'payment_confirmations', txnId, 'confirm', null, { by, note });
    })();
  }

  /** Re-checks recorded "seen" payments with YouPI and upgrades the ones the bank statement confirmed. */
  async function sync(firm: number): Promise<SyncResult> {
    const client = store.client(firm);
    if (!client) return { checked: 0, confirmed: 0 };
    const live = new Set(repo.livePayments(firm).map((p) => p.txn.id));
    let checked = 0,
      confirmed = 0;
    for (const c of repo.observedConfirmations(firm)) {
      if (!c.providerPaymentId || !live.has(c.txnId)) continue;
      checked++;
      try {
        const status = await client.getStatus(c.providerPaymentId);
        if (status.state === 'confirmed') {
          confirmTxn(firm, c.txnId, 'youpi', 'YouPI-PG reconciled with bank statement');
          confirmed++;
        }
      } catch (error) {
        if (error instanceof YoupiError && ['unreachable', 'timeout', 'auth'].includes(error.code))
          break;
      }
    }
    return { checked, confirmed };
  }

  /** Applies a verified webhook. Returns true when it belonged to one of our orders. */
  function applyWebhook(firm: number, payload: WebhookPayload): boolean {
    const row = repo.collectionByOrder(firm, payload.orderId);
    if (!row || (payload.amountPaise && payload.amountPaise !== row.amount)) return false;
    const utr = isValidUtr(payload.utr) ? payload.utr : '';
    if (payload.event === 'OBSERVED_SUCCESS' && row.status === 'open')
      repo.updateCollection(firm, row.id, {
        status: 'seen',
        seenUtr: utr || row.seenUtr,
        seenAt: repo.now(),
      });
    if (payload.event === 'RECONCILED' || payload.settlementState === 'RECONCILED') {
      if (row.paymentTxnId && repo.confirmation(row.paymentTxnId)?.state !== 'confirmed')
        confirmTxn(firm, row.paymentTxnId, 'youpi', 'YouPI-PG webhook: reconciled');
      else if (row.status === 'open')
        repo.updateCollection(firm, row.id, { status: 'seen', seenUtr: utr || row.seenUtr });
    }
    return true;
  }

  return { start, poll, cancel, record, sync, applyWebhook, confirmTxn };
}
export type CollectService = ReturnType<typeof collectService>;
