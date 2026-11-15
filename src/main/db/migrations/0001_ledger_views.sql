CREATE VIEW party_balances AS
SELECT p.id, p.firm_id, p.opening_balance +
 COALESCE((SELECT SUM(CASE t.type WHEN 'sale' THEN t.total WHEN 'purchase_return' THEN t.total WHEN 'payment_out' THEN t.total WHEN 'purchase' THEN -t.total WHEN 'sale_return' THEN -t.total WHEN 'payment_in' THEN -t.total ELSE 0 END)
 FROM txns t WHERE t.party_id=p.id AND t.firm_id=p.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0)
 - COALESCE((SELECT SUM(CASE t.type WHEN 'sale' THEN pay.amount WHEN 'purchase' THEN -pay.amount WHEN 'sale_return' THEN -pay.amount WHEN 'purchase_return' THEN pay.amount ELSE 0 END)
 FROM txn_payments pay JOIN txns t ON t.id=pay.txn_id WHERE t.party_id=p.id AND t.firm_id=p.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0) AS balance
 FROM parties p WHERE p.deleted_at IS NULL;
--> statement-breakpoint
CREATE VIEW account_balances AS
SELECT a.id, a.firm_id, a.type, a.opening_balance + COALESCE((SELECT SUM(p.amount*p.direction) FROM txn_payments p JOIN txns t ON t.id=p.txn_id WHERE p.account_id=a.id AND t.firm_id=a.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0) AS balance
 FROM payment_accounts a WHERE a.deleted_at IS NULL;
--> statement-breakpoint
CREATE VIEW stock_balances AS
SELECT s.firm_id,s.item_id,s.godown_id, SUM(s.qty) AS qty, SUM(s.value) AS value FROM stock_ledger s
 JOIN items i ON i.id=s.item_id LEFT JOIN txns t ON t.id=s.txn_id
 WHERE s.deleted_at IS NULL AND i.deleted_at IS NULL AND (s.txn_id IS NULL OR (t.deleted_at IS NULL AND t.status='posted'))
 GROUP BY s.firm_id,s.item_id,s.godown_id;
