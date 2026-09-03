CREATE TABLE `dashboard_panels` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`key` text NOT NULL,
	`configuration` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
