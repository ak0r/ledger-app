ALTER TABLE `accounts` DROP COLUMN `instrument_type`;--> statement-breakpoint
ALTER TABLE `postings` DROP COLUMN `debit`;--> statement-breakpoint
ALTER TABLE `postings` DROP COLUMN `credit`;--> statement-breakpoint
ALTER TABLE `postings` DROP COLUMN `quantity`;--> statement-breakpoint
ALTER TABLE `postings` DROP COLUMN `price`;