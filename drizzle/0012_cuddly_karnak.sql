CREATE TABLE `world_boss_reward_claims` (
	`mail_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`claimed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_world_boss_claim_account` ON `world_boss_reward_claims` (`account_id`);