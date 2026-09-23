CREATE TABLE `death_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`account_id` text NOT NULL,
	`map_id` integer NOT NULL,
	`floor` integer NOT NULL,
	`player_class` text NOT NULL,
	`player_level` integer NOT NULL,
	`combat_power` integer NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_death_events_occurred_at` ON `death_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_death_events_map_floor` ON `death_events` (`map_id`,`floor`);