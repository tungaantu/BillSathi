ALTER TABLE txns ADD godown_id INTEGER REFERENCES godowns(id);
--> statement-breakpoint
ALTER TABLE stock_ledger ADD transfer_id INTEGER;
--> statement-breakpoint
CREATE TABLE stock_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, firm_id INTEGER NOT NULL REFERENCES firms(id), number INTEGER NOT NULL, date TEXT NOT NULL, from_godown_id INTEGER NOT NULL REFERENCES godowns(id), to_godown_id INTEGER NOT NULL REFERENCES godowns(id), lines TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, deleted_at TEXT);
--> statement-breakpoint
CREATE TABLE serial_events (id INTEGER PRIMARY KEY AUTOINCREMENT, firm_id INTEGER NOT NULL REFERENCES firms(id), serial_id INTEGER NOT NULL REFERENCES serials(id), txn_id INTEGER REFERENCES txns(id), direction INTEGER NOT NULL, date TEXT NOT NULL, deleted_at TEXT);
--> statement-breakpoint
CREATE INDEX serial_events_serial ON serial_events(serial_id);
--> statement-breakpoint
CREATE INDEX serial_events_txn ON serial_events(txn_id);
--> statement-breakpoint
CREATE UNIQUE INDEX batches_item_number ON batches(firm_id,item_id,number);
--> statement-breakpoint
CREATE INDEX stock_ledger_txn ON stock_ledger(txn_id);
--> statement-breakpoint
CREATE INDEX stock_ledger_batch ON stock_ledger(firm_id,item_id,batch_id);
--> statement-breakpoint
CREATE INDEX stock_ledger_godown ON stock_ledger(firm_id,godown_id,item_id);
--> statement-breakpoint
CREATE VIEW batch_balances AS
SELECT s.firm_id,s.item_id,s.batch_id,s.godown_id,SUM(s.qty) AS qty FROM stock_ledger s
JOIN items i ON i.id=s.item_id LEFT JOIN txns t ON t.id=s.txn_id
WHERE s.deleted_at IS NULL AND i.deleted_at IS NULL AND (s.txn_id IS NULL OR (t.deleted_at IS NULL AND (t.status='posted' OR (t.type IN ('delivery_challan','challan_return') AND t.status IN ('open','closed')))))
GROUP BY s.firm_id,s.item_id,s.batch_id,s.godown_id;
