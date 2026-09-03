CREATE TABLE `backup_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`automatic_backup_enabled` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`size_bytes` integer,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL
);
