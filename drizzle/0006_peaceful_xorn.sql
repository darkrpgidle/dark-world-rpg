CREATE TABLE `gm_action_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gm_account_id` text NOT NULL,
	`target_account_id` text,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gm_action_logs_created_at` ON `gm_action_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_gm_action_logs_target_account_id` ON `gm_action_logs` (`target_account_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `suspended_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `suspended_until` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `suspension_reason` text;