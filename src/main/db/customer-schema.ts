import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const partyRates = sqliteTable(
  'party_rates',
  {
    firmId: integer('firm_id').notNull(),
    partyId: integer('party_id').notNull(),
    itemId: integer('item_id').notNull(),
    source: text('source').notNull().default('special'),
    price: integer('price').notNull(),
    inclusive: integer('inclusive', { mode: 'boolean' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.firmId, t.partyId, t.itemId] })],
);
export const recurringInvoices = sqliteTable('recurring_invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  sourceId: integer('source_id').notNull(),
  frequency: text('frequency').notNull(),
  day: integer('day').notNull(),
  start: text('start').notNull(),
  end: text('end').notNull(),
  mode: text('mode').notNull(),
  next: text('next').notNull(),
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  error: text('error').notNull().default(''),
});
export const loyaltyEntries = sqliteTable('loyalty_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  partyId: integer('party_id').notNull(),
  txnId: integer('txn_id').notNull(),
  date: text('date').notNull(),
  points: integer('points').notNull(),
  kind: text('kind').notNull(),
});
