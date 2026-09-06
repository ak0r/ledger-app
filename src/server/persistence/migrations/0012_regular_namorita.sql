CREATE TABLE `folios` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_account_id` text NOT NULL,
	`number` text NOT NULL,
	`amc_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`portfolio_account_id`) REFERENCES `portfolio_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`folio_id` text,
	`as_of_date` text NOT NULL,
	`units` integer NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `investment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`folio_id` text,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`units` integer NOT NULL,
	`price` real NOT NULL,
	`amount` integer NOT NULL,
	`currency_id` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`narration` text,
	`dedup_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nav_history` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`date` text NOT NULL,
	`nav` real NOT NULL,
	`source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`provider` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `portfolio_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`filename` text,
	`source_ref` text,
	`result` text,
	`error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `profiles` ADD `pan_encrypted` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `pan_hash` text;--> statement-breakpoint
-- Idempotent re-import (schema.ts's own comment on `investment_transactions.
-- dedup_key`) — a plain unique index, not a foreign key, so this is safe to
-- add directly at CREATE TABLE time (no PRAGMA/table-recreate limitation
-- applies to indexes the way it does to FKs on an existing table).
CREATE UNIQUE INDEX `uniq_investment_transaction_profile_dedup` ON `investment_transactions` (`profile_id`,`dedup_key`) WHERE `dedup_key` IS NOT NULL;--> statement-breakpoint
-- One reference price per (instrument, date) — mirrors Folioman's own
-- NAVHistory uniqueness, and doubles as the natural index for an as-of-date
-- lookup.
CREATE UNIQUE INDEX `uniq_nav_history_instrument_date` ON `nav_history` (`instrument_id`,`date`);