ALTER TABLE payment_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE expense_categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense';
--> statement-breakpoint
ALTER TABLE txn_payments ADD COLUMN reversed INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE txn_payments ADD COLUMN posting_date TEXT;
--> statement-breakpoint
ALTER TABLE cheques ADD COLUMN payment_id INTEGER REFERENCES txn_payments(id);
--> statement-breakpoint
ALTER TABLE cheques ADD COLUMN settled_account_id INTEGER REFERENCES payment_accounts(id);
--> statement-breakpoint
ALTER TABLE cheques ADD COLUMN action_date TEXT;
--> statement-breakpoint
DROP VIEW party_balances;
--> statement-breakpoint
DROP VIEW account_balances;
--> statement-breakpoint
CREATE VIEW party_balances AS
SELECT p.id, p.firm_id, p.opening_balance +
 COALESCE((SELECT SUM(CASE t.type WHEN 'other_income' THEN t.total WHEN 'expense' THEN -t.total WHEN 'sale' THEN t.total WHEN 'purchase_return' THEN t.total WHEN 'payment_out' THEN t.total WHEN 'purchase' THEN -t.total WHEN 'sale_return' THEN -t.total WHEN 'payment_in' THEN -t.total ELSE 0 END)
 FROM txns t WHERE t.party_id=p.id AND t.firm_id=p.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0)
 - COALESCE((SELECT SUM(CASE t.type WHEN 'other_income' THEN pay.amount WHEN 'expense' THEN -pay.amount WHEN 'sale' THEN pay.amount WHEN 'purchase' THEN -pay.amount WHEN 'sale_return' THEN -pay.amount WHEN 'purchase_return' THEN pay.amount ELSE 0 END)
 FROM txn_payments pay JOIN txns t ON t.id=pay.txn_id WHERE pay.reversed=0 AND t.party_id=p.id AND t.firm_id=p.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0) AS balance
 FROM parties p WHERE p.deleted_at IS NULL;
--> statement-breakpoint
CREATE VIEW account_balances AS
SELECT a.id, a.firm_id, a.type, a.opening_balance + COALESCE((SELECT SUM(p.amount*p.direction) FROM txn_payments p JOIN txns t ON t.id=p.txn_id WHERE p.reversed=0 AND p.account_id=a.id AND t.firm_id=a.firm_id AND t.status='posted' AND t.deleted_at IS NULL),0) AS balance
 FROM payment_accounts a WHERE a.deleted_at IS NULL;
