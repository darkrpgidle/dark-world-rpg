CREATE TABLE `save_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`account_id` text NOT NULL,
	`payload` text NOT NULL,
	`kind` text DEFAULT 'automatic' NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_save_snapshots_account_captured` ON `save_snapshots` (`account_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_save_snapshots_player_captured` ON `save_snapshots` (`player_id`,`captured_at`);