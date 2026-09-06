CREATE TABLE `account_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`identifier` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `import_files` ADD `account_id` text REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `import_files` ADD `new_account_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_files` ADD `inflow_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_files` ADD `outflow_minor` integer DEFAULT 0 NOT NULL;