CREATE INDEX IF NOT EXISTS txn_payments_txn ON txn_payments(txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS txn_payments_account ON txn_payments(account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_links_invoice ON payment_links(invoice_txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_links_payment ON payment_links(payment_txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS txns_ref ON txns(ref_txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS txns_firm_type_date ON txns(firm_id, type, date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS txn_lines_txn ON txn_lines(txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS txn_lines_item ON txn_lines(item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_ledger_item_date ON stock_ledger(item_id, date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cheques_txn ON cheques(txn_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS additional_charges_txn ON additional_charges(txn_id);
