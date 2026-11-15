CREATE TABLE `additional_charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`txn_id` integer,
	`name` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`tax_bps` integer DEFAULT 0,
	`taxable` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`cess` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`txn_id` integer,
	`entity_type` text,
	`entity_id` integer,
	`path` text NOT NULL,
	`mime` text,
	`name` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`at` text NOT NULL,
	`actor` text DEFAULT 'owner' NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`number` text NOT NULL,
	`mfg_date` text,
	`exp_date` text,
	`mrp` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cheques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`txn_id` integer,
	`account_id` integer,
	`number` text NOT NULL,
	`bank` text,
	`date` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`direction` text NOT NULL,
	`status` text DEFAULT 'open',
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `payment_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`name` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `firms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`state_code` text NOT NULL,
	`gstin` text DEFAULT '' NOT NULL,
	`pan` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`account_number` text DEFAULT '' NOT NULL,
	`ifsc` text DEFAULT '' NOT NULL,
	`upi_id` text DEFAULT '' NOT NULL,
	`logo` text,
	`signature` text,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `godowns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`name` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`category_id` integer,
	`name` text NOT NULL,
	`type` text DEFAULT 'product' NOT NULL,
	`code` text,
	`barcode` text,
	`hsn` text,
	`unit_id` integer,
	`secondary_unit_id` integer,
	`tax_rate_id` integer,
	`cess_bps` integer DEFAULT 0 NOT NULL,
	`sale_price` integer DEFAULT 0 NOT NULL,
	`purchase_price` integer DEFAULT 0 NOT NULL,
	`wholesale_price` integer DEFAULT 0 NOT NULL,
	`mrp` integer DEFAULT 0 NOT NULL,
	`inclusive` integer DEFAULT false,
	`discount_bps` integer DEFAULT 0,
	`wholesale_qty` real DEFAULT 0,
	`min_stock` real DEFAULT 0,
	`location` text,
	`image` text,
	`custom_fields` text DEFAULT '{}',
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`secondary_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_firm_name` ON `items` (`firm_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_firm_code` ON `items` (`firm_id`,`code`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`party_id` integer,
	`account_id` integer,
	`name` text NOT NULL,
	`principal` integer DEFAULT 0 NOT NULL,
	`interest_bps` integer DEFAULT 0,
	`emi` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`end_date` text,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `payment_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`group_id` integer,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`gst_type` text DEFAULT 'consumer',
	`gstin` text,
	`state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_date` text,
	`credit_limit` integer,
	`custom_fields` text DEFAULT '{}',
	`active` integer DEFAULT true,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `party_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `parties_firm_name` ON `parties` (`firm_id`,`name`);--> statement-breakpoint
CREATE TABLE `party_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`name` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`bank_name` text,
	`account_number` text,
	`ifsc` text,
	`upi_id` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_date` text,
	`print_on_invoice` integer DEFAULT false,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_txn_id` integer NOT NULL,
	`invoice_txn_id` integer NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`payment_txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`serial` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`txn_line_id` integer,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_line_id`) REFERENCES `txn_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_firm` ON `serials` (`firm_id`,`serial`);--> statement-breakpoint
CREATE TABLE `settings` (
	`firm_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`firm_id`, `key`),
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `states` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hindi` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`godown_id` integer,
	`batch_id` integer,
	`txn_id` integer,
	`txn_line_id` integer,
	`date` text NOT NULL,
	`qty` real NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`godown_id`) REFERENCES `godowns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`txn_line_id`) REFERENCES `txn_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_item` ON `stock_ledger` (`firm_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`exempt` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_kind_rate` ON `tax_rates` (`kind`,`rate_bps`,`exempt`);--> statement-breakpoint
CREATE TABLE `txn_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`txn_id` integer NOT NULL,
	`item_id` integer,
	`name` text NOT NULL,
	`hsn` text,
	`qty` real NOT NULL,
	`free_qty` real DEFAULT 0,
	`unit_id` integer,
	`price` integer DEFAULT 0 NOT NULL,
	`inclusive` integer DEFAULT false,
	`discount` integer DEFAULT 0 NOT NULL,
	`discount_bps` integer DEFAULT 0,
	`tax_bps` integer DEFAULT 0,
	`cess_bps` integer DEFAULT 0,
	`taxable` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`cess` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `txn_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`txn_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`direction` integer NOT NULL,
	`reference` text,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `payment_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `txns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`type` text NOT NULL,
	`party_id` integer,
	`prefix` text DEFAULT '' NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`due_date` text,
	`place_of_supply` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`ref_txn_id` integer,
	`expense_category_id` integer,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`taxable` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`cess` integer DEFAULT 0 NOT NULL,
	`charges` integer DEFAULT 0 NOT NULL,
	`round_off` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`reverse_charge` integer DEFAULT false,
	`itc_eligible` integer DEFAULT true,
	`description` text,
	`terms` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `txn_number` ON `txns` (`firm_id`,`type`,`prefix`,`number`);--> statement-breakpoint
CREATE INDEX `txn_firm_date` ON `txns` (`firm_id`,`date`);--> statement-breakpoint
CREATE INDEX `txn_party` ON `txns` (`party_id`);--> statement-breakpoint
CREATE TABLE `unit_conversions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`from_unit` integer NOT NULL,
	`to_unit` integer NOT NULL,
	`factor` real NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_unit`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_unit`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`standard` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_symbol_unique` ON `units` (`symbol`);