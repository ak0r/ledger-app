CREATE TABLE `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`unit_label` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
