CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`filename` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`date_range_start` text,
	`date_range_end` text,
	`transaction_count` integer NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_id` text REFERENCES imports(id);