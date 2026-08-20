CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`app_user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`app_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`app_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
