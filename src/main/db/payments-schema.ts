import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
/** Tables added by migration 0200_payments.sql (UPI collection and confirmation). */
export const paymentSettings = sqliteTable(
  'payment_settings',
  {
    firmId: integer('firm_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.firmId, t.key] })],
);
export const upiCollections = sqliteTable('upi_collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  invoiceTxnId: integer('invoice_txn_id'),
  partyId: integer('party_id'),
  attempt: integer('attempt').notNull().default(1),
  ref: text('ref').notNull(),
  amount: integer('amount').notNull(),
  upiId: text('upi_id').notNull(),
  payeeName: text('payee_name').notNull().default(''),
  provider: text('provider').notNull().default('manual'),
  orderId: text('order_id'),
  providerPaymentId: text('provider_payment_id'),
  checkoutUrl: text('checkout_url'),
  status: text('status').notNull().default('open'),
  seenUtr: text('seen_utr'),
  seenAt: text('seen_at'),
  paymentTxnId: integer('payment_txn_id'),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const paymentConfirmations = sqliteTable('payment_confirmations', {
  txnId: integer('txn_id').primaryKey(),
  firmId: integer('firm_id').notNull(),
  state: text('state').notNull(),
  utr: text('utr').notNull().default(''),
  payerLast4: text('payer_last4').notNull().default(''),
  source: text('source').notNull(),
  collectionId: integer('collection_id'),
  providerPaymentId: text('provider_payment_id'),
  recordedAt: text('recorded_at').notNull(),
  confirmedAt: text('confirmed_at'),
  confirmedBy: text('confirmed_by'),
  statementNote: text('statement_note'),
});
