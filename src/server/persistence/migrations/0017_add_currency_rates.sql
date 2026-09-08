CREATE TABLE `credit_card_details` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`credit_limit_minor` integer,
	`statement_end_day` integer,
	`due_day` integer,
	`network` text,
	`last4` text,
	`expiration_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credit_card_statement_end_day_range" CHECK("credit_card_details"."statement_end_day" IS NULL OR ("credit_card_details"."statement_end_day" BETWEEN 1 AND 31)),
	CONSTRAINT "credit_card_due_day_range" CHECK("credit_card_details"."due_day" IS NULL OR ("credit_card_details"."due_day" BETWEEN 1 AND 31))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_card_details_account_id_unique` ON `credit_card_details` (`account_id`);--> statement-breakpoint
CREATE TABLE `currency_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`currency_id` text NOT NULL,
	`date` text NOT NULL,
	`rate_num` integer NOT NULL,
	`rate_denom` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "currency_rate_num_positive" CHECK("currency_rates"."rate_num" > 0),
	CONSTRAINT "currency_rate_denom_positive" CHECK("currency_rates"."rate_denom" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_currency_rate_currency_date` ON `currency_rates` (`currency_id`,`date`);--> statement-breakpoint
CREATE TABLE `loan_details` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`original_amount_minor` integer,
	`disbursed_amount_minor` integer,
	`interest_rate_bps` integer,
	`tenure_months` integer,
	`emi_amount_minor` integer,
	`emi_day` integer,
	`start_date` text,
	`maturity_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "loan_emi_day_range" CHECK("loan_details"."emi_day" IS NULL OR ("loan_details"."emi_day" BETWEEN 1 AND 31))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_details_account_id_unique` ON `loan_details` (`account_id`);