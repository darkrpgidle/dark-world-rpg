DROP TABLE `game_saves`;
--> statement-breakpoint
CREATE TABLE `game_saves` (
	`player_id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
