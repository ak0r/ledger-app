-- `PRAGMA foreign_keys=OFF` (drizzle-kit's default generated statement,
-- left below for drizzle-kit's own future re-diffing) is a documented
-- SQLite no-op once a transaction is already open, and drizzle-orm's
-- migrate() wraps every pending migration file in one single transaction —
-- reproduced firsthand, twice: (1) with the plain OFF/ON pair as-is,
-- DROP TABLE `accounts` (still referenced by postings/budget_allocations/
-- account_identifiers/credit_card_details/loan_details/holdings/
-- investment_transactions/portfolio_accounts/folios) failed outright with
-- FOREIGN KEY constraint failed; (2) swapping in `defer_foreign_keys=ON`
-- (which unlike `foreign_keys` CAN toggle mid-transaction) got past the
-- DROP, but COMMIT itself then failed instead — SQLite's deferred-FK
-- violation counter gets incremented for every *other* table's row
-- referencing `accounts` the moment it's dropped, and nothing re-verifies
-- those rows once the new `accounts` table is renamed back into place, so
-- the counter stays poisoned through to COMMIT. The only actual fix:
-- `foreign_keys` must be OFF on the connection *before* migrate()'s own
-- BEGIN even starts — which a statement inside this file can never
-- achieve. This migration is NOT runnable via a plain `pnpm db:migrate`
-- (drizzle-kit's own CLI never sets foreign_keys=OFF on its connection,
-- and this project's better-sqlite3 build defaults it ON even fresh) —
-- run it via a one-off script that opens the DB, calls
-- `sqlite.pragma("foreign_keys = OFF")`, then calls migrate(), then
-- restores `foreign_keys = ON` after.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`currency_id` text NOT NULL,
	`name` text NOT NULL,
	`classification` text NOT NULL,
	`instrument_type` text NOT NULL,
	`account_type` text NOT NULL,
	`instrument_id` text,
	`instrument_label` text,
	`tags` text,
	`icon` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "profile_id", "currency_id", "name", "classification", "instrument_type", "account_type", "instrument_id", "instrument_label", "tags", "icon", "is_archived", "metadata", "created_at", "updated_at") SELECT "id", "profile_id", "currency_id", "name", "classification", "instrument_type", "account_type", "instrument_id", "instrument_label", "tags", "icon", "is_archived", "metadata", "created_at", "updated_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_account_identity` ON `accounts` (`profile_id`,`classification`,`account_type`,`name`);--> statement-breakpoint
CREATE TABLE `__new_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit` integer DEFAULT 0 NOT NULL,
	`credit` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`price` real DEFAULT 1 NOT NULL,
	`units` integer NOT NULL,
	`price_num` integer NOT NULL,
	`price_denom` integer NOT NULL,
	`base_amount` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "posting_price_num_positive" CHECK("__new_postings"."price_num" > 0),
	CONSTRAINT "posting_price_denom_positive" CHECK("__new_postings"."price_denom" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_postings`("id", "transaction_id", "account_id", "debit", "credit", "quantity", "price", "units", "price_num", "price_denom", "base_amount", "created_at", "updated_at") SELECT "id", "transaction_id", "account_id", "debit", "credit", "quantity", "price", "units", "price_num", "price_denom", "base_amount", "created_at", "updated_at" FROM `postings`;--> statement-breakpoint
DROP TABLE `postings`;--> statement-breakpoint
ALTER TABLE `__new_postings` RENAME TO `postings`;--> statement-breakpoint
-- Restores FK enforcement. A no-op under drizzle-orm's migrate() (still
-- inside the one big transaction the runner script's own external
-- `foreign_keys = ON` reasserts after COMMIT regardless) but load-bearing
-- for any consumer that applies migration files individually outside a
-- single wrapping transaction (e.g. this codebase's own test harness,
-- `server/testing/createTestDb.ts`, which `.exec()`s each file directly on
-- a connection it never reopens) — without this, every `ON DELETE CASCADE`
-- on this connection would stay silently disabled for its entire
-- remaining lifetime. Reproduced firsthand: deleteTransaction's own
-- postings-cascade test failed until this line was restored.
PRAGMA foreign_keys=ON;