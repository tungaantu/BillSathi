CREATE TABLE party_rates (firm_id INTEGER NOT NULL REFERENCES firms(id), party_id INTEGER NOT NULL REFERENCES parties(id), item_id INTEGER NOT NULL REFERENCES items(id), source TEXT NOT NULL DEFAULT 'special', price INTEGER NOT NULL CHECK(price>=0), inclusive INTEGER NOT NULL, PRIMARY KEY(firm_id,party_id,item_id));
--> statement-breakpoint
CREATE TABLE recurring_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, firm_id INTEGER NOT NULL REFERENCES firms(id), source_id INTEGER NOT NULL REFERENCES txns(id) ON DELETE CASCADE, frequency TEXT NOT NULL, day INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, mode TEXT NOT NULL, next TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
--> statement-breakpoint
CREATE TABLE loyalty_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, firm_id INTEGER NOT NULL REFERENCES firms(id), party_id INTEGER NOT NULL REFERENCES parties(id), txn_id INTEGER NOT NULL REFERENCES txns(id) ON DELETE CASCADE, date TEXT NOT NULL, points INTEGER NOT NULL, kind TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX loyalty_party ON loyalty_entries(firm_id,party_id);
--> statement-breakpoint
DROP VIEW party_balances;
--> statement-breakpoint
DROP VIEW account_balances;
--> statement-breakpoint
CREATE VIEW party_balances AS
SELECT p.id, p.firm_id, p.opening_balance +
 COALESCE((SELECT SUM(CASE t.type WHEN 'other_income' THEN t.total WHEN 'expense' THEN -t.total WHEN 'sale' THEN t.total WHEN 'purchase_return' THEN t.total WHEN 'payment_out' THEN t.total WHEN 'purchase' THEN -t.total WHEN 'sale_return' THEN -t.total WHEN 'payment_in' THEN -t.total ELSE 0 END)
 FROM txns t WHERE t.party_id=p.id AND t.firm_id=p.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0)
 - COALESCE((SELECT SUM(CASE t.type WHEN 'sale_order' THEN pay.amount WHEN 'other_income' THEN pay.amount WHEN 'expense' THEN -pay.amount WHEN 'sale' THEN pay.amount WHEN 'purchase' THEN -pay.amount WHEN 'sale_return' THEN -pay.amount WHEN 'purchase_return' THEN pay.amount ELSE 0 END)
 FROM txn_payments pay JOIN txns t ON t.id=pay.txn_id WHERE pay.reversed=0 AND t.party_id=p.id AND t.firm_id=p.firm_id AND (t.status='posted' OR (t.type='sale_order' AND t.status IN ('open','closed'))) AND t.deleted_at IS NULL),0) AS balance
 FROM parties p WHERE p.deleted_at IS NULL;
--> statement-breakpoint
CREATE VIEW account_balances AS
SELECT a.id, a.firm_id, a.type, a.opening_balance + COALESCE((SELECT SUM(p.amount*p.direction) FROM txn_payments p JOIN txns t ON t.id=p.txn_id WHERE p.reversed=0 AND p.account_id=a.id AND t.firm_id=a.firm_id AND (t.status='posted' OR (t.type='sale_order' AND t.status IN ('open','closed'))) AND t.deleted_at IS NULL),0) AS balance
 FROM payment_accounts a WHERE a.deleted_at IS NULL;

--> statement-breakpoint
DROP VIEW stock_balances;
--> statement-breakpoint
CREATE VIEW stock_balances AS
SELECT s.firm_id,s.item_id,s.godown_id,SUM(s.qty) AS qty,SUM(s.value) AS value FROM stock_ledger s
JOIN items i ON i.id=s.item_id LEFT JOIN txns t ON t.id=s.txn_id
WHERE s.deleted_at IS NULL AND i.deleted_at IS NULL AND (s.txn_id IS NULL OR (t.deleted_at IS NULL AND (t.status='posted' OR (t.type IN ('delivery_challan','challan_return') AND t.status IN ('open','closed')))))
GROUP BY s.firm_id,s.item_id,s.godown_id;
