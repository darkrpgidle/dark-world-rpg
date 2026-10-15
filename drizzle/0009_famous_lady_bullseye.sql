CREATE TABLE `account_rebirth_entitlements` (
	`account_id` text PRIMARY KEY NOT NULL,
	`legacy_rebirth_count` integer NOT NULL,
	`tier` integer NOT NULL,
	`reset_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `global_reset_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`gm_account_id` text NOT NULL,
	`account_count` integer NOT NULL,
	`save_count` integer NOT NULL,
	`archive_count` integer NOT NULL,
	`entitlement_count` integer NOT NULL,
	`completed_at` text NOT NULL
);
