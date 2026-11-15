import type { Result } from './types';
import type { PaymentBadge } from './upi-utils';

export type { PaymentBadge };

/** Settings → Payments, as shown in the form. Secrets are never sent to the screen. */
export interface PaymentConfig {
  /** Firm UPI ID (edited in Business Profile; echoed here). */
  upiId: string;
  payeeName: string;
  youpiEnabled: boolean;
  baseUrl: string;
  merchantId: string;
  hasApiKey: boolean;
  hasAdminToken: boolean;
  hasWebhookSecret: boolean;
  webhookEnabled: boolean;
  webhookPort: number;
  /** False when Windows secure storage is unavailable; secrets cannot be saved then. */
  secureStorage: boolean;
}
/** For secrets: undefined keeps the saved value, '' removes it, anything else replaces it. */
export interface PaymentConfigInput {
  payeeName: string;
  youpiEnabled: boolean;
  baseUrl: string;
  merchantId: string;
  apiKey?: string;
  adminToken?: string;
  webhookSecret?: string;
  webhookEnabled: boolean;
  webhookPort: number;
}
export type YoupiProblem =
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'mismatch'
  | 'busy'
  | 'blocked'
  | 'observers'
  | 'rejected'
  | 'notFound'
  | 'badResponse'
  | 'server'
  | 'config'
  | 'noSecureStorage';
export type TestOutcome =
  | {
      ok: true;
      tier: 'green' | 'yellow' | 'red' | 'unknown';
      smsHealthy: boolean;
      gmailHealthy: boolean;
      credentials: 'ok' | 'missing';
    }
  | { ok: false; problem: YoupiProblem };

export type CollectionStatus = 'open' | 'seen' | 'recorded' | 'expired' | 'cancelled' | 'failed';
export interface CollectionView {
  id: number;
  invoiceId: number;
  invoiceLabel: string;
  partyName: string;
  hasParty: boolean;
  amount: number;
  balance: number;
  upiId: string;
  payeeName: string;
  ref: string;
  link: string;
  /** PNG data URL of the QR code. */
  qr: string;
  createdAt: string;
  expiresAt: string;
  provider: 'manual' | 'youpi';
  status: CollectionStatus;
  seenUtr: string;
  checkoutUrl: string;
  /** Set when YouPI was wanted but could not be used for this payment. */
  youpiProblem: YoupiProblem | null;
  paymentTxnId: number | null;
}
export type StartOutcome =
  | { ok: true; collection: CollectionView }
  | { ok: false; reason: 'noUpiId' | 'notPayable' | 'badAmount' };
export interface PollResult {
  collection: CollectionView;
  /** What YouPI says right now; 'offline' when it cannot be reached; 'manual' when not used. */
  gateway:
    | 'manual'
    | 'offline'
    | 'waiting'
    | 'seen'
    | 'confirmed'
    | 'review'
    | 'failed'
    | 'expired'
    | 'cancelled';
}
export interface RecordInput {
  utr: string;
  last4: string;
}
export type RecordOutcome =
  | { ok: true; paymentTxnId: number }
  | {
      ok: false;
      reason:
        | 'badUtr'
        | 'badLast4'
        | 'noParty'
        | 'notRecordable'
        | 'overpayment'
        | 'duplicateUtr'
        | 'storage';
    };
export interface BadgeMap {
  invoices: Record<number, PaymentBadge>;
  payments: Record<number, PaymentBadge>;
}
export interface UpiAlertData {
  /** Recorded UPI payments that were only seen in a bank alert. */
  seenRecorded: number;
  seenRecordedAmount: number;
  /** Payments seen by the gateway but not recorded yet. */
  waitingToRecord: number;
}
export interface SyncResult {
  checked: number;
  confirmed: number;
}

/* ---------- Bank statement matching ---------- */
/** Column positions in the sheet, -1 when the column does not exist. */
export interface StatementMapping {
  date: number;
  narration: number;
  credit: number;
  debit: number;
  utr: number;
}
export interface StatementLine {
  index: number;
  date: string;
  description: string;
  creditPaise: number;
  debitPaise: number;
  utrs: string[];
}
export interface PaymentCandidate {
  txnId: number;
  date: string;
  amountPaise: number;
  utr: string;
  label: string;
}
export interface MatchEntry {
  line: StatementLine;
  candidate: PaymentCandidate;
  reason: 'utr' | 'amountDate';
}
export interface PossibleEntry {
  line: StatementLine;
  candidates: PaymentCandidate[];
  reason: 'amountDiffers' | 'ambiguous';
}
export interface MatchGroups {
  matched: MatchEntry[];
  possible: PossibleEntry[];
  unmatched: StatementLine[];
}
export interface MatchResult extends MatchGroups {
  /** Credits found in the file, and Payment-Ins that are still waiting for a bank match. */
  creditCount: number;
  openPayments: number;
}
export interface StatementPreview {
  token: string;
  fileName: string;
  headers: string[];
  sample: string[][];
  rowCount: number;
  mapping: StatementMapping | null;
}
export interface PushOutcome {
  ok: boolean;
  problem?: YoupiProblem;
  reconciled: number;
  conflicts: number;
  unmatched: number;
}
export interface StatementPick {
  txnId: number;
  lineIndex: number;
}

export interface PaymentsApi {
  config(firm: number): Promise<Result<PaymentConfig>>;
  saveConfig(firm: number, input: PaymentConfigInput): Promise<Result<PaymentConfig>>;
  testYoupi(firm: number, draft: PaymentConfigInput): Promise<Result<TestOutcome>>;
  start(firm: number, invoiceId: number, amount: number): Promise<Result<StartOutcome>>;
  poll(firm: number, id: number): Promise<Result<PollResult>>;
  cancel(firm: number, id: number): Promise<Result<void>>;
  record(firm: number, id: number, input: RecordInput): Promise<Result<RecordOutcome>>;
  openCheckout(firm: number, id: number): Promise<Result<boolean>>;
  display(firm: number, id: number, show: boolean): Promise<Result<boolean>>;
  badges(firm: number): Promise<Result<BadgeMap>>;
  alert(firm: number): Promise<Result<UpiAlertData>>;
  sync(firm: number): Promise<Result<SyncResult>>;
  statementOpen(firm: number): Promise<Result<StatementPreview | null>>;
  statementMatch(
    firm: number,
    token: string,
    mapping: StatementMapping,
  ): Promise<Result<MatchResult>>;
  statementConfirm(
    firm: number,
    token: string,
    mapping: StatementMapping,
    picks: StatementPick[],
  ): Promise<Result<number>>;
  statementPush(
    firm: number,
    token: string,
    mapping: StatementMapping,
  ): Promise<Result<PushOutcome>>;
}
