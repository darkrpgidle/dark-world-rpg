CREATE TABLE `world_boss_damage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`account_id` text NOT NULL,
	`damage` integer NOT NULL,
	`snapshot` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_world_boss_events_cycle` ON `world_boss_damage_events` (`cycle`,`account_id`);--> statement-breakpoint
CREATE TABLE `world_boss_reward_mails` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`account_id` text NOT NULL,
	`rank` integer NOT NULL,
	`mail` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`delivered_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_world_boss_mail_account` ON `world_boss_reward_mails` (`account_id`,`delivered_at`);--> statement-breakpoint
CREATE TABLE `world_boss_settlements` (
	`cycle` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`winners` text NOT NULL,
	`completed_at` text NOT NULL
);
