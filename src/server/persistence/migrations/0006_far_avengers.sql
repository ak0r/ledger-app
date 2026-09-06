CREATE TABLE `budget_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_period_id` text NOT NULL,
	`expense_account_id` text NOT NULL,
	`target_amount_minor` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`budget_period_id`) REFERENCES `budget_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budget_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`scope_snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`recurrence_unit` text,
	`recurrence_interval` integer,
	`recurrence_start_date` text,
	`recurrence_end_date` text,
	`recurrence_occurrences` integer,
	`explicit_account_ids` text,
	`filter_match` text,
	`filter_conditions` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
