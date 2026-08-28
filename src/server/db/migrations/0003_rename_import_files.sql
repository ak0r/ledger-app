ALTER TABLE `imports` RENAME TO `import_files`;
--> statement-breakpoint
ALTER TABLE `transactions` RENAME COLUMN `import_id` TO `import_file_id`;
