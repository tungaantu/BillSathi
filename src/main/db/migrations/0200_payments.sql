CREATE TABLE `payment_settings` (
	`firm_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`firm_id`, `key`),
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `upi_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`firm_id` integer NOT NULL,
	`invoice_txn_id` integer,
	`party_id` integer,
	`attempt` integer DEFAULT 1 NOT NULL,
	`ref` text NOT NULL,
	`amount` integer NOT NULL,
	`upi_id` text NOT NULL,
	`payee_name` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`order_id` text,
	`provider_payment_id` text,
	`checkout_url` text,
	`status` text DEFAULT 'open' NOT NULL,
	`seen_utr` text,
	`seen_at` text,
	`payment_txn_id` integer,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK (`status` IN ('open','seen','recorded','expired','cancelled','failed')),
	CHECK (typeof(`amount`) = 'integer' AND `amount` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upi_collection_order` ON `upi_collections` (`firm_id`,`order_id`);
--> statement-breakpoint
CREATE INDEX `upi_collection_invoice` ON `upi_collections` (`invoice_txn_id`);
--> statement-breakpoint
CREATE TABLE `payment_confirmations` (
	`txn_id` integer PRIMARY KEY NOT NULL,
	`firm_id` integer NOT NULL,
	`state` text NOT NULL,
	`utr` text DEFAULT '' NOT NULL,
	`payer_last4` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`collection_id` integer,
	`provider_payment_id` text,
	`recorded_at` text NOT NULL,
	`confirmed_at` text,
	`confirmed_by` text,
	`statement_note` text,
	FOREIGN KEY (`txn_id`) REFERENCES `txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `upi_collections`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK (`state` IN ('recorded','observed','confirmed')),
	CHECK (`source` IN ('manual','youpi','statement'))
);
--> statement-breakpoint
CREATE INDEX `payment_confirmation_firm_state` ON `payment_confirmations` (`firm_id`,`state`);
