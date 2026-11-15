import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const stockTransfers = sqliteTable('stock_transfers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  number: integer('number').notNull(),
  date: text('date').notNull(),
  fromGodownId: integer('from_godown_id').notNull(),
  toGodownId: integer('to_godown_id').notNull(),
  /** JSON array of { itemId, qty, batchId }. */
  lines: text('lines').notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
});
/** Serial moves: +1 into stock (purchase, sale return), -1 out (sale, challan, purchase return). */
export const serialEvents = sqliteTable('serial_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  serialId: integer('serial_id').notNull(),
  txnId: integer('txn_id'),
  direction: integer('direction').notNull(),
  date: text('date').notNull(),
  deletedAt: text('deleted_at'),
});
/** One row per closed financial year, with the carry-forward snapshot shown at closing. */
export const fyClosings = sqliteTable('fy_closings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firmId: integer('firm_id').notNull(),
  fyStart: text('fy_start').notNull(),
  fyEnd: text('fy_end').notNull(),
  closedAt: text('closed_at').notNull(),
  backupPath: text('backup_path').notNull(),
  snapshot: text('snapshot').notNull(),
  reopenedAt: text('reopened_at'),
});
