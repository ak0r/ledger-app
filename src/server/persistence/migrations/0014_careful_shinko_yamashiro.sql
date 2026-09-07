ALTER TABLE `dashboards` ADD `context` text DEFAULT 'FINANCIAL' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_dashboard_profile_context` ON `dashboards` (`profile_id`,`context`);